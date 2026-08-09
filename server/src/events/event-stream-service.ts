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
  actor?: string;
}

const BACKLOG_LIMIT = 50;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

class EventStreamService extends EventEmitter {
  private backlog: DaemonEvent[] = [];
  private backoffMs = INITIAL_BACKOFF_MS;
  private started = false;
  private currentStream?: IncomingMessage;
  private wake?: () => void;
  private reconnectRequested = false;

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
        await this.consume(stream);
      } catch {
        // daemon unreachable or the stream broke; retried below with backoff
      } finally {
        this.currentStream = undefined;
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
        Actor?: { ID?: string; Attributes?: Record<string, string> };
      };
      const event: DaemonEvent = {
        id: `${raw.time ?? Date.now()}-${raw.Actor?.ID ?? Math.random().toString(36).slice(2)}`,
        timestamp: new Date((raw.time ?? Date.now() / 1000) * 1000).toISOString(),
        type: raw.Type ?? "unknown",
        action: raw.Action ?? "unknown",
        actor: raw.Actor?.Attributes?.name ?? raw.Actor?.ID,
      };
      this.backlog.push(event);
      if (this.backlog.length > BACKLOG_LIMIT) this.backlog.shift();
      this.emit("event", event);
    } catch {
      // malformed line from the daemon stream: skip it rather than crash the loop
    }
  }
}

export const eventStreamService = new EventStreamService();
