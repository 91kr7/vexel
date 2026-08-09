// Typed client for the server's system overview, disk-usage, prune and
// coverage-baseline endpoints (REQ-14, REQ-16, REQ-95, REQ-96, REQ-106).
export type DiskUsageCategoryId =
  | 'stopped-containers'
  | 'dangling-images'
  | 'unused-volumes'
  | 'unused-networks'
  | 'build-cache';

export interface DiskUsageCategory {
  id: DiskUsageCategoryId;
  sizeBytes: number;
  itemCount: number;
  /** What the category holds, named; capped by the server. */
  items: string[];
  /** Present exactly when the category could not be read; its size and count are then 0. */
  unavailableDetail?: string;
}

export interface DiskUsageBreakdown {
  categories: DiskUsageCategory[];
  totalReclaimableBytes: number;
}

export interface CategoryPruneOutcome {
  categoryId: DiskUsageCategoryId;
  removed: string[];
  removedCount: number;
  reclaimedBytes: number;
  /** Present exactly when that category's prune failed; nothing of it was removed. */
  error?: string;
}

export interface PruneRunResult {
  categories: CategoryPruneOutcome[];
  reclaimedBytes: number;
}

export type DiskUsageTotalCategoryId = 'images' | 'containers' | 'volumes' | 'build-cache';

export interface DiskUsageTotalCategory {
  id: DiskUsageTotalCategoryId;
  sizeBytes: number;
  itemCount: number;
  /** Present exactly when the category could not be read; its size and count are then 0. */
  unavailableDetail?: string;
}

export interface DiskUsageTotals {
  categories: DiskUsageTotalCategory[];
  totalBytes: number;
}

export interface ContainerCounts {
  total: number;
  running: number;
  paused: number;
  /** Every container that is neither running nor paused. */
  stopped: number;
}

export interface StacksOverview {
  compose: number;
  swarm: number;
  total: number;
  /** Present exactly when the swarm side could not be read; `swarm` is then 0. */
  swarmUnavailableDetail?: string;
}

export interface BuildCacheOverview {
  sizeBytes: number;
  activeBuilder?: string;
  /** Present exactly when buildx could not be read; the size is then 0. */
  unavailableDetail?: string;
}

export interface SystemOverview {
  containers: ContainerCounts;
  images: { count: number; sizeBytes: number };
  volumes: { count: number; sizeBytes: number };
  stacks: StacksOverview;
  buildCache: BuildCacheOverview;
  diskUsage: DiskUsageTotals;
}

export interface BaselineDeclaration {
  /** Highest Engine API version the application was written against. */
  engineApiVersion: string;
  /** Docker CLI release line shipping that Engine API version. */
  cliVersion: string;
}

export interface ConnectedDaemonVersions {
  version: string;
  apiVersion: string;
  minApiVersion?: string;
}

export type BaselineComparison = 'match' | 'daemon-newer' | 'daemon-older' | 'unknown';

export interface BaselineReport {
  declared: BaselineDeclaration;
  /** Absent exactly when the daemon could not be read. */
  daemon?: ConnectedDaemonVersions;
  /** Present exactly when the daemon could not be read. */
  daemonUnavailableDetail?: string;
  comparison: BaselineComparison;
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // no JSON body; fall through to the generic message
  }
  return `Request failed with HTTP ${response.status}`;
}

async function requireOk(response: Response): Promise<void> {
  if (!response.ok) throw new Error(await extractErrorMessage(response));
}

/** The dashboard's whole reading of the host, in one request (REQ-14, REQ-16). */
export async function fetchSystemOverview(): Promise<SystemOverview> {
  const response = await fetch('/api/system/overview');
  await requireOk(response);
  return (await response.json()) as SystemOverview;
}

export async function fetchDiskUsage(): Promise<DiskUsageBreakdown> {
  const response = await fetch('/api/system/disk-usage');
  await requireOk(response);
  return (await response.json()) as DiskUsageBreakdown;
}

/** The Docker baseline the coverage statement refers to, and the daemon connected right now (REQ-106). */
export async function fetchCoverageBaseline(): Promise<BaselineReport> {
  const response = await fetch('/api/system/baseline');
  await requireOk(response);
  return (await response.json()) as BaselineReport;
}

/** Prunes the chosen categories; a scope of one is the per-category prune. */
export async function pruneScope(scope: DiskUsageCategoryId[]): Promise<PruneRunResult> {
  const response = await fetch('/api/system/prune', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope }),
  });
  await requireOk(response);
  return (await response.json()) as PruneRunResult;
}
