// Subscribes to the daemon's `/events` stream and re-publishes normalized
// events to server-side listeners, with reconnection/backoff and a short
// in-memory backlog for subscribers that connect late (REQ-11, REQ-12).
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { getEngineClient } from "../docker/engine-client.js";
import { onActiveEndpointChanged } from "../docker/endpoint.js";

export interface DaemonEvent {
  id: string;
  timestamp: string;
  type: string;
  action: string;
  /** The object's name when the daemon reports one, else its identifier. */
  actor?: string;
  /** The object's identifier, whatever the daemon reported as its name (plan-docker_management_app-refresh_cache/REQ-6). */
  actorId?: string;
}

const BACKLOG_LIMIT = 50;
/** How far `JSON.parse` can move a nanosecond stamp of this magnitude. */
const NANO_ROUNDING_MARGIN = 1024;
// Tolerances, not cadences: how long a daemon that dropped the event stream is left alone.
// Shortened, a reconnection becomes a retry storm against a daemon that is still coming back.
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

class EventStreamService extends EventEmitter {
  private backlog: DaemonEvent[] = [];
  private backoffMs = INITIAL_BACKOFF_MS;
  private started = false;
  private currentStream?: IncomingMessage;
  private wake?: () => void;
  private reconnectRequested = false;
  private nextArrivalOrdinal = 0;
  private connected = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    onActiveEndpointChanged(() => this.restart());
    void this.connectLoop();
  }

  getBacklog(): DaemonEvent[] {
    return [...this.backlog];
  }

  /**
   * Registers `listener` to run whenever this stream's own connection to the
   * daemon drops or comes back; returns the unsubscribe function. It is the
   * cheapest liveness signal the server has — the stream is already open — so
   * whoever holds a reachability answer re-reads on it instead of polling for
   * the change (plan-docker_management_app-refresh_cache/REQ-15).
   */
  onConnectionChanged(listener: (connected: boolean) => void): () => void {
    this.on("connection", listener);
    return () => {
      this.off("connection", listener);
    };
  }

  /** Whether the stream is currently reading from the daemon. */
  isConnected(): boolean {
    return this.connected;
  }

  private setConnected(connected: boolean): void {
    if (this.connected === connected) return;
    this.connected = connected;
    this.emit("connection", connected);
  }

  /**
   * Drops the stream of the daemon left behind and reconnects at once against
   * the newly active context (REQ-93). The backlog goes with it: those events
   * describe another daemon's objects.
   */
  private restart(): void {
    this.backlog = [];
    this.backoffMs = INITIAL_BACKOFF_MS;
    // Flagged, not just woken: the switch can land while a stream is live, and
    // the loop must then skip the backoff it is about to enter, not only the
    // one it is already waiting out.
    this.reconnectRequested = true;
    this.currentStream?.destroy();
    this.wake?.();
  }

  private async connectLoop(): Promise<void> {
    for (;;) {
      try {
        const stream = await getEngineClient().requestStream("/events");
        this.currentStream = stream;
        // A switch that landed while this request was in flight opened it on
        // the daemon left behind: drop it before it republishes an event.
        if (this.reconnectRequested) stream.destroy();
        this.backoffMs = INITIAL_BACKOFF_MS;
        this.setConnected(true);
        await this.consume(stream);
      } catch {
        // daemon unreachable or the stream broke; retried below with backoff
      } finally {
        this.currentStream = undefined;
        this.setConnected(false);
      }
      if (this.takeReconnectRequest()) continue;
      await this.pause(this.backoffMs);
      if (this.takeReconnectRequest()) continue;
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    }
  }

  /** Whether a context switch is asking for an immediate reconnect; clears the request. */
  private takeReconnectRequest(): boolean {
    if (!this.reconnectRequested) return false;
    this.reconnectRequested = false;
    return true;
  }

  /** Waits out the backoff, unless a context switch asks for an immediate reconnect. */
  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wake = undefined;
        resolve();
      }, ms);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = undefined;
        resolve();
      };
    });
  }

  private consume(stream: IncomingMessage): Promise<void> {
    return new Promise((resolve) => {
      let buffer = "";
      stream.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) this.handleRawEvent(line);
          newlineIndex = buffer.indexOf("\n");
        }
      });
      stream.once("end", resolve);
      stream.once("close", resolve);
      stream.once("error", resolve);
    });
  }

  private handleRawEvent(line: string): void {
    try {
      const raw = JSON.parse(line) as {
        time?: number;
        Type?: string;
        Action?: string;
        scope?: string;
        timeNano?: number;
        Actor?: { ID?: string; Attributes?: Record<string, string> };
      };
      const timeNano = readTimeNano(line, raw.timeNano);
      const event: DaemonEvent = {
        id: this.buildEventId(raw, timeNano),
        timestamp: this.buildTimestamp(raw.time, timeNano),
        type: raw.Type ?? "unknown",
        action: raw.Action ?? "unknown",
        actor: raw.Actor?.Attributes?.name ?? raw.Actor?.ID,
        actorId: raw.Actor?.ID,
      };
      this.backlog.push(event);
      if (this.backlog.length > BACKLOG_LIMIT) this.backlog.shift();
      this.emit("event", event);
    } catch {
      // malformed line from the daemon stream: skip it rather than crash the loop
    }
  }

  /**
   * The identity of an event, minted once here and carried unchanged through
   * the backlog, so every delivery of the same event bears the same id while
   * two distinct events never share one. `time` alone cannot do it: it has
   * second resolution, and a stop/start pair on one container lands inside a
   * single second routinely.
   */
  private buildEventId(
    raw: { time?: number; Type?: string; Action?: string; scope?: string; Actor?: { ID?: string } },
    timeNano: string | undefined,
  ): string {
    // Without a nanosecond stamp the daemon offers nothing that separates two
    // identical actions on one object in one second, so an arrival ordinal is
    // synthesised — server-side and once, so it survives re-delivery.
    const instant = timeNano ?? `${raw.time ?? Math.floor(Date.now() / 1000)}#${(this.nextArrivalOrdinal += 1)}`;
    const parts = [instant, raw.scope ?? "local", raw.Type ?? "unknown", raw.Action ?? "unknown", raw.Actor?.ID ?? ""];
    // An `exec_create` action carries the command line: a newline inside it
    // would split the identity across two lines of the SSE frame.
    return parts.join("-").replace(/[\r\n]+/g, " ");
  }

  private buildTimestamp(timeSeconds: number | undefined, timeNano: string | undefined): string {
    if (timeNano) return new Date(Number(timeNano) / 1e6).toISOString();
    return new Date((timeSeconds ?? Date.now() / 1000) * 1000).toISOString();
  }
}

/**
 * The daemon's nanosecond stamp, as digits. `timeNano` is larger than a double
 * can hold exactly, so `JSON.parse` rounds its last digits away and the raw
 * line is read for them — but the first `"timeNano"` on the line could belong
 * to an actor attribute of that name, so the parsed value is what decides
 * whether those digits are the daemon's own stamp.
 */
function readTimeNano(line: string, parsed: number | undefined): string | undefined {
  if (typeof parsed !== "number") return undefined;
  const digits = /"timeNano"\s*:\s*(\d+)/.exec(line)?.[1];
  const trustworthy = digits !== undefined && Math.abs(Number(digits) - parsed) <= NANO_ROUNDING_MARGIN;
  return trustworthy ? digits : String(Math.round(parsed));
}

export const eventStreamService = new EventStreamService();
