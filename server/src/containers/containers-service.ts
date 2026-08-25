// Container listing and lifecycle over the Engine API (REQ-19, REQ-20, REQ-21,
// REQ-22), plus a bounded-rate CPU/memory sampler for running containers
// (REQ-19) whose latest reading is merged into every list response.
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { INTERNAL_CONTAINER_LABEL } from "../image-analysis/filesystem-extraction-service.js";
import { byNameThenIdentity } from "../list-order/list-order.js";

export type ContainerState = "created" | "running" | "paused" | "restarting" | "removing" | "exited" | "dead";

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
  /** The daemon's own human-readable status text (e.g. "Up 3 days", "Exited (0) 2 hours ago"). */
  status: string;
  ports: ContainerPort[];
  cpuPercent?: number;
  memoryUsageBytes?: number;
  memoryLimitBytes?: number;
  /** Host CPUs the percentage above is measured against, so a reading can be shown over its capacity. */
  onlineCpus?: number;
  /** Bytes received / sent, summed over the container's interfaces since it started. */
  networkRxBytes?: number;
  networkTxBytes?: number;
}

export interface PruneResult {
  removedIds: string[];
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
  protocol: "tcp" | "udp";
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
  /** The full payload exactly as received from the Engine API (REQ-26). */
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
  path: "in-place" | "recreate";
  container: ContainerSummary;
}

interface RawContainer {
  Id: string;
  Names?: string[];
  Image: string;
  State: string;
  Status: string;
  Ports?: { PrivatePort: number; PublicPort?: number; Type: string }[];
  Labels?: Record<string, string>;
}

interface RawInspect {
  Id: string;
  Name: string;
  Created: string;
  Path: string;
  Args?: string[];
  Config?: {
    Image?: string;
    Cmd?: string[] | null;
    Entrypoint?: string[] | null;
    Env?: string[];
    Labels?: Record<string, string>;
    Healthcheck?: { Test?: string[]; Interval?: number; Timeout?: number; Retries?: number; StartPeriod?: number };
  };
  State?: { Status?: string; StartedAt?: string; FinishedAt?: string; ExitCode?: number; Running?: boolean; Health?: { Status?: string; FailingStreak?: number; Log?: { Start: string; End: string; ExitCode: number; Output: string }[] } };
  HostConfig?: {
    RestartPolicy?: { Name?: string; MaximumRetryCount?: number };
    Memory?: number;
    NanoCpus?: number;
    CpuQuota?: number;
    CpuPeriod?: number;
    PortBindings?: Record<string, { HostIp?: string; HostPort?: string }[] | null>;
  };
  Mounts?: { Type?: string; Name?: string; Source?: string; Destination?: string; Mode?: string; RW?: boolean }[];
  NetworkSettings?: { Ports?: Record<string, { HostIp?: string; HostPort?: string }[] | null>; Networks?: Record<string, { IPAddress?: string }> };
}

interface RawStats {
  cpu_stats: { cpu_usage: { total_usage: number; percpu_usage?: number[] }; system_cpu_usage?: number; online_cpus?: number };
  precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number };
  memory_stats: { usage?: number; limit?: number; stats?: { cache?: number; inactive_file?: number } };
  networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>;
}

