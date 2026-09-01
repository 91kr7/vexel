// Disk space as the daemon accounts for it, in two readings: what a prune
// could reclaim, broken down by the five categories a prune can act on
// (REQ-95), and what is occupied in total, broken down by images, containers,
// volumes and build cache (REQ-16). The daemon-side numbers come from
// /system/df plus the network listing; the build cache is read through the
// build-cache service, the one channel that already knows it. The /system/df
// reading is held here for the whole server
// (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-22).
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { buildCacheListCache, listBuildCache } from "../builders/build-cache-service.js";
import { eventStreamService, type DaemonEvent } from "../events/event-stream-service.js";
import { listNetworks } from "../networks/networks-service.js";
import { registerRefreshKind } from "../refresh-cache/refresh-cache.js";
import { INTERNAL_CONTAINER_LABEL } from "../image-analysis/filesystem-extraction-service.js";

export type DiskUsageCategoryId =
  | "stopped-containers"
  | "dangling-images"
  | "unused-volumes"
  | "unused-networks"
  | "build-cache";

/** The order a scoped prune runs the categories in, and the order they are reported in. */
export const DISK_USAGE_CATEGORY_IDS: DiskUsageCategoryId[] = [
  "stopped-containers",
  "dangling-images",
  "unused-volumes",
  "unused-networks",
  "build-cache",
];

export interface DiskUsageCategory {
  id: DiskUsageCategoryId;
  /** Bytes a prune of this category would reclaim; 0 for a category that occupies no disk. */
  sizeBytes: number;
  itemCount: number;
  /** What the category holds, named: container names, image short ids, volume/network names, cache record ids. Capped. */
  items: string[];
  /** Present exactly when this category could not be read; its size and count are then 0. */
  unavailableDetail?: string;
}

export interface DiskUsageBreakdown {
  categories: DiskUsageCategory[];
  /** Sum of every category's reclaimable size; a category that could not be read contributes 0. */
  totalReclaimableBytes: number;
}

/** The kinds of object that occupy disk on a Docker host, as `docker system df` accounts for them. */
export type DiskUsageTotalCategoryId = "images" | "containers" | "volumes" | "build-cache";

/** The order the occupied-space categories are reported in. */
export const DISK_USAGE_TOTAL_CATEGORY_IDS: DiskUsageTotalCategoryId[] = ["images", "containers", "volumes", "build-cache"];

export interface DiskUsageTotalCategory {
  id: DiskUsageTotalCategoryId;
  /** Bytes this category occupies on disk, reclaimable or not. */
  sizeBytes: number;
  /** Objects counted in this category. */
  itemCount: number;
  /** Present exactly when this category could not be read; its size and count are then 0. */
  unavailableDetail?: string;
}

export interface DiskUsageTotals {
  categories: DiskUsageTotalCategory[];
  /** Sum of every category's occupied size; a category that could not be read contributes 0. */
  totalBytes: number;
}

/** Enough names to tell the operator what a category holds without turning the reading into a listing. */
const MAX_ITEMS_PER_CATEGORY = 20;

/** The daemon's own networks: they exist on every host, are never removed by a prune, and are not reclaimable. */
const PREDEFINED_NETWORKS = new Set(["bridge", "host", "none"]);

/** States `docker container prune` acts on; a paused or restarting container is not one of them. */
const PRUNABLE_CONTAINER_STATES = new Set(["created", "exited", "dead"]);

interface RawDiskUsageContainer {
  Id?: string;
  Names?: string[];
  State?: string;
  SizeRw?: number;
  Labels?: Record<string, string> | null;
}

interface RawDiskUsageImage {
  Id?: string;
  RepoTags?: string[] | null;
  Size?: number;
  SharedSize?: number;
  Containers?: number;
}

interface RawDiskUsageVolume {
  Name?: string;
  UsageData?: { Size?: number; RefCount?: number } | null;
}

export interface RawDiskUsage {
  Containers?: RawDiskUsageContainer[] | null;
  Images?: RawDiskUsageImage[] | null;
  Volumes?: RawDiskUsageVolume[] | null;
  /** Total bytes every image layer on the host occupies, shared layers counted once. */
  LayersSize?: number;
}

