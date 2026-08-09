import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getEngineClient } from "../../src/docker/engine-client.js";
import { setActiveEndpoint } from "../../src/docker/endpoint.js";

// The shared Engine API client of the active context (docker-access/specs/
// engine-client.md). Nothing here dials the daemon: only the identity of the
// instance handed out around an endpoint change is under test.

beforeEach(() => {
  setActiveEndpoint(undefined);
});

afterEach(() => {
  setActiveEndpoint(undefined);
});

// engine-client.md — "getEngineClient(): the client of the active context, shared by every server area"
test("getEngineClient hands the same shared instance to every caller while the endpoint is unchanged", () => {
  assert.equal(getEngineClient(), getEngineClient());
});

// engine-client.md — "Discarded and rebuilt on the next call as soon as the active endpoint changes,
// so no caller can keep talking to the daemon left behind (REQ-93)"
test("getEngineClient hands out a rebuilt client as soon as the active endpoint changes", () => {
  const before = getEngineClient();

  setActiveEndpoint({ kind: "ssh", destination: "operator@build-host" });

  assert.notEqual(getEngineClient(), before);
});

// engine-client.md — the discard follows the change, not the call: publishing the same endpoint
// again is not a change, so the shared instance survives (active-endpoint.md)
test("re-publishing the endpoint already active leaves the shared client in place", () => {
  setActiveEndpoint({ kind: "ssh", destination: "operator@build-host" });
  const before = getEngineClient();

  setActiveEndpoint({ kind: "ssh", destination: "operator@build-host" });

  assert.equal(getEngineClient(), before);
});
