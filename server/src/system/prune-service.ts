// Per-category and scoped system-wide prune (REQ-96). Every category is
// pruned through the service that already owns it — containers, images,
// volumes, networks, build cache — so this area adds the scope and the
// reporting, not a second way of removing anything.
import { pruneBuildCache } from "../builders/build-cache-service.js";
import { pruneStoppedContainers } from "../containers/containers-service.js";
import { pruneDanglingImages } from "../images/image-transfer-service.js";
import { pruneNetworks } from "../networks/networks-service.js";
import { pruneVolumes } from "../volumes/volumes-service.js";
import { DISK_USAGE_CATEGORY_IDS, diskUsageCache, type DiskUsageCategoryId } from "./disk-usage-service.js";

export interface CategoryPruneOutcome {
  categoryId: DiskUsageCategoryId;
  /** What was actually removed, named; empty for a channel that reports no names (the build cache). */
  removed: string[];
  removedCount: number;
  /** Space the daemon reports as actually reclaimed; 0 for a category that occupies no disk. */
  reclaimedBytes: number;
  /** Present exactly when this category's prune failed; nothing of it was removed. */
  error?: string;
}

export interface PruneRunResult {
  categories: CategoryPruneOutcome[];
  /** Sum of the space reclaimed by the categories that succeeded. */
  reclaimedBytes: number;
}

export function isDiskUsageCategoryId(value: unknown): value is DiskUsageCategoryId {
  return typeof value === "string" && (DISK_USAGE_CATEGORY_IDS as string[]).includes(value);
}

/** Prunes one category, reporting what went and the space it freed. Rejects if the underlying channel does. */
export async function pruneCategory(categoryId: DiskUsageCategoryId): Promise<CategoryPruneOutcome> {
  switch (categoryId) {
    case "stopped-containers": {
      const result = await pruneStoppedContainers();
      return outcome(categoryId, result.removedIds, result.reclaimedBytes);
    }
    case "dangling-images": {
      const result = await pruneDanglingImages();
      return outcome(categoryId, result.removedIds, result.reclaimedBytes);
    }
    case "unused-volumes": {
      const result = await pruneVolumes();
      return outcome(categoryId, result.removedNames, result.reclaimedBytes);
    }
    case "unused-networks": {
      const result = await pruneNetworks();
      return outcome(categoryId, result.removedNames, 0);
    }
    case "build-cache": {
      const result = await pruneBuildCache();
      return outcome(categoryId, [], result.reclaimedBytes);
    }
  }
}

/**
 * Prunes the chosen categories, always in the fixed category order —
 * containers first, so the volumes and networks they held become reclaimable
 * within the same run — and one at a time.
 *
 * A category that fails is recorded and the run carries on: half a prune has
 * already changed the host, and the operator is owed the account of what it
 * did rather than a single error hiding it.
 */
export async function pruneScope(scope: DiskUsageCategoryId[]): Promise<PruneRunResult> {
  const requested = DISK_USAGE_CATEGORY_IDS.filter((categoryId) => scope.includes(categoryId));
  const categories: CategoryPruneOutcome[] = [];
  for (const categoryId of requested) {
    try {
      categories.push(await pruneCategory(categoryId));
    } catch (error) {
      categories.push({ categoryId, removed: [], removedCount: 0, reclaimedBytes: 0, error: (error as Error).message });
    }
  }
  // A prune that succeeded says the held disk accounting is due, so the space
  // the operator just reclaimed is not withheld until its own five-minute
  // period comes round (plan-docker_management_app-refresh_cache/REQ-18).
  if (categories.some((category) => category.error === undefined)) diskUsageCache.markChanged();
  return { categories, reclaimedBytes: categories.reduce((total, category) => total + category.reclaimedBytes, 0) };
}

function outcome(categoryId: DiskUsageCategoryId, removed: string[], reclaimedBytes: number): CategoryPruneOutcome {
  return { categoryId, removed, removedCount: removed.length, reclaimedBytes };
}