/**
 * The reclaimable-space breakdown. A category whose own reading fails does not
 * fail the whole breakdown: it reports the reason in its place, so one missing
 * capability (buildx, say) still leaves the other four usable.
 */
export async function getDiskUsage(): Promise<DiskUsageBreakdown> {
  const [diskUsage, networks, buildCache] = await Promise.all([
    readDiskUsage(),
    readUnusedNetworks(),
    readReclaimableBuildCache(),
  ]);

  const categories: DiskUsageCategory[] = [
    stoppedContainers(diskUsage),
    danglingImages(diskUsage),
    unusedVolumes(diskUsage),
    networks,
    buildCache,
  ];

  return {
    categories,
    totalReclaimableBytes: categories.reduce((total, category) => total + category.sizeBytes, 0),
  };
}

/**
 * Space occupied per kind of object, whether or not a prune could reclaim it
 * (REQ-16), assembled from held values alone. Same shape of resilience as the
 * reclaimable breakdown: the build cache, which is read through another
 * channel, reports its reason in place of a size rather than failing the whole
 * reading.
 */
export async function getDiskUsageTotals(): Promise<DiskUsageTotals> {
  const [diskUsage, buildCache] = await Promise.all([readHeldDiskUsage(), readTotalBuildCache()]);
  const containers = ownContainers(diskUsage);

  const categories: DiskUsageTotalCategory[] = [
    {
      id: "images",
      // The daemon's own total for the image store: layers shared between two
      // images are counted once, so this is smaller than the sum of the images'
      // individual sizes.
      sizeBytes: positive(diskUsage.LayersSize),
      itemCount: (diskUsage.Images ?? []).length,
    },
    {
      id: "containers",
      // A container occupies only its writable layer; the image it runs is
      // already counted in the image category.
      sizeBytes: containers.reduce((total, container) => total + positive(container.SizeRw), 0),
      itemCount: containers.length,
    },
    {
      id: "volumes",
      sizeBytes: (diskUsage.Volumes ?? []).reduce((total, volume) => total + positive(volume.UsageData?.Size), 0),
      itemCount: (diskUsage.Volumes ?? []).length,
    },
    buildCache,
  ];

  return { categories, totalBytes: categories.reduce((total, category) => total + category.sizeBytes, 0) };
}

/** Intermediate filesystem-extraction containers are internal plumbing (REQ-54): they are nobody's disk usage but ours. */
function ownContainers(diskUsage: RawDiskUsage): RawDiskUsageContainer[] {
  return (diskUsage.Containers ?? []).filter((container) => container.Labels?.[INTERNAL_CONTAINER_LABEL] !== "true");
}

async function readTotalBuildCache(): Promise<DiskUsageTotalCategory> {
  try {
    const records = (await buildCacheListCache.read()).value;
    return {
      id: "build-cache",
      sizeBytes: records.reduce((total, record) => total + positive(record.sizeBytes), 0),
      itemCount: records.length,
    };
  } catch (error) {
    return { id: "build-cache", sizeBytes: 0, itemCount: 0, unavailableDetail: (error as Error).message };
  }
}

async function readDiskUsage(): Promise<RawDiskUsage> {
  const response = await getEngineClient().request("/system/df");
  return JSON.parse(response.body) as RawDiskUsage;
}

/**
 * The daemon's whole disk accounting, held on the longest period in the cache:
 * /system/df is the most expensive call the daemon answers on a large host, so
 * it is read once per period for every consumer — the per-volume sizes, the
 * occupied-space breakdown and the dashboard's figures alike (REQ-18,
 * plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-22).
 */
export const diskUsageCache = registerRefreshKind({
  key: "disk-usage",
  periodMs: 300000,
  read: readDiskUsage,
});

// Only a removal can make a size drop — writing into a volume announces
// nothing — so the reading is marked due by the removals alone, and not by
// every `volume`/`container` event: at this price per read, a container's
// start, stop or health check must not pay for one.
eventStreamService.on("event", (event: DaemonEvent) => {
  if (event.action !== "destroy") return;
  if (event.type === "volume" || event.type === "container") diskUsageCache.markChanged();
});

