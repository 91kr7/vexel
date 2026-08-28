// Volume listing, inspect, create, remove and prune over the Engine API
// (REQ-70, REQ-71). Size and mounting-container information are not part of
// the daemon's own /volumes listing: they are merged in from /system/df
// (per-volume UsageData) and /containers/json (each container's own Mounts).
// The sizes are held on a schedule of their own, far slower than the listing's
// (plan-docker_management_app-refresh_cache/REQ-18).
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { eventStreamService, type DaemonEvent } from "../events/event-stream-service.js";
import { byNamedThenUnnamedNewest } from "../list-order/list-order.js";
import { registerRefreshKind } from "../refresh-cache/refresh-cache.js";

export interface VolumeSummary {
  name: string;
  driver: string;
  mountpoint: string;
  scope: string;
  createdAt: string;
  labels: Record<string, string>;
  options: Record<string, string>;
  /** Undefined while no size is held for this volume yet (REQ-70, plan-docker_management_app-refresh_cache/REQ-18). */
  sizeBytes?: number;
  /** Names of the containers (running or stopped) mounting this volume; empty when unattached. */
  mountedBy: string[];
}

export interface VolumeInspect extends VolumeSummary {
  raw: unknown;
}

export interface CreateVolumeInput {
  name?: string;
  driver?: string;
  driverOpts?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface VolumePruneResult {
  removedNames: string[];
  reclaimedBytes: number;
}

interface RawVolume {
  Name: string;
  Driver: string;
  Mountpoint: string;
  Scope: string;
  CreatedAt?: string;
  Labels?: Record<string, string> | null;
  Options?: Record<string, string> | null;
}

interface RawContainerSummary {
  Names?: string[];
  Mounts?: { Type?: string; Name?: string }[];
}

interface RawDiskUsageVolume {
  Name: string;
  UsageData?: { Size?: number } | null;
}

async function readVolumeSizes(): Promise<Map<string, number>> {
  const response = await getEngineClient().request("/system/df");
  const payload = JSON.parse(response.body) as { Volumes?: RawDiskUsageVolume[] | null };
  const sizes = new Map<string, number>();
  for (const volume of payload.Volumes ?? []) {
    const size = volume.UsageData?.Size;
    if (typeof size === "number" && size >= 0) sizes.set(volume.Name, size);
  }
  return sizes;
}

/** Every container's own Mounts list, filtered to its volume-type mounts, grouped by volume name. */
async function readMountedBy(): Promise<Map<string, string[]>> {
  const response = await getEngineClient().request("/containers/json?all=true");
  const raw = JSON.parse(response.body) as RawContainerSummary[];
  const mountedBy = new Map<string, string[]>();
  for (const container of raw) {
    const name = (container.Names?.[0] ?? "").replace(/^\//, "");
    for (const mount of container.Mounts ?? []) {
      if (mount.Type !== "volume" || !mount.Name) continue;
      const names = mountedBy.get(mount.Name) ?? [];
      names.push(name);
      mountedBy.set(mount.Name, names);
    }
  }
  return mountedBy;
}

function toSummary(raw: RawVolume, sizes: Map<string, number>, mountedBy: Map<string, string[]>): VolumeSummary {
  return {
    name: raw.Name,
    driver: raw.Driver,
    mountpoint: raw.Mountpoint,
    scope: raw.Scope,
    createdAt: raw.CreatedAt ?? "",
    labels: raw.Labels ?? {},
    options: raw.Options ?? {},
    sizeBytes: sizes.get(raw.Name),
    mountedBy: mountedBy.get(raw.Name) ?? [],
  };
}

export async function listVolumes(): Promise<VolumeSummary[]> {
  const sizes = heldVolumeSizes();
  const [volumesResponse, mountedBy] = await Promise.all([
    getEngineClient().request("/volumes"),
    readMountedBy(),
  ]);
  const payload = JSON.parse(volumesResponse.body) as { Volumes?: RawVolume[] | null };
  return (payload.Volumes ?? [])
    .map((raw) => toSummary(raw, sizes, mountedBy))
    .sort(
      byNamedThenUnnamedNewest({
        name: (volume) => (isAnonymousName(volume.name) ? null : volume.name),
        createdAt: (volume) => volume.createdAt,
        identity: (volume) => volume.name,
      }),
    );
}

/**
 * The volume listing as the refresh cache keeps it: read on its own period and
 * whenever a `volume` or `container` event — a container mounting or releasing
 * a volume changes what the list shows — or one of this application's own
 * operations says so (REQ-9, REQ-11, REQ-12, REQ-13).
 */
export const volumeListCache = registerRefreshKind({
  key: "volumes",
  periodMs: 30000,
  eventTypes: ["volume", "container"],
  read: listVolumes,
});

/**
 * The per-volume sizes, held as a kind of their own on the longest period in
 * the cache: a volume's size is the slowest changing value the application
 * shows, and /system/df — the only way to obtain it — makes the daemon account
 * for the whole host's disk usage (REQ-18).
 */
export const volumeSizeCache = registerRefreshKind({
  key: "volume-sizes",
  periodMs: 300000,
  read: readVolumeSizes,
});

// Only a removal can make a size drop — writing into a volume announces
// nothing — so the sizes are marked due by the removals alone, and not by
// every `volume`/`container` event as the listing is: at this price per read,
// a container's start, stop or health check must not pay for one.
eventStreamService.on("event", (event: DaemonEvent) => {
  if (event.action !== "destroy") return;
  if (event.type === "volume" || event.type === "container") volumeSizeCache.markChanged();
});

/**
 * The sizes currently held — and demand for them either way: the read is asked
 * for and deliberately not awaited, so a listing never waits for /system/df. A
 * volume whose size is not known yet is listed without one and gains it on the
 * next read; the first sizes to arrive say the listing has changed, so they
 * show without waiting for its period (REQ-18, REQ-19).
 */
function heldVolumeSizes(): Map<string, number> {
  const held = volumeSizeCache.peek();
  void volumeSizeCache.read().then(
    () => {
      if (!held) volumeListCache.markChanged();
    },
    () => {},
  );
  return held?.value ?? new Map();
}

/**
 * The name shape the daemon generates for a volume nobody named. A volume an
 * operator deliberately named that way is grouped with the anonymous ones and
 * is not rescued by a heuristic: it is cosmetic, and the alternative is
 * scattering thousands of hex names through the named ones.
 */
const ANONYMOUS_VOLUME_NAME = /^[0-9a-fA-F]{64}$/;

function isAnonymousName(name: string): boolean {
  return ANONYMOUS_VOLUME_NAME.test(name);
}

/** `GET /volumes/{name}` itself rejects with a daemon 404 for an unknown name. */
export async function getVolumeInspect(name: string): Promise<VolumeInspect> {
  const client = getEngineClient();
  const sizes = heldVolumeSizes();
  const [inspectResponse, mountedBy] = await Promise.all([
    client.request(`/volumes/${encodeURIComponent(name)}`),
    readMountedBy(),
  ]);
  const raw = JSON.parse(inspectResponse.body) as RawVolume;
  return { ...toSummary(raw, sizes, mountedBy), raw };
}

export async function createVolume(input: CreateVolumeInput): Promise<VolumeSummary> {
  const body = JSON.stringify({
    Name: input.name && input.name.trim() !== "" ? input.name.trim() : undefined,
    Driver: input.driver && input.driver.trim() !== "" ? input.driver.trim() : undefined,
    DriverOpts: input.driverOpts && Object.keys(input.driverOpts).length > 0 ? input.driverOpts : undefined,
    Labels: input.labels && Object.keys(input.labels).length > 0 ? input.labels : undefined,
  });
  const response = await getEngineClient().request("/volumes/create", { method: "POST", body });
  const raw = JSON.parse(response.body) as RawVolume;
  volumeListCache.markChanged();
  return toSummary(raw, new Map(), new Map());
}

export async function removeVolume(name: string): Promise<void> {
  await getEngineClient().request(`/volumes/${encodeURIComponent(name)}?force=true`, { method: "DELETE" });
  volumeListCache.markChanged();
  volumeSizeCache.markChanged();
}

/** Prunes every currently unused volume, named or anonymous (`filters={"all":["true"]}`), reporting the reclaimed space. */
export async function pruneVolumes(): Promise<VolumePruneResult> {
  const filters = encodeURIComponent(JSON.stringify({ all: ["true"] }));
  const response = await getEngineClient().request(`/volumes/prune?filters=${filters}`, { method: "POST" });
  const payload = JSON.parse(response.body) as { VolumesDeleted?: string[]; SpaceReclaimed?: number };
  volumeListCache.markChanged();
  volumeSizeCache.markChanged();
  return { removedNames: payload.VolumesDeleted ?? [], reclaimedBytes: payload.SpaceReclaimed ?? 0 };
}
