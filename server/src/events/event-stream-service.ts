// Subscribes to the daemon's `/events` stream and re-publishes normalized
// events to server-side listeners, with reconnection/backoff and a short
// in-memory backlog for subscribers that connect late (REQ-11, REQ-12).
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { getEngineClient } from "../connectivity/connection-status-service.js";

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

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.connectLoop();
  }

  getBacklog(): DaemonEvent[] {
    return [...this.backlog];
  }

  private async connectLoop(): Promise<void> {
    for (;;) {
      try {
        const stream = await getEngineClient().requestStream("/events");
        this.backoffMs = INITIAL_BACKOFF_MS;
        await this.consume(stream);
      } catch {
        // daemon unreachable or the stream broke; retried below with backoff
      }
      await delay(this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    }
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const eventStreamService = new EventStreamService();
