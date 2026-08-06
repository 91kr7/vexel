import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import type { DaemonEvent } from "../../src/events/event-stream-service.js";

// Stands in for the daemon's raw /events stream: EventStreamService asks its
// EngineClient for a new stream every time it (re)connects, so tests hand out
// streams from a queue mirroring that reconnect sequence.
const pendingStreams: PassThrough[] = [];
const pendingWaiters: Array<(stream: PassThrough) => void> = [];

function nextRequestedStream(): Promise<PassThrough> {
  const queued = pendingStreams.shift();
  if (queued) return Promise.resolve(queued);
  return new Promise((resolve) => pendingWaiters.push(resolve));
}

function offerStream(stream: PassThrough): void {
  const waiter = pendingWaiters.shift();
  if (waiter) waiter(stream);
  else pendingStreams.push(stream);
}

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({ requestStream: async () => nextRequestedStream() }),
  },
});

const { eventStreamService } = await import("../../src/events/event-stream-service.js");

function rawDaemonEvent(type: string, action: string, actorName: string): string {
  return JSON.stringify({
    time: Math.floor(Date.now() / 1000),
    Type: type,
    Action: action,
    Actor: { ID: `${type}-${actorName}`, Attributes: { name: actorName } },
  });
}

function waitForEvent(): Promise<DaemonEvent> {
  return new Promise((resolve) => eventStreamService.once("event", resolve));
}

// events/specs/event-stream-service.md — a malformed line is skipped rather than stopping the stream
test("skips a malformed event line and still normalizes the next valid one", async () => {
  const stream = new PassThrough();
  offerStream(stream);
  eventStreamService.start();

  const receivedPromise = waitForEvent();
  stream.write("not-json-at-all\n");
  stream.write(rawDaemonEvent("network", "create", "test-net-1") + "\n");
  const received = await receivedPromise;

  assert.equal(received.type, "network");
  assert.equal(received.action, "create");
  assert.equal(received.actor, "test-net-1");
  assert.match(received.timestamp, /^\d{4}-\d{2}-\d{2}T/);

  stream.end();
});

// events/specs/event-stream-service.md — the backlog never grows past 50 entries, oldest dropped first
test("keeps at most the 50 most recent events in the backlog, dropping the oldest first", async () => {
  const stream = new PassThrough();
  offerStream(stream);

  await new Promise<void>((resolve) => {
    let received = 0;
    const handler = () => {
      received += 1;
      if (received === 60) {
        eventStreamService.off("event", handler);
        resolve();
      }
    };
    eventStreamService.on("event", handler);
    for (let i = 0; i < 60; i += 1) stream.write(rawDaemonEvent("container", "start", `c-${i}`) + "\n");
  });

  const backlog = eventStreamService.getBacklog();
  assert.equal(backlog.length, 50);
  assert.equal(backlog[0]?.actor, "c-10");
  assert.equal(backlog[49]?.actor, "c-59");

  stream.end();
});

// events/specs/event-stream-service.md — reconnects (with backoff) once the daemon stream ends
test("reconnects and keeps delivering events after the daemon stream ends", async () => {
  const nextStream = new PassThrough();
  offerStream(nextStream);

  const receivedPromise = waitForEvent();
  nextStream.write(rawDaemonEvent("volume", "destroy", "v-1") + "\n");
  const received = await receivedPromise;

  assert.equal(received.type, "volume");
  assert.equal(received.action, "destroy");
});
