import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import type { DaemonEvent } from "../../src/events/event-stream-service.js";

// What a published event says about the object it is about, as
// events/specs/event-stream-service.md states it: the identifier as a field of
// its own (plan-docker_management_app-refresh_cache/REQ-6), beside the name
// `actor` has always carried, with its own fallback unchanged.

// One stream for the whole file: the service asks for a new one only when the
// current one ends, and nothing here ends it, so no reconnect backoff runs
// between tests.
const daemonStream = new PassThrough();

mock.module(new URL("../../src/docker/engine-client.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({ requestStream: async () => daemonStream }),
  },
});

const { eventStreamService } = await import("../../src/events/event-stream-service.js");

/** Writes one raw daemon line and resolves with the event it produces. */
function feed(line: string): Promise<DaemonEvent> {
  return new Promise((resolve) => {
    eventStreamService.once("event", resolve);
    daemonStream.write(line + "\n");
  });
}

eventStreamService.start();

// events/specs/event-stream-service.md — "actorId: the identifier of the object the event is about,
// whatever the daemon reported as its name" (plan-docker_management_app-refresh_cache/REQ-6)
test("publishes the actor's identifier beside the name the event already carried", async () => {
  const received = await feed(
    JSON.stringify({
      time: 1786229808,
      Type: "container",
      Action: "start",
      scope: "local",
      Actor: { ID: "9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0", Attributes: { name: "database" } },
    }),
  );

  assert.equal(received.actorId, "9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0");
  // The name keeps the meaning it has always had: two objects of one kind are told apart by the id.
  assert.equal(received.actor, "database");
});

// events/specs/event-stream-service.md — "`actor` keeps its own meaning and its fallback unchanged"
test("keeps the name falling back to the identifier when the daemon reports no name", async () => {
  const received = await feed(
    JSON.stringify({
      time: 1786229809,
      Type: "volume",
      Action: "destroy",
      scope: "local",
      Actor: { ID: "some-volume", Attributes: {} },
    }),
  );

  assert.equal(received.actor, "some-volume");
  assert.equal(received.actorId, "some-volume");
});

// events/specs/event-stream-service.md — "absent when the daemon reports no actor id"
test("carries no identifier when the daemon reports no actor", async () => {
  const received = await feed(
    JSON.stringify({ time: 1786229810, Type: "image", Action: "pull", scope: "local" }),
  );

  assert.equal(received.actorId, undefined);
  assert.equal(received.actor, undefined);
  assert.equal(received.type, "image");
  assert.equal(received.action, "pull");
});

// events/specs/event-stream-service.md — "actorId is a published field only: the event's identity is
// built from the actor's id already and is unaffected by it"
test("builds the identity from the actor's id, so two objects in one instant stay two events", async () => {
  const first = await feed(
    JSON.stringify({
      time: 1786229811,
      timeNano: 1786229811500000000,
      Type: "container",
      Action: "start",
      scope: "local",
      Actor: { ID: "aaaaaaaaaaaa", Attributes: { name: "one" } },
    }),
  );
  const second = await feed(
    JSON.stringify({
      time: 1786229811,
      timeNano: 1786229811500000000,
      Type: "container",
      Action: "start",
      scope: "local",
      Actor: { ID: "bbbbbbbbbbbb", Attributes: { name: "two" } },
    }),
  );

  assert.notEqual(first.id, second.id);
  assert.ok(first.id.includes("aaaaaaaaaaaa"), `the identity does not carry the actor's id: ${first.id}`);
  assert.ok(second.id.includes("bbbbbbbbbbbb"), `the identity does not carry the actor's id: ${second.id}`);
});
