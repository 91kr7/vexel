import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import type { DaemonEvent } from "../../src/events/event-stream-service.js";

// The identity of an event, as events/specs/event-stream-service.md states it:
// minted once at arrival from the daemon's own nanosecond instant, and never
// shared by two events of one object inside one second.

// Stands in for the daemon's raw /events stream. One stream serves the whole
// file: the service asks for a new one only when the current one ends, and
// nothing here ends it, so no reconnect backoff runs between tests.
const daemonStream = new PassThrough();

mock.module(new URL("../../src/docker/engine-client.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({ requestStream: async () => daemonStream }),
  },
});

const { eventStreamService } = await import("../../src/events/event-stream-service.js");

interface RawEventFields {
  type: string;
  action: string;
  actorId: string;
  actorName: string;
  seconds: number;
  /** The nanosecond stamp's digits, written into the line verbatim. Omitted = the daemon reports none. */
  nanos?: string;
  /** Raw attribute pairs placed before `name`, e.g. a decoy of the daemon's own field. */
  attributesPrefix?: string;
}

/**
 * A raw line as the daemon writes one.
 *
 * Built as text rather than through `JSON.stringify`, because a nanosecond
 * stamp does not survive a round trip through a JavaScript number: the whole
 * point of the tests below is the digits a double rounds away.
 */
function rawLine(fields: RawEventFields): string {
  const attributes = `${fields.attributesPrefix ?? ""}"name":${JSON.stringify(fields.actorName)}`;
  const nano = fields.nanos === undefined ? "" : `,"timeNano":${fields.nanos}`;
  return (
    `{"status":${JSON.stringify(fields.action)},"id":${JSON.stringify(fields.actorId)},` +
    `"Type":${JSON.stringify(fields.type)},"Action":${JSON.stringify(fields.action)},` +
    `"Actor":{"ID":${JSON.stringify(fields.actorId)},"Attributes":{${attributes}}},` +
    `"scope":"local","time":${fields.seconds}${nano}}`
  );
}

/** Writes the given raw lines and resolves with the events they produce, in order. */
function feed(lines: string[]): Promise<DaemonEvent[]> {
  return new Promise((resolve) => {
    const received: DaemonEvent[] = [];
    const handler = (event: DaemonEvent) => {
      received.push(event);
      if (received.length === lines.length) {
        eventStreamService.off("event", handler);
        resolve(received);
      }
    };
    eventStreamService.on("event", handler);
    for (const line of lines) daemonStream.write(line + "\n");
  });
}

eventStreamService.start();

// events/specs/event-stream-service.md — "a stop and a start on the same container inside one second
// are two identities"; batch-event-feed-keys acceptance
test("gives a stop and a start on one container inside one second two distinct identities", async () => {
  const seconds = 1786229808;
  const container = "container-same-second";
  const [stopped, started] = await feed([
    rawLine({ type: "container", action: "stop", actorId: container, actorName: "c-1", seconds, nanos: `${seconds}123000000` }),
    rawLine({ type: "container", action: "start", actorId: container, actorName: "c-1", seconds, nanos: `${seconds}876000000` }),
  ]);

  assert.ok(stopped && started);
  // The collision the identity has to survive: one object, one clock second.
  assert.equal(stopped.timestamp.slice(0, 19), started.timestamp.slice(0, 19));
  assert.notEqual(stopped.id, started.id);
  assert.equal(stopped.action, "stop");
  assert.equal(started.action, "start");
});

// events/specs/event-stream-service.md — "the nanosecond digits are taken from the raw line because a
// double rounds the last of them away"
test("separates two events one nanosecond apart, below what a parsed double can hold", async () => {
  const seconds = 1786229809;
  const earlier = `${seconds}123456789`;
  const later = `${seconds}123456790`;
  // Precondition, and the reason the digits cannot come from the parsed value:
  // a double of this magnitude holds neither stamp apart from the other.
  assert.equal(
    (JSON.parse(`{"n":${earlier}}`) as { n: number }).n,
    (JSON.parse(`{"n":${later}}`) as { n: number }).n,
  );

  const container = "container-one-nanosecond";
  const [first, second] = await feed([
    rawLine({ type: "container", action: "exec_die", actorId: container, actorName: "c-2", seconds, nanos: earlier }),
    rawLine({ type: "container", action: "exec_die", actorId: container, actorName: "c-2", seconds, nanos: later }),
  ]);

  assert.ok(first && second);
  assert.notEqual(first.id, second.id);
});