/**
 * The reading held — and demand for it either way: the read is asked for and
 * deliberately not awaited, so no caller waits for /system/df. `onFirstRead`
 * fires when a read lands while nothing was held, which is how a caller that
 * answered without it knows there is something new to answer with.
 */
export function heldDiskUsage(onFirstRead?: () => void): RawDiskUsage | undefined {
  const held = diskUsageCache.peek();
  void diskUsageCache.read().then(
    () => {
      if (!held) onFirstRead?.();
    },
    () => {},
  );
  return held?.value;
}

/** The held reading, waiting only for the first one: a freshly started server answers figures, not zeros. */
async function readHeldDiskUsage(): Promise<RawDiskUsage> {
  return heldDiskUsage() ?? (await diskUsageCache.read()).value;
}

function stoppedContainers(diskUsage: RawDiskUsage): DiskUsageCategory {
  const stopped = (diskUsage.Containers ?? []).filter((container) => PRUNABLE_CONTAINER_STATES.has(container.State ?? ""));
  return {
    id: "stopped-containers",
    sizeBytes: stopped.reduce((total, container) => total + positive(container.SizeRw), 0),
    itemCount: stopped.length,
    items: capped(stopped.map((container) => (container.Names?.[0] ?? container.Id ?? "").replace(/^\//, ""))),
  };
}

/**
 * An untagged image still referenced by a container is not dangling for prune
 * purposes; the space a dangling one frees is its own, layers it shares with
 * an image that stays excluded.
 */
function danglingImages(diskUsage: RawDiskUsage): DiskUsageCategory {
  const dangling = (diskUsage.Images ?? []).filter((image) => isUntagged(image) && (image.Containers ?? 0) <= 0);
  return {
    id: "dangling-images",
    sizeBytes: dangling.reduce((total, image) => total + Math.max(positive(image.Size) - positive(image.SharedSize), 0), 0),
    itemCount: dangling.length,
    items: capped(dangling.map((image) => shortId(image.Id ?? ""))),
  };
}

function unusedVolumes(diskUsage: RawDiskUsage): DiskUsageCategory {
  const unused = (diskUsage.Volumes ?? []).filter((volume) => (volume.UsageData?.RefCount ?? 0) <= 0);
  return {
    id: "unused-volumes",
    sizeBytes: unused.reduce((total, volume) => total + positive(volume.UsageData?.Size), 0),
    itemCount: unused.length,
    items: capped(unused.map((volume) => volume.Name ?? "")),
  };
}

/** Networks occupy no disk: the category reports what a prune would remove, at a size of zero. */
async function readUnusedNetworks(): Promise<DiskUsageCategory> {
  try {
    const unused = (await listNetworks()).filter(
      (network) => network.attachedContainers.length === 0 && !PREDEFINED_NETWORKS.has(network.name),
    );
    return { id: "unused-networks", sizeBytes: 0, itemCount: unused.length, items: capped(unused.map((network) => network.name)) };
  } catch (error) {
    return unavailable("unused-networks", error);
  }
}

async function readReclaimableBuildCache(): Promise<DiskUsageCategory> {
  try {
    const reclaimable = (await listBuildCache()).filter((record) => record.usageState === "reclaimable");
    return {
      id: "build-cache",
      sizeBytes: reclaimable.reduce((total, record) => total + positive(record.sizeBytes), 0),
      itemCount: reclaimable.length,
      items: capped(reclaimable.map((record) => record.id)),
    };
  } catch (error) {
    return unavailable("build-cache", error);
  }
}

function unavailable(id: DiskUsageCategoryId, error: unknown): DiskUsageCategory {
  return { id, sizeBytes: 0, itemCount: 0, items: [], unavailableDetail: (error as Error).message };
}

function isUntagged(image: RawDiskUsageImage): boolean {
  const tags = (image.RepoTags ?? []).filter((tag) => tag !== "<none>:<none>");
  return tags.length === 0;
}

function shortId(id: string): string {
  return id.replace(/^sha256:/, "").slice(0, 12);
}

function positive(value: number | undefined): number {
  return typeof value === "number" && value > 0 ? value : 0;
}

function capped(items: string[]): string[] {
  return items.filter((item) => item !== "").slice(0, MAX_ITEMS_PER_CATEGORY);
}
