// Typed client for the server's buildx builder and build-cache endpoints
// (REQ-88, REQ-89, REQ-91).
export interface BuilderSummary {
  name: string;
  driver: string;
  endpoint: string;
  platforms: string[];
  status: string;
  active: boolean;
  cacheBytes?: number;
}

export interface CreateBuilderInput {
  name: string;
  driver: string;
  endpoint?: string;
  platforms: string[];
}

export type BuildCacheUsageState = 'shared' | 'in-use' | 'reclaimable';

export interface BuildCacheRecord {
  id: string;
  type: string;
  sizeBytes: number;
  usageState: BuildCacheUsageState;
}

export interface BuildCachePruneResult {
  reclaimedBytes: number;
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

export async function fetchBuilders(): Promise<BuilderSummary[]> {
  const response = await fetch('/api/builders');
  await requireOk(response);
  return (await response.json()) as BuilderSummary[];
}

export async function createBuilder(input: CreateBuilderInput): Promise<BuilderSummary> {
  const response = await fetch('/api/builders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await requireOk(response);
  return (await response.json()) as BuilderSummary;
}

export async function removeBuilder(name: string): Promise<void> {
  const response = await fetch(`/api/builders/${encodeURIComponent(name)}`, { method: 'DELETE' });
  await requireOk(response);
}

/** Sets `name` as the builder `docker buildx build` uses by default. Named to avoid the `use*` naming lint treats as a React Hook. */
export async function activateBuilder(name: string): Promise<BuilderSummary> {
  const response = await fetch(`/api/builders/${encodeURIComponent(name)}/use`, { method: 'POST' });
  await requireOk(response);
  return (await response.json()) as BuilderSummary;
}

export async function fetchBuildCache(): Promise<BuildCacheRecord[]> {
  const response = await fetch('/api/builders/cache');
  await requireOk(response);
  return (await response.json()) as BuildCacheRecord[];
}

export async function pruneBuildCache(): Promise<BuildCachePruneResult> {
  const response = await fetch('/api/builders/cache/prune', { method: 'POST' });
  await requireOk(response);
  return (await response.json()) as BuildCachePruneResult;
}