interface SampledUsage {
  cpuPercent: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  onlineCpus: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

const STATS_SAMPLE_INTERVAL_MS = 3000;
const statsCache = new Map<string, SampledUsage>();
let samplerStarted = false;

export async function listContainers(): Promise<ContainerSummary[]> {
  const response = await getEngineClient().request("/containers/json?all=true");
  const raw = JSON.parse(response.body) as RawContainer[];
  // Intermediate filesystem-extraction containers are internal plumbing
  // (REQ-54): never shown as a container anywhere in the application.
  return raw
    .filter((container) => container.Labels?.[INTERNAL_CONTAINER_LABEL] !== "true")
    .map(toSummary)
    .sort(byNameThenIdentity({ name: (container) => container.name, identity: (container) => container.id }));
}

export async function startContainer(id: string): Promise<void> {
  await getEngineClient().request(`/containers/${id}/start`, { method: "POST" });
}

export async function stopContainer(id: string): Promise<void> {
  await getEngineClient().request(`/containers/${id}/stop`, { method: "POST" });
}

export async function restartContainer(id: string): Promise<void> {
  await getEngineClient().request(`/containers/${id}/restart`, { method: "POST" });
}

export async function pauseContainer(id: string): Promise<void> {
  await getEngineClient().request(`/containers/${id}/pause`, { method: "POST" });
}

export async function unpauseContainer(id: string): Promise<void> {
  await getEngineClient().request(`/containers/${id}/unpause`, { method: "POST" });
}

export async function killContainer(id: string): Promise<void> {
  await getEngineClient().request(`/containers/${id}/kill`, { method: "POST" });
}

/** Force-removes the container regardless of its state, mirroring the screen's always-available "rm" action. */
export async function removeContainer(id: string): Promise<void> {
  await getEngineClient().request(`/containers/${id}?force=true`, { method: "DELETE" });
}

export async function renameContainer(id: string, name: string): Promise<void> {
  await getEngineClient().request(`/containers/${id}/rename?name=${encodeURIComponent(name)}`, { method: "POST" });
}

export async function pruneStoppedContainers(): Promise<PruneResult> {
  const response = await getEngineClient().request("/containers/prune", { method: "POST" });
  const payload = JSON.parse(response.body) as { ContainersDeleted?: string[]; SpaceReclaimed?: number };
  return { removedIds: payload.ContainersDeleted ?? [], reclaimedBytes: payload.SpaceReclaimed ?? 0 };
}

export async function getContainerInspect(id: string): Promise<ContainerInspect> {
  const response = await getEngineClient().request(`/containers/${id}/json`);
  const raw = JSON.parse(response.body) as RawInspect;
  return toInspect(raw);
}

/**
 * Applies a configuration change (REQ-25). Restart policy and resource limits
 * are updated in place via the Engine API's `/update`; env, ports, mounts or
 * health check require Docker to recreate the container (stop, remove, create
 * again with the merged config, reconnect its networks, restart if it was
 * running), since the Engine API offers no in-place update for those fields.
 */
export async function updateContainerConfig(id: string, update: ContainerConfigUpdate): Promise<ContainerConfigUpdateResult> {
  if (!requiresRecreate(update)) {
    await applyInPlaceUpdate(id, update);
    return { path: "in-place", container: await getContainerSummary(id) };
  }
  const newId = await recreateContainer(id, update);
  return { path: "recreate", container: await getContainerSummary(newId) };
}

function requiresRecreate(update: ContainerConfigUpdate): boolean {
  return update.env !== undefined || update.ports !== undefined || update.mounts !== undefined || update.healthCheck !== undefined;
}

async function applyInPlaceUpdate(id: string, update: ContainerConfigUpdate): Promise<void> {
  const body: Record<string, unknown> = {};
  if (update.restartPolicy) {
    body.RestartPolicy = { Name: update.restartPolicy.name, MaximumRetryCount: update.restartPolicy.maximumRetryCount ?? 0 };
  }
  if (update.resourceLimits?.memoryBytes !== undefined) body.Memory = update.resourceLimits.memoryBytes;
  if (update.resourceLimits?.cpus !== undefined) {
    body.CpuPeriod = 100000;
    body.CpuQuota = Math.round(update.resourceLimits.cpus * 100000);
  }
  await getEngineClient().request(`/containers/${id}/update`, { method: "POST", body: JSON.stringify(body) });
}

async function recreateContainer(id: string, update: ContainerConfigUpdate): Promise<string> {
  const client = getEngineClient();
  const inspectResponse = await client.request(`/containers/${id}/json`);
  const raw = JSON.parse(inspectResponse.body) as RawInspect;
  const name = raw.Name.replace(/^\//, "");
  const wasRunning = Boolean(raw.State?.Running);
  const createBody = buildCreatePayload(raw, update);
  const networks = Object.keys(raw.NetworkSettings?.Networks ?? {});

  await client.request(`/containers/${id}/stop`, { method: "POST" }).catch(() => undefined);
  await client.request(`/containers/${id}?force=true`, { method: "DELETE" });

  const createResponse = await client.request(`/containers/create?name=${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify(createBody),
  });
  const created = JSON.parse(createResponse.body) as { Id: string };

  for (const network of networks) {
    await client
      .request(`/networks/${network}/connect`, { method: "POST", body: JSON.stringify({ Container: created.Id }) })
      .catch(() => undefined);
  }
  if (wasRunning) await client.request(`/containers/${created.Id}/start`, { method: "POST" });
  return created.Id;
}

function buildCreatePayload(raw: RawInspect, update: ContainerConfigUpdate): Record<string, unknown> {
  const config = raw.Config ?? {};
  const hostConfig = raw.HostConfig ?? {};

  const exposedPorts: Record<string, object> = {};
  const portBindings: Record<string, { HostIp?: string; HostPort: string }[]> = {};
  const ports = update.ports ?? portsFromRaw(hostConfig.PortBindings);
  for (const port of ports) {
    const key = `${port.containerPort}/${port.protocol}`;
    exposedPorts[key] = {};
    if (port.hostPort !== undefined) portBindings[key] = [{ HostIp: port.hostIp, HostPort: String(port.hostPort) }];
  }

  const binds: string[] = [];
  const mounts = update.mounts ?? mountsFromRaw(raw.Mounts ?? []);
  for (const mount of mounts) {
    binds.push(`${mount.source}:${mount.destination}${mount.readOnly ? ":ro" : ""}`);
  }

  const healthcheck =
    update.healthCheck === null
      ? undefined
      : update.healthCheck
        ? {
            Test: update.healthCheck.test,
            Interval: update.healthCheck.intervalNanos,
            Timeout: update.healthCheck.timeoutNanos,
            Retries: update.healthCheck.retries,
            StartPeriod: update.healthCheck.startPeriodNanos,
          }
        : config.Healthcheck;

  const restartPolicy = update.restartPolicy
    ? { Name: update.restartPolicy.name, MaximumRetryCount: update.restartPolicy.maximumRetryCount ?? 0 }
    : hostConfig.RestartPolicy;

  const memory = update.resourceLimits?.memoryBytes ?? hostConfig.Memory;
  const cpuQuota = update.resourceLimits?.cpus !== undefined ? Math.round(update.resourceLimits.cpus * 100000) : hostConfig.CpuQuota;
  const cpuPeriod = update.resourceLimits?.cpus !== undefined ? 100000 : hostConfig.CpuPeriod;

  return {
    Image: config.Image,
    Cmd: config.Cmd,
    Entrypoint: config.Entrypoint,
    Labels: config.Labels,
    Env: update.env ?? config.Env ?? [],
    ExposedPorts: exposedPorts,
    Healthcheck: healthcheck,
    HostConfig: { Binds: binds, PortBindings: portBindings, RestartPolicy: restartPolicy, Memory: memory, CpuQuota: cpuQuota, CpuPeriod: cpuPeriod },
  };
}

function portsFromRaw(bindings: Record<string, { HostIp?: string; HostPort?: string }[] | null> | undefined): PortBinding[] {
  const result: PortBinding[] = [];
  for (const [key, entries] of Object.entries(bindings ?? {})) {
    const [portText, protocol] = key.split("/");
    const containerPort = Number(portText);
    if (!entries || entries.length === 0) {
      result.push({ containerPort, protocol: protocol === "udp" ? "udp" : "tcp" });
      continue;
    }
    for (const entry of entries) {
      result.push({ containerPort, protocol: protocol === "udp" ? "udp" : "tcp", hostPort: entry.HostPort ? Number(entry.HostPort) : undefined, hostIp: entry.HostIp });
    }
  }
  return result;
}

function mountsFromRaw(raw: NonNullable<RawInspect["Mounts"]>): MountInfo[] {
  return raw.map((mount) => ({
    type: mount.Type ?? "bind",
    source: mount.Source ?? mount.Name ?? "",
    destination: mount.Destination ?? "",
    readOnly: mount.RW === false,
  }));
}

async function getContainerSummary(id: string): Promise<ContainerSummary> {
  const containers = await listContainers();
  const found = containers.find((container) => container.id === id);
  if (!found) throw new Error(`Container ${id} not found after the operation`);
  return found;
}

function toInspect(raw: RawInspect): ContainerInspect {
  const config = raw.Config ?? {};
  const hostConfig = raw.HostConfig ?? {};
  const state = raw.State ?? {};
  const restartPolicy: RestartPolicy = { name: hostConfig.RestartPolicy?.Name ?? "no", maximumRetryCount: hostConfig.RestartPolicy?.MaximumRetryCount };
  const resourceLimits: ResourceLimits = {
    cpus: hostConfig.NanoCpus ? hostConfig.NanoCpus / 1e9 : hostConfig.CpuQuota && hostConfig.CpuPeriod ? hostConfig.CpuQuota / hostConfig.CpuPeriod : undefined,
    memoryBytes: hostConfig.Memory && hostConfig.Memory > 0 ? hostConfig.Memory : undefined,
  };
  const healthCheck: HealthCheckConfig | undefined = config.Healthcheck?.Test
    ? {
        test: config.Healthcheck.Test,
        intervalNanos: config.Healthcheck.Interval,
        timeoutNanos: config.Healthcheck.Timeout,
        retries: config.Healthcheck.Retries,
        startPeriodNanos: config.Healthcheck.StartPeriod,
      }
    : undefined;
  const health: HealthCheckResult | undefined = state.Health
    ? {
        status: state.Health.Status ?? "none",
        failingStreak: state.Health.FailingStreak,
        log: (state.Health.Log ?? []).map((entry) => ({ start: entry.Start, end: entry.End, exitCode: entry.ExitCode, output: entry.Output })),
      }
    : undefined;
  const networks: NetworkAttachment[] = Object.entries(raw.NetworkSettings?.Networks ?? {}).map(([name, network]) => ({ name, ipAddress: network.IPAddress }));

  return {
    id: raw.Id,
    name: raw.Name.replace(/^\//, ""),
    image: config.Image ?? "",
    command: config.Cmd ?? [],
    entrypoint: config.Entrypoint ?? (raw.Path ? [raw.Path, ...(raw.Args ?? [])] : []),
    createdAt: raw.Created,
    state: { status: state.Status ?? "unknown", startedAt: state.StartedAt, finishedAt: state.FinishedAt, exitCode: state.ExitCode },
    restartPolicy,
    resourceLimits,
    env: config.Env ?? [],
    ports: portsFromRaw(hostConfig.PortBindings ?? raw.NetworkSettings?.Ports),
    mounts: mountsFromRaw(raw.Mounts ?? []),
    networks,
    labels: config.Labels ?? {},
    healthCheck,
    health,
    raw,
  };
}

/** Starts the background CPU/memory sampler for running containers; idempotent. */
export function startStatsSampler(): void {
  if (samplerStarted) return;
  samplerStarted = true;
  void sampleLoop();
}

async function sampleLoop(): Promise<void> {
  for (;;) {
    await sampleOnce().catch(() => undefined);
    await delay(STATS_SAMPLE_INTERVAL_MS);
  }
}

async function sampleOnce(): Promise<void> {
  const client = getEngineClient();
  const response = await client.request("/containers/json");
  const running = JSON.parse(response.body) as RawContainer[];
  const runningIds = new Set(running.map((container) => container.Id));
  for (const id of statsCache.keys()) {
    if (!runningIds.has(id)) statsCache.delete(id);
  }
  await Promise.all(
    running.map(async (container) => {
      try {
        const statsResponse = await client.request(`/containers/${container.Id}/stats?stream=false`);
        statsCache.set(container.Id, computeUsage(JSON.parse(statsResponse.body) as RawStats));
      } catch {
        // container stopped mid-sample or stats unavailable for it: skip this tick
      }
    }),
  );
}

/**
 * Everything the list shows, read out of the one frame the sampler already
 * fetched: the CPU count the percentage is measured against and the network
 * totals were both in it and both discarded. Nothing here asks the daemon for
 * anything — the request count per pass is unchanged.
 */
function computeUsage(raw: RawStats): SampledUsage {
  const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
  const systemDelta = (raw.cpu_stats.system_cpu_usage ?? 0) - (raw.precpu_stats.system_cpu_usage ?? 0);
  const onlineCpus = raw.cpu_stats.online_cpus ?? raw.cpu_stats.cpu_usage.percpu_usage?.length ?? 1;
  const cpuPercent = systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * onlineCpus * 100 : 0;
  const cache = raw.memory_stats.stats?.cache ?? raw.memory_stats.stats?.inactive_file ?? 0;
  const memoryUsageBytes = Math.max((raw.memory_stats.usage ?? 0) - cache, 0);
  // Summed over the frame's interfaces, the reading `ContainerStatsService`
  // normalises for the detail panel, so the list and the panel cannot disagree.
  let networkRxBytes = 0;
  let networkTxBytes = 0;
  for (const entry of Object.values(raw.networks ?? {})) {
    networkRxBytes += entry.rx_bytes ?? 0;
    networkTxBytes += entry.tx_bytes ?? 0;
  }
  return {
    cpuPercent,
    memoryUsageBytes,
    memoryLimitBytes: raw.memory_stats.limit ?? 0,
    onlineCpus,
    networkRxBytes,
    networkTxBytes,
  };
}

function toSummary(raw: RawContainer): ContainerSummary {
  const usage = statsCache.get(raw.Id);
  return {
    id: raw.Id,
    shortId: raw.Id.slice(0, 12),
    name: (raw.Names?.[0] ?? "").replace(/^\//, ""),
    image: raw.Image,
    state: raw.State as ContainerState,
    status: raw.Status,
    ports: (raw.Ports ?? []).map((port) => ({ privatePort: port.PrivatePort, publicPort: port.PublicPort, type: port.Type })),
    cpuPercent: usage?.cpuPercent,
    memoryUsageBytes: usage?.memoryUsageBytes,
    memoryLimitBytes: usage?.memoryLimitBytes,
    onlineCpus: usage?.onlineCpus,
    networkRxBytes: usage?.networkRxBytes,
    networkTxBytes: usage?.networkTxBytes,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
