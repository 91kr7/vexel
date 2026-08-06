// Container listing and lifecycle over the Engine API (REQ-19, REQ-20, REQ-21,
// REQ-22), plus a bounded-rate CPU/memory sampler for running containers
// (REQ-19) whose latest reading is merged into every list response.
import { getEngineClient } from "../connectivity/connection-status-service.js";

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
}

export interface PruneResult {
  removedIds: string[];
  reclaimedBytes: number;
}

interface RawContainer {
  Id: string;
  Names?: string[];
  Image: string;
  State: string;
  Status: string;
  Ports?: { PrivatePort: number; PublicPort?: number; Type: string }[];
}

interface RawStats {
  cpu_stats: { cpu_usage: { total_usage: number; percpu_usage?: number[] }; system_cpu_usage?: number; online_cpus?: number };
  precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number };
  memory_stats: { usage?: number; limit?: number; stats?: { cache?: number; inactive_file?: number } };
}

interface SampledUsage {
  cpuPercent: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
}

const STATS_SAMPLE_INTERVAL_MS = 3000;
const statsCache = new Map<string, SampledUsage>();
let samplerStarted = false;

export async function listContainers(): Promise<ContainerSummary[]> {
  const response = await getEngineClient().request("/containers/json?all=true");
  const raw = JSON.parse(response.body) as RawContainer[];
  return raw.map(toSummary);
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

function computeUsage(raw: RawStats): SampledUsage {
  const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
  const systemDelta = (raw.cpu_stats.system_cpu_usage ?? 0) - (raw.precpu_stats.system_cpu_usage ?? 0);
  const onlineCpus = raw.cpu_stats.online_cpus ?? raw.cpu_stats.cpu_usage.percpu_usage?.length ?? 1;
  const cpuPercent = systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * onlineCpus * 100 : 0;
  const cache = raw.memory_stats.stats?.cache ?? raw.memory_stats.stats?.inactive_file ?? 0;
  const memoryUsageBytes = Math.max((raw.memory_stats.usage ?? 0) - cache, 0);
  return { cpuPercent, memoryUsageBytes, memoryLimitBytes: raw.memory_stats.limit ?? 0 };
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
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