// events/specs/event-stream-service.md — "the daemon's own instant, to the millisecond when the daemon
// reports one"
test("timestamps an event at the daemon's own instant, to the millisecond", async () => {
  const [event] = await feed([
    rawLine({
      type: "image",
      action: "tag",
      actorId: "image-millisecond",
      actorName: "img-1",
      seconds: 1786229810,
      nanos: "1786229810123456789",
    }),
  ]);

  assert.ok(event);
  assert.equal(event.timestamp, new Date(1_786_229_810_123).toISOString());
});

// events/specs/event-stream-service.md — "an identity is minted once, when the event arrives, and never
// recomputed": the emitted event and the backlogged one carry the same id
test("carries one identity from the emission into the backlog, unchanged on every reading", async () => {
  const [event] = await feed([
    rawLine({
      type: "network",
      action: "create",
      actorId: "network-stable",
      actorName: "net-stable",
      seconds: 1786229811,
      nanos: "1786229811555000000",
    }),
  ]);

  assert.ok(event);
  const firstReading = eventStreamService.getBacklog().filter((held) => held.actor === "net-stable");
  const secondReading = eventStreamService.getBacklog().filter((held) => held.actor === "net-stable");
  assert.equal(firstReading.length, 1);
  assert.equal(firstReading[0]?.id, event.id);
  assert.equal(secondReading[0]?.id, event.id);
});

// events/specs/event-stream-service.md — "when the daemon reports no nanosecond stamp, the identity
// carries a monotonic arrival ordinal instead ... minted on the server, once, at arrival"
test("separates two indistinguishable events of one second when the daemon reports no nanosecond stamp", async () => {
  const seconds = 1786229812;
  const line = rawLine({ type: "volume", action: "mount", actorId: "volume-no-nano", actorName: "vol-no-nano", seconds });
  const [first, second] = await feed([line, line]);

  assert.ok(first && second);
  assert.notEqual(first.id, second.id);
  // Minted at arrival and stored, so the backlog hands out the very same pair
  // rather than two fresh ordinals.
  const held = eventStreamService.getBacklog().filter((event) => event.actor === "vol-no-nano");
  assert.deepEqual(
    held.map((event) => event.id),
    [first.id, second.id],
  );
});

// events/specs/event-stream-service.md — the instant in the identity is the daemon's own, so an actor
// attribute of the same name must not displace it
test("keeps the daemon's own nanosecond stamp when an actor attribute is named after it", async () => {
  const seconds = 1786229813;
  const decoy = `"timeNano":"1500000000000000000",`;
  const container = "container-decoy";
  const [first, second] = await feed([
    rawLine({
      type: "container",
      action: "exec_die",
      actorId: container,
      actorName: "c-decoy",
      seconds,
      nanos: `${seconds}123456789`,
      attributesPrefix: decoy,
    }),
    rawLine({
      type: "container",
      action: "exec_die",
      actorId: container,
      actorName: "c-decoy",
      seconds,
      nanos: `${seconds}123456790`,
      attributesPrefix: decoy,
    }),
  ]);

  assert.ok(first && second);
  assert.equal(first.timestamp, new Date(1_786_229_813_123).toISOString());
  assert.notEqual(first.id, second.id);
});

// live-channel/specs/live-channel-endpoint.md — "an identity never breaks the frame: it is written on a
// single line"; an exec_create action carries a command line that may hold one
test("keeps an identity on a single line when the action carries a newline", async () => {
  const [event] = await feed([
    rawLine({
      type: "container",
      action: "exec_create: sh -c echo one\necho two",
      actorId: "container-newline",
      actorName: "c-newline",
      seconds: 1786229814,
      nanos: "1786229814000000000",
    }),
  ]);

  assert.ok(event);
  assert.equal(event.action, "exec_create: sh -c echo one\necho two");
  assert.doesNotMatch(event.id, /[\r\n]/);
});
