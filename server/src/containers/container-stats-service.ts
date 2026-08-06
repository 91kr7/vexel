// Live per-container resource usage over the Engine API (REQ-32): the daemon's
// raw stats frames normalised into ready-to-display readings, cancellable as
// soon as the consumer goes away.
import { getEngineClient } from "../connectivity/connection-status-service.js";

export interface ContainerStatsSample {
  /** ISO-8601 instant the daemon produced the frame. */
  at: string;
  cpuPercent: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  /** Usage over limit, 0 when no limit is known. */
  memoryPercent: number;
  networkRxBytes: number;
  networkTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  pids: number;
}

export interface ContainerStatsHandlers {
  onSample: (sample: ContainerStatsSample) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

interface RawStatsFrame {
  read?: string;
  preread?: string;
  cpu_stats?: RawCpuStats;
  precpu_stats?: RawCpuStats;
  memory_stats?: {
    usage?: number;
    limit?: number;
    stats?: { cache?: number; inactive_file?: number };
  };
  networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>;
  blkio_stats?: { io_service_bytes_recursive?: { op?: string; value?: number }[] | null };
  pids_stats?: { current?: number };
}

interface RawCpuStats {
  cpu_usage?: { total_usage?: number; percpu_usage?: number[] };
  system_cpu_usage?: number;
  online_cpus?: number;
}

/**
 * Opens the daemon's streaming stats for a container and reports one
 * normalised sample per frame. Returns a cancel function that closes the
 * daemon stream; after cancelling, no handler is called again.
 */
export async function streamContainerStats(id: string, handlers: ContainerStatsHandlers): Promise<() => void> {
  const engine = getEngineClient();
  const response = await engine.requestStream(`/containers/${encodeURIComponent(id)}/stats?stream=true`);

  let cancelled = false;
  let pending = "";

  const consume = (frame: string) => {
    const trimmed = frame.trim();
    if (trimmed === "") return;
    let raw: RawStatsFrame;
    try {
      raw = JSON.parse(trimmed) as RawStatsFrame;
    } catch {
      // A partial or non-JSON frame is skipped rather than failing the stream.
      return;
    }
    handlers.onSample(normalizeSample(raw));
  };

  response.on("data", (chunk: Buffer) => {
    if (cancelled) return;
    pending += chunk.toString("utf8");
    const frames = pending.split("\n");
    pending = frames.pop() ?? "";
    for (const frame of frames) consume(frame);
  });
  response.on("error", (error: Error) => {
    if (cancelled) return;
    handlers.onError(error.message);
  });
  response.on("end", () => {
    if (cancelled) return;
    consume(pending);
    pending = "";
    handlers.onEnd();
  });

  return () => {
    if (cancelled) return;
    cancelled = true;
    response.destroy();
  };
}

export function normalizeSample(raw: RawStatsFrame): ContainerStatsSample {
  const memoryUsageBytes = computeMemoryUsage(raw);
  const memoryLimitBytes = raw.memory_stats?.limit ?? 0;
  const network = sumNetworks(raw);
  const block = sumBlockIo(raw);
  return {
    at: raw.read && !Number.isNaN(Date.parse(raw.read)) ? new Date(raw.read).toISOString() : new Date().toISOString(),
    cpuPercent: computeCpuPercent(raw),
    memoryUsageBytes,
    memoryLimitBytes,
    memoryPercent: memoryLimitBytes > 0 ? (memoryUsageBytes / memoryLimitBytes) * 100 : 0,
    networkRxBytes: network.rx,
    networkTxBytes: network.tx,
    blockReadBytes: block.read,
    blockWriteBytes: block.write,
    pids: raw.pids_stats?.current ?? 0,
  };
}

/**
 * The daemon marks the first frame of a stream — the one whose `precpu_stats`
 * is a placeholder rather than a real previous reading — with Go's zero
 * `time.Time` as `preread`.
 */
function isFirstFrame(raw: RawStatsFrame): boolean {
  const preread = raw.preread;
  if (preread === undefined) return false;
  const parsed = Date.parse(preread);
  return Number.isNaN(parsed) || parsed <= Date.parse("0001-01-01T00:00:00Z");
}

function computeCpuPercent(raw: RawStatsFrame): number {
  if (isFirstFrame(raw)) return 0;
  const cpuDelta = (raw.cpu_stats?.cpu_usage?.total_usage ?? 0) - (raw.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const systemDelta = (raw.cpu_stats?.system_cpu_usage ?? 0) - (raw.precpu_stats?.system_cpu_usage ?? 0);
  const onlineCpus = raw.cpu_stats?.online_cpus ?? raw.cpu_stats?.cpu_usage?.percpu_usage?.length ?? 1;
  if (systemDelta <= 0 || cpuDelta <= 0) return 0;
  return (cpuDelta / systemDelta) * onlineCpus * 100;
}

/** Page cache is excluded, matching what `docker stats` reports as used memory. */
function computeMemoryUsage(raw: RawStatsFrame): number {
  const cache = raw.memory_stats?.stats?.cache ?? raw.memory_stats?.stats?.inactive_file ?? 0;
  return Math.max((raw.memory_stats?.usage ?? 0) - cache, 0);
}

function sumNetworks(raw: RawStatsFrame): { rx: number; tx: number } {
  let rx = 0;
  let tx = 0;
  for (const entry of Object.values(raw.networks ?? {})) {
    rx += entry.rx_bytes ?? 0;
    tx += entry.tx_bytes ?? 0;
  }
  return { rx, tx };
}

function sumBlockIo(raw: RawStatsFrame): { read: number; write: number } {
  let read = 0;
  let write = 0;
  for (const entry of raw.blkio_stats?.io_service_bytes_recursive ?? []) {
    const op = (entry.op ?? "").toLowerCase();
    if (op === "read") read += entry.value ?? 0;
    else if (op === "write") write += entry.value ?? 0;
  }
  return { read, write };
}
