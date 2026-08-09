// Reclaimable disk space, broken down by the five categories a prune can act
// on (REQ-95). The four daemon-side categories come from a single /system/df
// reading plus the network listing; the build cache is read through the
// build-cache service, the one channel that already knows it.
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { listBuildCache } from "../builders/build-cache-service.js";
import { listNetworks } from "../networks/networks-service.js";

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

interface RawDiskUsage {
  Containers?: RawDiskUsageContainer[] | null;
  Images?: RawDiskUsageImage[] | null;
  Volumes?: RawDiskUsageVolume[] | null;
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

async function readDiskUsage(): Promise<RawDiskUsage> {
  const response = await getEngineClient().request("/system/df");
  return JSON.parse(response.body) as RawDiskUsage;
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
