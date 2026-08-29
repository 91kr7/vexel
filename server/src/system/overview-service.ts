// The dashboard's whole reading of the host in one payload (REQ-14, REQ-16):
// container counts by state, images, volumes, stacks, build cache and the
// occupied-space breakdown. Every number is taken from the service that
// already owns it — the containers from the listing the server already holds
// (plan-docker_management_app-refresh_cache/REQ-37) — so the dashboard never
// becomes a second, divergent way of reading the same thing.
import { listBuilders } from "../builders/builders-service.js";
import { listComposeProjects } from "../compose/compose-discovery-service.js";
import { readHeldContainerList, type RawContainer } from "../containers/containers-service.js";
import { getDiskUsageTotals, type DiskUsageTotalCategory, type DiskUsageTotals } from "./disk-usage-service.js";

export interface ContainerCounts {
  total: number;
  running: number;
  paused: number;
  /** Every container that is neither running nor paused: created, restarting, removing, exited, dead. */
  stopped: number;
}

export interface ImagesOverview {
  count: number;
  /** Bytes the image store occupies, shared layers counted once. */
  sizeBytes: number;
}

export interface VolumesOverview {
  count: number;
  sizeBytes: number;
}

export interface StacksOverview {
  compose: number;
  /** Every kind of stack this application knows, which is the compose projects alone. */
  total: number;
}

export interface BuildCacheOverview {
  sizeBytes: number;
  /** Name of the builder `docker buildx build` uses by default; absent when no builder is marked active. */
  activeBuilder?: string;
  /** Present exactly when buildx could not be read; the size is then 0 and no builder is named. */
  unavailableDetail?: string;
}

export interface SystemOverview {
  containers: ContainerCounts;
  images: ImagesOverview;
  volumes: VolumesOverview;
  stacks: StacksOverview;
  buildCache: BuildCacheOverview;
  diskUsage: DiskUsageTotals;
}

/**
 * The overview behind the dashboard. A capability the host does not have —
 * buildx, compose — reports its reason in its own section instead of
 * failing the payload, so a plain daemon still fills the rest.
 * A daemon that cannot be reached at all does fail: there is then nothing to
 * report, and the application already says so on its own.
 */
export async function getSystemOverview(): Promise<SystemOverview> {
  const [diskUsage, containers, composeProjects, activeBuilder] = await Promise.all([
    getDiskUsageTotals(),
    readHeldContainerList(),
    readComposeStackCount(),
    readActiveBuilderName(),
  ]);

  const images = category(diskUsage, "images");
  const volumes = category(diskUsage, "volumes");
  const buildCache = category(diskUsage, "build-cache");

  return {
    containers: countByState(containers),
    images: { count: images.itemCount, sizeBytes: images.sizeBytes },
    volumes: { count: volumes.itemCount, sizeBytes: volumes.sizeBytes },
    stacks: { compose: composeProjects, total: composeProjects },
    buildCache: {
      sizeBytes: buildCache.sizeBytes,
      activeBuilder: buildCache.unavailableDetail ? undefined : activeBuilder,
      unavailableDetail: buildCache.unavailableDetail,
    },
    diskUsage,
  };
}

function countByState(containers: RawContainer[]): ContainerCounts {
  const running = containers.filter((container) => container.State === "running").length;
  const paused = containers.filter((container) => container.State === "paused").length;
  return { total: containers.length, running, paused, stopped: containers.length - running - paused };
}

function category(totals: DiskUsageTotals, id: DiskUsageTotalCategory["id"]): DiskUsageTotalCategory {
  return totals.categories.find((entry) => entry.id === id) ?? { id, sizeBytes: 0, itemCount: 0 };
}

/** Compose runs through the CLI: a host without the plugin contributes no stack rather than failing the overview. */
async function readComposeStackCount(): Promise<number> {
  try {
    return (await listComposeProjects()).length;
  } catch {
    return 0;
  }
}

async function readActiveBuilderName(): Promise<string | undefined> {
  try {
    return (await listBuilders()).find((builder) => builder.active)?.name;
  } catch {
    return undefined;
  }
}
