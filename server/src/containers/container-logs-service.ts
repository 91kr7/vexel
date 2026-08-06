// Container log streaming over the Engine API (REQ-30): stream selection,
// follow, timestamps, tail size and since/until, decoded into discrete lines
// and cancellable as soon as the consumer goes away.
import type { IncomingMessage } from "node:http";
import { getEngineClient } from "../connectivity/connection-status-service.js";

export type LogStreamName = "stdout" | "stderr";

export interface ContainerLogLine {
  seq: number;
  stream: LogStreamName;
  timestamp?: string;
  text: string;
}

export interface ContainerLogOptions {
  stdout?: boolean;
  stderr?: boolean;
  follow?: boolean;
  timestamps?: boolean;
  tail?: number | "all";
  since?: string;
  until?: string;
}

export interface ContainerLogHandlers {
  onLine: (line: ContainerLogLine) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

const DOCKER_FRAME_HEADER_BYTES = 8;
const RELATIVE_DURATION = /^(\d+)([smhd])$/;
const DURATION_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

export async function streamContainerLogs(
  id: string,
  options: ContainerLogOptions,
  handlers: ContainerLogHandlers,
): Promise<() => void> {
  const engine = getEngineClient();
  const tty = await isTtyContainer(engine, id);
  const response = await engine.requestStream(`/containers/${encodeURIComponent(id)}/logs${buildQuery(options)}`);

  let cancelled = false;
  const decoder = tty ? new RawStreamDecoder() : new MultiplexedStreamDecoder();
  let seq = 0;

  const emit = (stream: LogStreamName, rawLine: string) => {
    if (cancelled) return;
    seq += 1;
    handlers.onLine({ seq, stream, ...splitTimestamp(rawLine, options.timestamps === true) });
  };

  response.on("data", (chunk: Buffer) => {
    if (cancelled) return;
    decoder.push(chunk, emit);
  });
  response.on("error", (error: Error) => {
    if (cancelled) return;
    handlers.onError(error.message);
  });
  response.on("end", () => {
    if (cancelled) return;
    decoder.flush(emit);
    handlers.onEnd();
  });

  return () => {
    if (cancelled) return;
    cancelled = true;
    response.destroy();
  };
}

async function isTtyContainer(engine: ReturnType<typeof getEngineClient>, id: string): Promise<boolean> {
  const response = await engine.request(`/containers/${encodeURIComponent(id)}/json`);
  const payload = JSON.parse(response.body) as { Config?: { Tty?: boolean } };
  return payload.Config?.Tty === true;
}

function buildQuery(options: ContainerLogOptions): string {
  const stdout = options.stdout ?? true;
  const stderr = options.stderr ?? true;
  const bothOff = !stdout && !stderr;
  const params = new URLSearchParams();
  params.set("stdout", bothOff || stdout ? "1" : "0");
  params.set("stderr", bothOff || stderr ? "1" : "0");
  params.set("follow", (options.follow ?? true) ? "1" : "0");
  params.set("timestamps", options.timestamps ? "1" : "0");
  params.set("tail", options.tail === undefined || options.tail === "all" ? "all" : String(options.tail));
  const since = toUnixSeconds(options.since);
  if (since !== undefined) params.set("since", String(since));
  const until = toUnixSeconds(options.until);
  if (until !== undefined) params.set("until", String(until));
  return `?${params.toString()}`;
}

/** Accepts an ISO-8601 instant or a relative duration ("30s", "5m", "2h", "1d"). */
function toUnixSeconds(value: string | undefined): number | undefined {
  if (!value || value.trim() === "") return undefined;
  const trimmed = value.trim();
  const relative = RELATIVE_DURATION.exec(trimmed);
  if (relative) {
    const seconds = Number(relative[1]) * DURATION_SECONDS[relative[2]];
    return Math.floor(Date.now() / 1000) - seconds;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? undefined : Math.floor(parsed / 1000);
}

function splitTimestamp(line: string, timestamps: boolean): { timestamp?: string; text: string } {
  if (!timestamps) return { text: line };
  const separatorIndex = line.indexOf(" ");
  if (separatorIndex === -1) return { text: line };
  const candidate = line.slice(0, separatorIndex);
  if (Number.isNaN(Date.parse(candidate))) return { text: line };
  return { timestamp: candidate, text: line.slice(separatorIndex + 1) };
}

type LineEmitter = (stream: LogStreamName, line: string) => void;

/** Raw (TTY) log stream: no framing, every line belongs to stdout. */
class RawStreamDecoder {
  private pending = "";

  push(chunk: Buffer, emit: LineEmitter): void {
    this.pending += chunk.toString("utf8");
    const lines = this.pending.split("\n");
    this.pending = lines.pop() ?? "";
    for (const line of lines) emit("stdout", stripCarriageReturn(line));
  }

  flush(emit: LineEmitter): void {
    if (this.pending === "") return;
    emit("stdout", stripCarriageReturn(this.pending));
    this.pending = "";
  }
}

/**
 * Multiplexed (non-TTY) log stream: 8-byte frame headers carry the stream id
 * and the payload size. Payloads are reassembled per stream so a line split
 * across frames is emitted once, whole.
 */
class MultiplexedStreamDecoder {
  private buffer: Buffer = Buffer.alloc(0);
  private readonly pending: Record<LogStreamName, string> = { stdout: "", stderr: "" };

  push(chunk: Buffer, emit: LineEmitter): void {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= DOCKER_FRAME_HEADER_BYTES) {
      const size = this.buffer.readUInt32BE(4);
      if (this.buffer.length < DOCKER_FRAME_HEADER_BYTES + size) return;
      const stream: LogStreamName = this.buffer.readUInt8(0) === 2 ? "stderr" : "stdout";
      const payload = this.buffer.subarray(DOCKER_FRAME_HEADER_BYTES, DOCKER_FRAME_HEADER_BYTES + size).toString("utf8");
      this.buffer = this.buffer.subarray(DOCKER_FRAME_HEADER_BYTES + size);
      const lines = (this.pending[stream] + payload).split("\n");
      this.pending[stream] = lines.pop() ?? "";
      for (const line of lines) emit(stream, stripCarriageReturn(line));
    }
  }

  flush(emit: LineEmitter): void {
    for (const stream of ["stdout", "stderr"] as LogStreamName[]) {
      if (this.pending[stream] === "") continue;
      emit(stream, stripCarriageReturn(this.pending[stream]));
      this.pending[stream] = "";
    }
  }
}

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
