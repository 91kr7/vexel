import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { swarmRouter } from "../../src/swarm/swarm-routes.js";
import type { SwarmListing, SwarmState, SwarmTokensReading } from "../../src/swarm/swarm-state-service.js";
import { buildApp, startApp } from "../support/fixtures.js";

// The swarm endpoints against the operator's own daemon (REQ-79 to REQ-84).
//
// This file changes nothing on the host: it never initialises, joins or leaves a
// swarm, and creates no object. What it can prove anywhere is the property the
// whole area is built on — a reading of this area never fails, it degrades to a
// stated reason, and a mutation that needs a manager is refused with that same
// reason. What the daemon actually is, is asked of Docker rather than assumed:
// on a manager the same file asserts the manager side of the same contract.
// Everything that needs a cluster lives in `test/exclusive/`.
const execFileAsync = promisify(execFile);

const { stdout: swarmInfo } = await execFileAsync("docker", [
  "info",
  "--format",
  "{{.Swarm.LocalNodeState}} {{.Swarm.ControlAvailable}}",
]);
const [localNodeState = "inactive", controlAvailable = "false"] = swarmInfo.trim().split(" ");
const IS_MANAGER = controlAvailable === "true";

function app() {
  return buildApp("/api/swarm", swarmRouter);
}

interface Answer<T> {
  status: number;
  body: T;
  text: string;
}

async function call<T>(url: string, path: string, init: RequestInit = {}): Promise<Answer<T>> {
  const response = await fetch(`${url}${path}`, init);
  const text = await response.text();
  let body: unknown = undefined;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = undefined;
  }
  return { status: response.status, body: body as T, text };
}

