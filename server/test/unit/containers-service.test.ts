import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// The service talks to the daemon only through the shared EngineClient: the
// mock stands in for it, so the order `listContainers` returns its rows in
// (containers-service.md) is the only behaviour under test here. A stubbed
// payload is what makes a genuine tie constructible — two names the ordering
// rule calls equal — which a real daemon cannot be asked for.
let containersBody = "[]";

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string) => {
        if (path === "/containers/json?all=true") return { statusCode: 200, body: containersBody };
        throw new Error(`unexpected path: ${path}`);
      },
    }),
  },
});

const { listContainers } = await import("../../src/containers/containers-service.js");

beforeEach(() => {
  containersBody = "[]";
});

interface RawFixture {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
}

function container(id: string, name: string): RawFixture {
  return { Id: id, Names: [`/${name}`], Image: "fixture:latest", State: "running", Status: "Up 1 second" };
}

/** Name and id together: the id is what the order falls back to, so an assertion that ignores it cannot see the tiebreak. */
function sequenceOf(containers: { name: string; id: string }[]): string[] {
  return containers.map((entry) => `${entry.name}#${entry.id}`);
}

async function listFrom(payload: RawFixture[]): Promise<string[]> {
  containersBody = JSON.stringify(payload);
  return sequenceOf(await listContainers());
}

// containers-service.md — "Ordered by container name under the list-order rule (compareNames)":
// app-2 before app-10, Redis next to redis-cache (REQ-8)
test("listContainers orders an out-of-order payload by container name, digits as numbers and case ignored", async () => {
  const payload = [
    container("c-1", "app-10"),
    container("c-2", "redis-cache"),
    container("c-3", "app-2"),
    container("c-4", "Redis"),
    container("c-5", "beta"),
  ];

  const names = (await listFrom(payload)).map((entry) => entry.split("#")[0]);

  assert.deepEqual(names, ["app-2", "app-10", "beta", "Redis", "redis-cache"]);
});

// containers-service.md — "two containers whose names differ only in case ... separated by their
// ids", and the same sequence whatever order the daemon supplied (REQ-5, REQ-12)
test("listContainers separates two containers whose names differ only in case by their ids, both ways round", async () => {
  const upper = container("c-2", "Data");
  const lower = container("c-1", "data");

  const forwards = await listFrom([upper, lower]);
  const backwards = await listFrom([lower, upper]);

  assert.deepEqual(forwards, ["data#c-1", "Data#c-2"]);
  assert.deepEqual(backwards, forwards);
});

// containers-service.md — "two containers whose names differ only in ... leading zeros separated by
// their ids" (REQ-5, REQ-12)
test("listContainers separates two containers whose names differ only in leading zeros by their ids, both ways round", async () => {
  const padded = container("c-a", "app-01");
  const plain = container("c-b", "app-1");

  const forwards = await listFrom([plain, padded]);
  const backwards = await listFrom([padded, plain]);

  assert.deepEqual(forwards, ["app-01#c-a", "app-1#c-b"]);
  assert.deepEqual(backwards, forwards);
});

// containers-service.md — "The same containers produce the same sequence on every read, whatever
// order the daemon supplied them in" (REQ-6, REQ-12): the only check that detects a missing
// tiebreak, since a sort that is stable keeps whatever the payload happened to say.
test("listContainers produces one sequence whichever order the daemon supplied the containers in", async () => {
  const payload = [
    container("c-5", "app-1"),
    container("c-1", "Data"),
    container("c-3", "app-10"),
    container("c-2", "data"),
    container("c-4", "app-01"),
    container("c-6", "app-2"),
  ];

  const forwards = await listFrom(payload);
  const backwards = await listFrom([...payload].reverse());

  assert.deepEqual(forwards, ["app-01#c-4", "app-1#c-5", "app-2#c-6", "app-10#c-3", "Data#c-1", "data#c-2"]);
  assert.deepEqual(backwards, forwards);
});

// containers-service.md — "The same containers produce the same sequence on every read" (REQ-12)
test("listContainers returns the identical sequence when read again with nothing changed", async () => {
  const payload = [container("c-2", "Data"), container("c-1", "data"), container("c-3", "app-2")];

  const first = await listFrom(payload);
  const second = await listFrom(payload);

  assert.deepEqual(second, first);
});
