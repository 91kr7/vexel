import { test, mock, after } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import type { DaemonEvent } from "../../src/events/event-stream-service.js";

// What the daemon event stream does when another context becomes the active one
// (events/specs/event-stream-service.md, REQ-93). The EngineClient is mocked —
// no daemon is dialed — so the drop/empty/reconnect sequence is the only
// behaviour under test; the real Active endpoint drives it, since publishing an
// endpoint is what announces the switch.
const pendingStreams: PassThrough[] = [];
const pendingWaiters: Array<(stream: PassThrough) => void> = [];
let streamsRequested = 0;

const requestTimes: number[] = [];

function nextRequestedStream(): Promise<PassThrough> {
  streamsRequested += 1;
  requestTimes.push(Date.now());
  const queued = pendingStreams.shift();
  if (queued) return Promise.resolve(queued);
  return new Promise((resolve) => pendingWaiters.push(resolve));
}

function offerStream(stream: PassThrough): void {
  const waiter = pendingWaiters.shift();
  if (waiter) waiter(stream);
  else pendingStreams.push(stream);
}

mock.module(new URL("../../src/docker/engine-client.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({ requestStream: async () => nextRequestedStream() }),
  },
});

const { eventStreamService } = await import("../../src/events/event-stream-service.js");
const { setActiveEndpoint } = await import("../../src/docker/endpoint.js");

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

after(() => {
  setActiveEndpoint(undefined);
});

// events/specs/event-stream-service.md — "When the active context changes, the stream of the daemon
// left behind is dropped and a new one is opened against the newly active daemon at once, without
// waiting out the pending backoff (REQ-93). The backlog is emptied at the same time: those events
// describe another daemon's objects."
test("a context switch empties the backlog and reconnects at once against the new daemon", { timeout: 15_000 }, async () => {
  const firstStream = new PassThrough();
  offerStream(firstStream);
  eventStreamService.start();

  // An event from the daemon left behind, so the backlog is not empty to begin with.
  const firstEvent = waitForEvent();
  firstStream.write(rawDaemonEvent("container", "start", "before-switch") + "\n");
  await firstEvent;
  assert.ok(eventStreamService.getBacklog().length > 0, "expected the first daemon's event in the backlog");

  const requestsBeforeSwitch = streamsRequested;
  const secondStream = new PassThrough();
  offerStream(secondStream);

  const switchedAt = Date.now();
  setActiveEndpoint({ kind: "ssh", destination: "operator@build-host" });

  // The events of the daemon left behind describe another daemon's objects.
  assert.deepEqual(eventStreamService.getBacklog(), []);

  const secondEvent = waitForEvent();
  await new Promise((resolve) => setTimeout(resolve, 50));
  secondStream.write(rawDaemonEvent("volume", "create", "after-switch") + "\n");
  const received = await secondEvent;

  assert.equal(received.actor, "after-switch");
  assert.ok(
    streamsRequested > requestsBeforeSwitch,
    "expected a new stream to be opened against the newly active daemon",
  );
  // "at once, without waiting out the pending backoff": the reconnect is the
  // switch's own, not the connect loop's next scheduled retry (1s and doubling).
  const reconnectDelayMs = requestTimes[requestsBeforeSwitch]! - switchedAt;
  assert.ok(
    reconnectDelayMs < 500,
    `expected the new daemon's stream to be opened at once after the switch, waited ${reconnectDelayMs}ms`,
  );
  // Only the new daemon's event is in the backlog: the previous one's is gone for good.
  assert.deepEqual(
    eventStreamService.getBacklog().map((event) => event.actor),
    ["after-switch"],
  );

  firstStream.end();
  secondStream.end();
});

/** Resolves once the connect loop is waiting on a stream it has already asked for. */
async function waitForRequestInFlight(): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (pendingWaiters.length === 0) {
    if (Date.now() > deadline) throw new Error("no stream request went in flight");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

// events/specs/event-stream-service.md — the switch skips the backoff "whether the switch lands
// while a stream is live or while one is being waited for (REQ-93)". The stream of the daemon left
// behind must not be consumed when it finally arrives, or the application would be fed another
// daemon's events.
test("a switch landing while a stream is still being waited for discards that stream on arrival", { timeout: 15_000 }, async () => {
  await waitForRequestInFlight();
  const requestsBeforeSwitch = streamsRequested;

  const switchedAt = Date.now();
  setActiveEndpoint({ kind: "ssh", destination: "operator@another-host" });

  // The daemon left behind answers only now, after the switch: its stream is stale on arrival.
  const staleStream = new PassThrough();
  staleStream.on("error", () => undefined);
  offerStream(staleStream);

  const freshStream = new PassThrough();
  offerStream(freshStream);
  const received = waitForEvent();
  await new Promise((resolve) => setTimeout(resolve, 100));
  staleStream.write(rawDaemonEvent("container", "start", "stale-daemon") + "\n");
  freshStream.write(rawDaemonEvent("network", "create", "fresh-daemon") + "\n");

  assert.equal((await received).actor, "fresh-daemon");
  assert.ok(staleStream.destroyed, "the stream of the daemon left behind must be destroyed on arrival");
  assert.deepEqual(
    eventStreamService.getBacklog().map((event) => event.actor),
    ["fresh-daemon"],
  );
  const reconnectDelayMs = requestTimes[requestsBeforeSwitch]! - switchedAt;
  assert.ok(
    reconnectDelayMs < 1_000,
    `expected the newly active daemon's stream to be asked for without a backoff, waited ${reconnectDelayMs}ms`,
  );

  staleStream.end();
  freshStream.end();
});
