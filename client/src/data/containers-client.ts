// Typed client for the server's container listing and lifecycle endpoints
// (REQ-19, REQ-20, REQ-21, REQ-22).
export type ContainerState = 'created' | 'running' | 'paused' | 'restarting' | 'removing' | 'exited' | 'dead';

export interface ContainerPort {
  privatePort: number;
  publicPort?: number;
  type: string;
}

export interface ContainerSummary {
  id: string;
  shortId: string;
  name: string;
  image: string;
  state: ContainerState;
  status: string;
  ports: ContainerPort[];
  cpuPercent?: number;
  memoryUsageBytes?: number;
  memoryLimitBytes?: number;
}

export interface PruneResult {
  removedCount: number;
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

export async function fetchContainers(): Promise<ContainerSummary[]> {
  const response = await fetch('/api/containers');
  await requireOk(response);
  return (await response.json()) as ContainerSummary[];
}

async function postLifecycle(id: string, action: string): Promise<void> {
  const response = await fetch(`/api/containers/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
  await requireOk(response);
}

export const startContainer = (id: string) => postLifecycle(id, 'start');
export const stopContainer = (id: string) => postLifecycle(id, 'stop');
export const restartContainer = (id: string) => postLifecycle(id, 'restart');
export const pauseContainer = (id: string) => postLifecycle(id, 'pause');
export const unpauseContainer = (id: string) => postLifecycle(id, 'unpause');
export const killContainer = (id: string) => postLifecycle(id, 'kill');

export async function removeContainer(id: string): Promise<void> {
  const response = await fetch(`/api/containers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await requireOk(response);
}

export async function renameContainer(id: string, name: string): Promise<void> {
  const response = await fetch(`/api/containers/${encodeURIComponent(id)}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  await requireOk(response);
}

export async function pruneStoppedContainers(): Promise<PruneResult> {
  const response = await fetch('/api/containers/prune', { method: 'POST' });
  await requireOk(response);
  return (await response.json()) as PruneResult;
}
