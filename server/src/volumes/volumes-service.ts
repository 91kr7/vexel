// Volume listing, inspect, create, remove and prune over the Engine API
// (REQ-70, REQ-71). Size and mounting-container information are not part of
// the daemon's own /volumes listing: they are merged in from /system/df
// (per-volume UsageData) and from the container listing the server already
// holds. The sizes are one view of the held /system/df reading, on a schedule
// far slower than the listing's (plan-docker_management_app-refresh_cache/REQ-18).
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { CONTAINER_LIST_KIND, readHeldContainerList } from "../containers/containers-service.js";
import { byNamedThenUnnamedNewest } from "../list-order/list-order.js";
import { registerRefreshKind, type ReadOptions } from "../refresh-cache/refresh-cache.js";
import { diskUsageCache, heldDiskUsage } from "../system/disk-usage-service.js";

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

// Every container's own volume-type mounts, grouped by volume name — derived
// from the listing the server already holds, never from one of this service's
// own (plan-docker_management_app-refresh_cache/REQ-37). Whether that listing
// has to cover the daemon's latest announcement is the caller's to say: the
// detail asks for it and the list does not
// (plan-docker_management_app-refresh_cache/REQ-58, REQ-60).
async function readMountedBy(options?: ReadOptions): Promise<Map<string, string[]>> {
  const containers = await readHeldContainerList(options);
  const mountedBy = new Map<string, string[]>();
  for (const container of containers) {
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
 *
 * Derived from the container listing, since `mountedBy` comes from there: a
 * listing replaced by a different one makes this one read again within a
 * grouping window, instead of holding a list built on a copy already gone until
 * its own period ends (plan-docker_management_app-refresh_cache/REQ-52).
 */
export const volumeListCache = registerRefreshKind({
  key: "volumes",
  periodMs: 30000,
  eventTypes: ["volume", "container"],
  derivedFrom: CONTAINER_LIST_KIND,
  read: listVolumes,
});

/**
 * The sizes currently held, taken from the held disk accounting rather than
 * from a reading of this service's own: a listing never waits for /system/df,
 * and a volume whose size is not known yet is listed without one and gains it
 * on the next read. The first sizes to arrive say the listing has changed, so
 * they show without waiting for its period (REQ-18, REQ-19).
 */
function heldVolumeSizes(): Map<string, number> {
  const usage = heldDiskUsage(() => volumeListCache.markChanged());
  const sizes = new Map<string, number>();
  for (const volume of usage?.Volumes ?? []) {
    const size = volume.UsageData?.Size;
    if (volume.Name && typeof size === "number" && size >= 0) sizes.set(volume.Name, size);
  }
  return sizes;
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

/**
 * `GET /volumes/{name}` itself rejects with a daemon 404 for an unknown name.
 *
 * The mounting containers are asked for with coverage
 * (plan-docker_management_app-refresh_cache/REQ-58): the detail is read on
 * daemon events and on nothing else, so a request arriving on the very event
 * that marked the listing due would otherwise be answered from the copy that
 * event is replacing — and nobody would ask again. Docker's own volume inspect
 * carries no such map, which is why this is derived at all.
 */
export async function getVolumeInspect(name: string): Promise<VolumeInspect> {
  const client = getEngineClient();
  const sizes = heldVolumeSizes();
  const [inspectResponse, mountedBy] = await Promise.all([
    client.request(`/volumes/${encodeURIComponent(name)}`),
    readMountedBy({ coverNotices: true }),
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
  diskUsageCache.markChanged();
}

/** Prunes every currently unused volume, named or anonymous (`filters={"all":["true"]}`), reporting the reclaimed space. */
export async function pruneVolumes(): Promise<VolumePruneResult> {
  const filters = encodeURIComponent(JSON.stringify({ all: ["true"] }));
  const response = await getEngineClient().request(`/volumes/prune?filters=${filters}`, { method: "POST" });
  const payload = JSON.parse(response.body) as { VolumesDeleted?: string[]; SpaceReclaimed?: number };
  volumeListCache.markChanged();
  diskUsageCache.markChanged();
  return { removedNames: payload.VolumesDeleted ?? [], reclaimedBytes: payload.SpaceReclaimed ?? 0 };
}