function postJson<T>(url: string, path: string, payload: unknown): Promise<Answer<T>> {
  return call<T>(url, path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
}

/**
 * Everything the server writes out while `action` runs, passed through unchanged
 * so the test runner's own reporting still reaches the terminal.
 */
async function captureProcessOutput(action: () => Promise<void>): Promise<string> {
  const originalStdout = process.stdout.write.bind(process.stdout);
  const originalStderr = process.stderr.write.bind(process.stderr);
  const originalConsole = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  let captured = "";
  process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    captured += String(chunk);
    return (originalStdout as (...args: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    captured += String(chunk);
    return (originalStderr as (...args: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stderr.write;
  const recordConsole =
    (original: (...values: unknown[]) => void) =>
    (...values: unknown[]) => {
      captured += values.map((value) => String(value)).join(" ");
      original(...values);
    };
  console.log = recordConsole(originalConsole.log);
  console.error = recordConsole(originalConsole.error);
  console.warn = recordConsole(originalConsole.warn);
  console.info = recordConsole(originalConsole.info);
  console.debug = recordConsole(originalConsole.debug);
  try {
    await action();
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
    Object.assign(console, originalConsole);
  }
  return captured;
}

const LISTINGS = ["/api/swarm/nodes", "/api/swarm/services", "/api/swarm/stacks", "/api/swarm/secrets", "/api/swarm/configs"];

// plan-docker_management_app/REQ-79 — the swarm state of the active daemon is shown (inactive,
// manager, worker, with cluster id, node count and raft health).
// swarm-endpoints.md — "200 -> SwarmState ... for an inactive daemon too."
test("GET /api/swarm answers the daemon's swarm state, whatever that state is", async () => {
  const { url, close } = await startApp(app());
  try {
    const { status, body, text } = await call<SwarmState>(url, "/api/swarm");

    assert.equal(status, 200, `a state reading must never fail: ${text}`);
    assert.ok(["inactive", "manager", "worker"].includes(body.role), `unexpected role: ${body.role}`);
    assert.equal(body.manager, IS_MANAGER, "the role must be the one the daemon itself reports");
    assert.equal(body.localNodeState, localNodeState, "the daemon's own word for its state is passed through");
    assert.ok(["healthy", "degraded", "unknown"].includes(body.raft.status), `unexpected raft status: ${body.raft.status}`);
    assert.ok(typeof body.raft.detail === "string" && body.raft.detail.length > 0, "a derived health always says what it came from");
    if (IS_MANAGER) {
      assert.equal(body.unavailableReason, undefined, "a manager can read everything, so there is no reason to state");
    } else {
      assert.ok((body.unavailableReason ?? "").length > 0, "off a manager the state must say why the cluster cannot be read");
    }
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-80 — the join tokens are the only place a token appears.
// swarm-endpoints.md — "The join tokens are returned by the two token endpoints alone, and by
// nothing else: they are not part of the state, of a node, or of any listing."
test("no reading but the token endpoint ever carries a join token", async () => {
  const { url, close } = await startApp(app());
  try {
    const state = await call<SwarmState>(url, "/api/swarm");
    assert.ok(!state.text.includes("SWMTKN"), `the state must carry no join token: ${state.text}`);

    for (const path of LISTINGS) {
      const listing = await call<SwarmListing<unknown>>(url, path);
      assert.ok(!listing.text.includes("SWMTKN"), `${path} must carry no join token: ${listing.text}`);
    }
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-81 to REQ-84 — nodes, services, stacks, secrets and configs are
// listed. swarm-endpoints.md — "Every listing answers 200 with { items, unavailableReason? }: on a
// daemon that is not a swarm manager the items are empty and unavailableReason says why, so no
// reading of this area ever surfaces as an error."
test("every listing answers 200 with items, and states the reason instead of failing off a manager", async () => {
  const { url, close } = await startApp(app());
  try {
    const { body: state } = await call<SwarmState>(url, "/api/swarm");

    for (const path of LISTINGS) {
      const { status, body, text } = await call<SwarmListing<unknown>>(url, path);

      assert.equal(status, 200, `${path} must not surface as an error: ${text}`);
      assert.ok(Array.isArray(body.items), `${path} must answer a list of items: ${text}`);
      if (IS_MANAGER) {
        assert.equal(body.unavailableReason, undefined, `${path} needs no reason on a manager`);
      } else {
        assert.deepEqual(body.items, [], `${path} has nothing to list off a manager`);
        assert.equal(body.unavailableReason, state.unavailableReason, `${path} must state the same reason as the state does`);
      }
    }
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-80 — the join tokens can be displayed.
// swarm-endpoints.md — "GET /api/swarm/tokens -> 200 -> { tokens?, unavailableReason? }"
test("GET /api/swarm/tokens answers the tokens on a manager, and the stated reason off one", async () => {
  const { url, close } = await startApp(app());
  try {
    const { status, body } = await call<SwarmTokensReading>(url, "/api/swarm/tokens");

    assert.equal(status, 200);
    if (IS_MANAGER) {
      assert.ok(body.tokens, "a manager holds both join tokens");
      assert.ok(body.tokens!.worker.length > 0 && body.tokens!.manager.length > 0);
    } else {
      assert.equal(body.tokens, undefined, "there is no token to show where there is no cluster");
      assert.ok((body.unavailableReason ?? "").length > 0);
    }
  } finally {
    await close();
  }
});

// swarm-endpoints.md — "Every mutation answers 409 with that same reason when it needs a manager and
// this daemon is not one" (REQ-79 to REQ-84).
test("every manager-only mutation is refused with 409 and the stated reason off a manager", async (t) => {
  if (IS_MANAGER) t.skip("this daemon is a swarm manager: the refusal path is not reachable here");
  if (IS_MANAGER) return;
  const { url, close } = await startApp(app());
  try {
    const { body: state } = await call<SwarmState>(url, "/api/swarm");

    const mutations: { name: string; run: () => Promise<Answer<{ error?: string }>> }[] = [
      { name: "rotate a join token", run: () => postJson(url, "/api/swarm/tokens/rotate", { target: "worker" }) },
      { name: "update a node", run: () => postJson(url, "/api/swarm/nodes/some-node/update", { availability: "drain" }) },
      { name: "remove a node", run: () => call(url, "/api/swarm/nodes/some-node", { method: "DELETE" }) },
      { name: "create a service", run: () => postJson(url, "/api/swarm/services", { name: "vexel-probe", image: "alpine:3.20", mode: "replicated" }) },
      { name: "inspect a service", run: () => call(url, "/api/swarm/services/some-service") },
      { name: "update a service", run: () => postJson(url, "/api/swarm/services/some-service/update", { image: "alpine:3.20" }) },
      { name: "remove a service", run: () => call(url, "/api/swarm/services/some-service", { method: "DELETE" }) },
      { name: "remove a stack", run: () => call(url, "/api/swarm/stacks/some-stack", { method: "DELETE" }) },
      { name: "create a secret", run: () => postJson(url, "/api/swarm/secrets", { name: "vexel-probe", value: "probe-value" }) },
      { name: "create a config", run: () => postJson(url, "/api/swarm/configs", { name: "vexel-probe", value: "probe-value" }) },
      { name: "inspect a secret", run: () => call(url, "/api/swarm/secrets/some-secret") },
      { name: "inspect a config", run: () => call(url, "/api/swarm/configs/some-config") },
      { name: "remove a secret", run: () => call(url, "/api/swarm/secrets/some-secret", { method: "DELETE" }) },
      { name: "remove a config", run: () => call(url, "/api/swarm/configs/some-config", { method: "DELETE" }) },
    ];

    for (const mutation of mutations) {
      const { status, body, text } = await mutation.run();

      assert.equal(status, 409, `${mutation.name} must be refused with 409, got ${status}: ${text}`);
      assert.equal(body.error, state.unavailableReason, `${mutation.name} must be refused with the same stated reason`);
    }
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-84 — a secret's value is never displayed. Probed as an attacker:
// the value is submitted, and must come back from nothing — not the refusal, not a listing, not a
// log line. swarm-endpoints.md — "No response of this router ever carries a secret's or a config's
// value, in a success answer or in an error one."
test("a value submitted to a refused creation comes back from nothing, and is written nowhere", async (t) => {
  if (IS_MANAGER) t.skip("creating and reading back a real secret is the exclusive suite's job on a manager");
  if (IS_MANAGER) return;
  const { url, close } = await startApp(app());
  const value = "vexel-probe-secret-value-4f9a2c";
  try {
    let secret: Answer<{ error?: string }> | undefined;
    let config: Answer<{ error?: string }> | undefined;
    const output = await captureProcessOutput(async () => {
      secret = await postJson(url, "/api/swarm/secrets", { name: "vexel-probe-secret", value });
      config = await postJson(url, "/api/swarm/configs", { name: "vexel-probe-config", value });
    });

    assert.ok(!secret!.text.includes(value), `a refused secret creation must not echo the value: ${secret!.text}`);
    assert.ok(!config!.text.includes(value), `a refused config creation must not echo the value: ${config!.text}`);
    assert.ok(!output.includes(value), "the value must appear in no line the server writes out");

    // ...and no endpoint of the area hands it back either.
    for (const path of ["/api/swarm", "/api/swarm/secrets", "/api/swarm/configs", "/api/swarm/tokens"]) {
      const answer = await call(url, path);
      assert.ok(!answer.text.includes(value), `${path} must not carry the value: ${answer.text}`);
    }
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-84 — the value travels in a request body only. A value smuggled
// onto a query string must not widen anything, and must not come back.
test("no swarm endpoint accepts a secret's value anywhere but a request body", async () => {
  const { url, close } = await startApp(app());
  const value = "vexel-probe-query-value-7b1e";
  try {
    const listing = await call(url, `/api/swarm/secrets?value=${encodeURIComponent(value)}&data=${encodeURIComponent(value)}`);
    const state = await call(url, `/api/swarm?value=${encodeURIComponent(value)}`);

    assert.equal(listing.status, 200);
    assert.ok(!listing.text.includes(value), `the listing must not echo a query-string value: ${listing.text}`);
    assert.ok(!state.text.includes(value), `the state must not echo a query-string value: ${state.text}`);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-79 — a swarm can be joined using a join token.
// swarm-endpoints.md — "400 -> no address or no token"
test("POST /api/swarm/join is rejected with 400 without an address or without a token", async () => {
  const { url, close } = await startApp(app());
  try {
    const noAddress = await postJson<{ error?: string }>(url, "/api/swarm/join", { remoteAddrs: [], joinToken: "SWMTKN-1-abc" });
    const noToken = await postJson<{ error?: string }>(url, "/api/swarm/join", { remoteAddrs: ["10.0.0.1:2377"], joinToken: "" });
    const neither = await postJson<{ error?: string }>(url, "/api/swarm/join", {});

    for (const [name, answer] of Object.entries({ noAddress, noToken, neither })) {
      assert.equal(answer.status, 400, `${name} must be refused with 400, got ${answer.status}: ${answer.text}`);
      assert.ok((answer.body.error ?? "").length > 0, `${name} must say what is missing`);
    }
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-79 — a swarm can be left. swarm-state-service.md — leaveSwarm
// "rejects if the daemon is not in a swarm"; swarm-endpoints.md — "a daemon outside a swarm refuses
// with its own status and message", the worked example of the router-wide rule: "502, or the error's
// own status code when the daemon gave one (a swarm operation refused by a daemon outside a swarm
// comes back as the daemon's 503)".
test("POST /api/swarm/leave on a daemon outside a swarm reports the daemon's own refusal", async (t) => {
  if (localNodeState !== "inactive") t.skip("this daemon is in a swarm: leaving it is not this suite's business");
  if (localNodeState !== "inactive") return;
  const { url, close } = await startApp(app());
  try {
    const { status, body } = await postJson<{ error?: string }>(url, "/api/swarm/leave", { force: false });

    assert.ok((body.error ?? "").length > 0, "the daemon's own refusal must reach the operator");
    assert.match(body.error!, /swarm/i);
    assert.equal(status, 503, `the daemon gave this refusal a status of its own, which the router passes through; the answer was ${status}`);
  } finally {
    await close();
  }
});

// Departure Three (2026-08-07), plan-docker_management_app/REQ-83 — the application does not deploy
// stacks. swarm-endpoints.md — "No endpoint here takes a compose file, a file path or a stack
// definition: stacks are listed and removed, never deployed."
test("no endpoint of this router deploys a stack, from a file, a path or a definition", async () => {
  const { url, close } = await startApp(app());
  try {
    const attempts = [
      await postJson(url, "/api/swarm/stacks", { name: "vexel-probe", composeFile: "version: '3'\nservices: {}\n" }),
      await postJson(url, "/api/swarm/stacks/deploy", { name: "vexel-probe", path: "/tmp/docker-compose.yml" }),
      await postJson(url, "/api/swarm/stacks/vexel-probe/deploy", { composeFile: "version: '3'\n" }),
      await postJson(url, "/api/swarm/deploy", { path: "/tmp/docker-compose.yml" }),
      await call(url, "/api/swarm/stacks/vexel-probe", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ composeFile: "version: '3'\n" }),
      }),
    ];

    for (const attempt of attempts) {
      assert.equal(attempt.status, 404, `a deploy-shaped request must reach no route, got ${attempt.status}: ${attempt.text}`);
    }
  } finally {
    await close();
  }
});
