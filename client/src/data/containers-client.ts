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
  /** Host CPUs the percentage above is measured against. */
  onlineCpus?: number;
  /** Bytes received / sent since the container started, summed over its interfaces. */
  networkRxBytes?: number;
  networkTxBytes?: number;
}

export interface PruneResult {
  removedCount: number;
  reclaimedBytes: number;
}

export interface RestartPolicy {
  name: string;
  maximumRetryCount?: number;
}

export interface ResourceLimits {
  cpus?: number;
  memoryBytes?: number;
}

export interface PortBinding {
  containerPort: number;
  protocol: 'tcp' | 'udp';
  hostPort?: number;
  hostIp?: string;
}

export interface MountInfo {
  type: string;
  source: string;
  destination: string;
  readOnly: boolean;
}

export interface NetworkAttachment {
  name: string;
  ipAddress?: string;
}

export interface HealthCheckConfig {
  test: string[];
  intervalNanos?: number;
  timeoutNanos?: number;
  retries?: number;
  startPeriodNanos?: number;
}

export interface HealthCheckResult {
  status: string;
  failingStreak?: number;
  log: { start: string; end: string; exitCode: number; output: string }[];
}

export interface ContainerInspect {
  id: string;
  name: string;
  image: string;
  command: string[];
  entrypoint: string[];
  createdAt: string;
  state: { status: string; startedAt?: string; finishedAt?: string; exitCode?: number };
  restartPolicy: RestartPolicy;
  resourceLimits: ResourceLimits;
  env: string[];
  ports: PortBinding[];
  mounts: MountInfo[];
  networks: NetworkAttachment[];
  labels: Record<string, string>;
  healthCheck?: HealthCheckConfig;
  health?: HealthCheckResult;
  raw: unknown;
}

/** Fields left `undefined` are kept as-is; `env`/`ports`/`mounts`/`healthCheck` require a recreate. */
export interface ContainerConfigUpdate {
  restartPolicy?: RestartPolicy;
  resourceLimits?: ResourceLimits;
  env?: string[];
  ports?: PortBinding[];
  mounts?: MountInfo[];
  healthCheck?: HealthCheckConfig | null;
}

export interface ContainerConfigUpdateResult {
  path: 'in-place' | 'recreate';
  container: ContainerSummary;
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

export async function fetchContainerInspect(id: string): Promise<ContainerInspect> {
  const response = await fetch(`/api/containers/${encodeURIComponent(id)}/inspect`);
  await requireOk(response);
  return (await response.json()) as ContainerInspect;
}

export async function updateContainerConfig(id: string, update: ContainerConfigUpdate): Promise<ContainerConfigUpdateResult> {
  const response = await fetch(`/api/containers/${encodeURIComponent(id)}/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  await requireOk(response);
  return (await response.json()) as ContainerConfigUpdateResult;
}
