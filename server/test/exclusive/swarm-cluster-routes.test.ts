import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { swarmRouter } from "../../src/swarm/swarm-routes.js";
import type { SwarmNode } from "../../src/swarm/swarm-nodes-service.js";
import type { SwarmDataItem } from "../../src/swarm/swarm-secrets-service.js";
import type { SwarmService, SwarmServiceDetail } from "../../src/swarm/swarm-services-service.js";
import type { StackRemovalResult, SwarmStack } from "../../src/swarm/swarm-stacks-service.js";
import type { SwarmListing, SwarmState, SwarmTokensReading } from "../../src/swarm/swarm-state-service.js";
import { ALPINE_IMAGE, ensureImages } from "../support/base-images.js";
import { CASE_LABEL, OWNER_LABEL, RUN_ID, buildApp, ownershipArgs, startApp } from "../support/fixtures.js";
import { execFileAsync } from "../support/docker-cli.js";

// The half of the swarm contract that only a manager can answer: nodes with
// their role and availability, services with their tasks, stacks, secrets and
// configs (REQ-79 to REQ-84).
//
// **What this file does to the host, and how it puts it back.** It runs only
// against a daemon it can prove is *outside* a swarm, and then it is the one
// that put it in one: `before` initialises a swarm through the application's own
// endpoint, and `after` leaves it with `docker swarm leave --force` whether the
// run passed, failed or threw. A daemon already in a swarm is the operator's
// cluster: the initialise/leave tests are skipped there, node availability is
// never touched, and only labelled fixtures of this run's own are created — and
// removed. `docker_gwbridge`, which swarm mode creates on init and leaves
// behind, is removed too when it was not there before.
//
// It lives in `exclusive/` because a swarm is a property of the whole daemon:
// no label can scope it away from another test running at the same time.

await ensureImages([ALPINE_IMAGE]);

/** The daemon's swarm state, asked of Docker itself. */
async function daemonSwarmState(): Promise<{ localNodeState: string; manager: boolean }> {
  const { stdout } = await execFileAsync("docker", ["info", "--format", "{{.Swarm.LocalNodeState}} {{.Swarm.ControlAvailable}}"]);
  const [localNodeState = "inactive", controlAvailable = "false"] = stdout.trim().split(" ");
  return { localNodeState, manager: controlAvailable === "true" };
}

/** True when this file is the one that put the daemon into swarm mode. */
let ownSwarm = false;
/** True when the daemon carries the control plane, however it got there. */
let manager = false;
/** The networks that existed before this file ran, so only what it caused is removed. */
let networksBefore = new Set<string>();

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
  let body: unknown;
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
 * The ownership labels, as a map for the creation endpoints — the same pair
 * `ownershipArgs` puts on a CLI-made fixture. Every swarm object this file
 * creates *through the application* carries them, so a run killed halfway
 * leaves objects that can still be proved to be ours.
 */
function ownershipLabels(caseName: string): Record<string, string> {
  return { [OWNER_LABEL]: RUN_ID, [CASE_LABEL]: caseName };
}

/** The names of the objects of one kind that carry this run's ownership label. */
async function ownedByThisRun(kind: "service" | "secret" | "config"): Promise<string[]> {
  const { stdout } = await execFileAsync("docker", [kind, "ls", "--filter", `label=${OWNER_LABEL}=${RUN_ID}`, "--format", "{{.Name}}"]).catch(() => ({
    stdout: "",
  }));
  return stdout.split("\n").map((name) => name.trim()).filter((name) => name !== "");
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const port = (probe.address() as { port: number }).port;
      probe.close(() => resolve(port));
    });
  });
}

/** Everything the server writes out while `action` runs, passed through unchanged. */
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

async function waitFor<T>(what: string, read: () => Promise<T | undefined>, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

/** Removes a swarm object of any kind, ignoring a refusal — for a `finally`. */
async function removeQuietly(kind: "service" | "secret" | "config" | "network", nameOrId: string): Promise<void> {
  if (nameOrId === "") return;
  await execFileAsync("docker", [kind, "rm", nameOrId]).catch(() => undefined);
}

before(async () => {
  const { stdout: networkList } = await execFileAsync("docker", ["network", "ls", "--format", "{{.Name}}"]);
  networksBefore = new Set(networkList.split("\n").map((name) => name.trim()));

  const initial = await daemonSwarmState();
  if (initial.localNodeState === "inactive") {
    // The daemon is provably outside a swarm, so this file cannot be dismantling
    // a cluster the operator joined. The swarm is created through the
    // application's own endpoint: that is REQ-79's "a swarm can be initialised".
    const { url, close } = await startApp(app());
    try {
      const created = await postJson<SwarmState>(url, "/api/swarm/init", { advertiseAddr: "127.0.0.1" });
      assert.equal(created.status, 200, `initialising a swarm failed: ${created.text}`);
      assert.equal(created.body.role, "manager", "the daemon that initialises a swarm becomes its first manager");
      assert.equal(created.body.manager, true);
      assert.ok((created.body.clusterId ?? "").length > 0, "a new cluster has an id");
      assert.equal(created.body.unavailableReason, undefined, "a manager can read its own cluster");
      ownSwarm = true;
    } finally {
      await close();
    }
  }
  manager = (await daemonSwarmState()).manager;
});

after(async () => {
  if (ownSwarm) {
    // Runs on failure as thoroughly as on success: the daemon goes back to the
    // `inactive` this file found it in, and the swarm's own objects go with it.
    await execFileAsync("docker", ["swarm", "leave", "--force"]).catch(() => undefined);
  }
  // Swarm mode creates `docker_gwbridge` on init and leaves it behind on leave.
  // Only that one, and only when it was not already there: a network this file
  // cannot prove it caused is left alone. One still in use refuses and stays.
  if (!networksBefore.has("docker_gwbridge")) await removeQuietly("network", "docker_gwbridge");
});

// plan-docker_management_app/REQ-79 — a swarm can be initialised and left; the state is shown with
// its cluster id, node count and raft health. swarm-state-service.md — raft health is derived from
// reachability and leadership.
test("the state of a swarm this daemon manages reads as active, with its cluster id and derived raft health", async (t) => {
  if (!manager) {
    t.skip("this daemon is not a swarm manager");
    return;
  }
  const { url, close } = await startApp(app());
  try {
    const { status, body } = await call<SwarmState>(url, "/api/swarm");

    assert.equal(status, 200);
    assert.equal(body.role, "manager");
    assert.equal(body.manager, true);
    assert.equal(body.localNodeState, "active");
    assert.ok((body.clusterId ?? "").length > 0);
    assert.ok((body.nodeCount ?? 0) >= 1);
    assert.ok((body.managerCount ?? 0) >= 1);
    assert.equal(body.raft.status, "healthy", `a reachable, leading single manager is a healthy raft: ${body.raft.detail}`);
    assert.equal(body.unavailableReason, undefined);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-79 — "a swarm can be ... left". The cluster is left through the
// application and then restored through it, so the file leaves the daemon as the other tests need
// it — and as it found it.
test("leaving the swarm through the application drops the daemon back out of swarm mode, and it can be initialised again", async (t) => {
  if (!ownSwarm) {
    t.skip("only a swarm this file created may be left: an existing one is the operator's");
    return;
  }
  const { url, close } = await startApp(app());
  try {
    const left = await postJson<SwarmState>(url, "/api/swarm/leave", { force: true });

    assert.equal(left.status, 200, `leaving failed: ${left.text}`);
    assert.equal(left.body.role, "inactive");
    assert.equal(left.body.manager, false);
    assert.ok((left.body.unavailableReason ?? "").length > 0, "a daemon outside a swarm states why it cannot read a cluster");

    // Every listing degrades on the spot, rather than starting to fail.
    const nodes = await call<SwarmListing<SwarmNode>>(url, "/api/swarm/nodes");
    assert.equal(nodes.status, 200);
    assert.deepEqual(nodes.body.items, []);
    assert.ok((nodes.body.unavailableReason ?? "").length > 0);

    const again = await postJson<SwarmState>(url, "/api/swarm/init", { advertiseAddr: "127.0.0.1" });
    assert.equal(again.status, 200, `re-initialising failed: ${again.text}`);
    assert.equal(again.body.manager, true);
  } finally {
    // Whatever the assertions did, the file's other tests — and `after` — need
    // the daemon in the state this test found it in.
    const state = await daemonSwarmState();
    if (!state.manager) await execFileAsync("docker", ["swarm", "init", "--advertise-addr", "127.0.0.1"]).catch(() => undefined);
    await close();
  }
});

// plan-docker_management_app/REQ-81 — swarm nodes are listed with hostname, role, availability and
// status. swarm-nodes-service.md — "self -> this node is the daemon the application is talking to".
test("GET /api/swarm/nodes lists this node with its hostname, role, availability and status", async (t) => {
  if (!manager) {
    t.skip("this daemon is not a swarm manager");
    return;
  }
  const { url, close } = await startApp(app());
  try {
    const { status, body } = await call<SwarmListing<SwarmNode>>(url, "/api/swarm/nodes");

    assert.equal(status, 200);
    assert.equal(body.unavailableReason, undefined);
    const self = body.items.find((node) => node.self);
    assert.ok(self, "the node the application is talking to must be in the listing and marked as itself");
    // The expected values are asked of Docker rather than written down: the
    // hostname belongs to the machine this runs on.
    const { stdout } = await execFileAsync("docker", ["node", "inspect", "self", "--format", "{{.Description.Hostname}} {{.Spec.Role}} {{.Spec.Availability}}"]);
    const [hostname, role, availability] = stdout.trim().split(" ");
    assert.equal(self!.hostname, hostname);
    assert.equal(self!.role, role);
    assert.equal(self!.availability, availability);
    assert.ok(["ready", "down", "unknown", "disconnected"].includes(self!.status), `unexpected status: ${self!.status}`);
    assert.equal(self!.leader, true, "the only manager of the cluster is its leader");
    assert.ok(typeof self!.version === "number", "the node carries the version its next update must use");
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-81 — "a node's role and availability can be changed".
test("a node's availability can be changed, and the listing reads the new value back", async (t) => {
  if (!ownSwarm) {
    t.skip("changing a node's availability is only done on a swarm this file created");
    return;
  }
  const { url, close } = await startApp(app());
  let nodeId = "";
  try {
    const before = await call<SwarmListing<SwarmNode>>(url, "/api/swarm/nodes");
    const self = before.body.items.find((node) => node.self)!;
    nodeId = self.id;

    const updated = await postJson<SwarmNode>(url, `/api/swarm/nodes/${nodeId}/update`, { availability: "pause" });

    assert.equal(updated.status, 200, `the update failed: ${updated.text}`);
    assert.equal(updated.body.availability, "pause");
    assert.equal(updated.body.role, self.role, "a change of availability leaves the role as it was");
    assert.equal(updated.body.hostname, self.hostname);

    const after = await call<SwarmListing<SwarmNode>>(url, "/api/swarm/nodes");
    assert.equal(after.body.items.find((node) => node.self)!.availability, "pause");

    // swarm-endpoints.md — "400 -> an unknown role or availability"
    const refused = await postJson<{ error?: string }>(url, `/api/swarm/nodes/${nodeId}/update`, { availability: "sleepy" });
    assert.equal(refused.status, 400, `an unknown availability must be refused: ${refused.text}`);
  } finally {
    if (nodeId !== "") await execFileAsync("docker", ["node", "update", "--availability", "active", nodeId]).catch(() => undefined);
    await close();
  }
});

// plan-docker_management_app/REQ-80 — the manager and worker join tokens can be displayed and
// rotated. swarm-state-service.md — "rotates that one token ... the other token is left as it is".
test("the join tokens are shown, and rotating one replaces that one alone", async (t) => {
  if (!ownSwarm) {
    t.skip("rotating a token invalidates it for everyone: only this file's own swarm may be rotated");
    return;
  }
  const { url, close } = await startApp(app());
  try {
    const first = await call<SwarmTokensReading>(url, "/api/swarm/tokens");
    assert.equal(first.status, 200);
    assert.ok(first.body.tokens, "a manager holds both join tokens");
    assert.match(first.body.tokens!.worker, /^SWMTKN-/);
    assert.match(first.body.tokens!.manager, /^SWMTKN-/);
    assert.notEqual(first.body.tokens!.worker, first.body.tokens!.manager);

    const rotated = await postJson<SwarmTokensReading>(url, "/api/swarm/tokens/rotate", { target: "worker" });
    assert.equal(rotated.status, 200, `rotation failed: ${rotated.text}`);
    assert.ok(rotated.body.tokens, "a rotation answers with both current tokens");
    assert.notEqual(rotated.body.tokens!.worker, first.body.tokens!.worker, "the rotated token is a new one");
    assert.equal(rotated.body.tokens!.manager, first.body.tokens!.manager, "the token that was not rotated is left as it is");

    // swarm-endpoints.md — "400 -> an unknown target"
    const unknown = await postJson<{ error?: string }>(url, "/api/swarm/tokens/rotate", { target: "everyone" });
    assert.equal(unknown.status, 400, `an unknown rotation target must be refused: ${unknown.text}`);

    // REQ-80 — the tokens are returned by the two token endpoints alone.
    const state = await call<SwarmState>(url, "/api/swarm");
    const nodes = await call<SwarmListing<SwarmNode>>(url, "/api/swarm/nodes");
    for (const token of [rotated.body.tokens!.worker, rotated.body.tokens!.manager]) {
      assert.ok(!state.text.includes(token), "the state must carry no join token");
      assert.ok(!nodes.text.includes(token), "a node listing must carry no join token");
    }
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-82 — services are listed with image, mode, running/desired replicas
// and published ports; created, updated, inspected with their tasks, and removed.
test("a service is created, listed with its image, mode, replicas and ports, inspected with its tasks, updated and removed", async (t) => {
  if (!manager) {
    t.skip("this daemon is not a swarm manager");
    return;
  }
  const { url, close } = await startApp(app());
  const name = `vexel-test-svc-${RUN_ID}`;
  const published = await freePort();
  try {
    const created = await postJson<SwarmService>(url, "/api/swarm/services", {
      name,
      image: ALPINE_IMAGE,
      mode: "replicated",
      replicas: 1,
      env: ["DSN=postgres://user@host/db?a=1", "MODE=production"],
      ports: [{ published, target: 80, protocol: "tcp" }],
      labels: ownershipLabels("swarm-services"),
    });

    assert.equal(created.status, 200, `creating the service failed: ${created.text}`);
    assert.equal(created.body.name, name);
    assert.equal(created.body.mode, "replicated");
    // swarm-services-service.md — the image comes back without the digest the
    // daemon pins to every deployed service.
    assert.equal(created.body.image, ALPINE_IMAGE, `the image must read as the operator wrote it, got ${created.body.image}`);

    const listed = await waitFor(`the service ${name} in the listing`, async () => {
      const listing = await call<SwarmListing<SwarmService>>(url, "/api/swarm/services");
      return listing.body.items.find((service) => service.name === name);
    });
    assert.equal(listed.replicasDesired, 1);
    assert.deepEqual(
      listed.ports.map((port) => ({ published: port.published, target: port.target, protocol: port.protocol })),
      [{ published, target: 80, protocol: "tcp" }],
    );

    // The tasks the service converges on, with the node they run on.
    const detail = await waitFor(`a task of ${name}`, async () => {
      const answer = await call<SwarmServiceDetail>(url, `/api/swarm/services/${listed.id}`);
      assert.equal(answer.status, 200, `inspecting the service failed: ${answer.text}`);
      return answer.body.tasks.length > 0 ? answer.body : undefined;
    });
    assert.equal(detail.service.name, name);
    assert.deepEqual(detail.env.slice().sort(), ["DSN=postgres://user@host/db?a=1", "MODE=production"], "a value containing = survives the round trip");
    // swarm-endpoints.md — "Every creation of this router accepts labels ... or nothing can prove
    // later that it is theirs to remove." Proved the way a sweep would: by asking Docker.
    assert.equal(detail.labels[OWNER_LABEL], RUN_ID, "a service created through the application carries the labels it was given");
    assert.ok((await ownedByThisRun("service")).includes(name), "the daemon's own label filter must find the service this run created");
    const task = detail.tasks[0]!;
    assert.ok(task.state.length > 0, "a task reads with the daemon's own state word");
    assert.ok(task.desiredState.length > 0);
    assert.ok(detail.raw !== undefined);

    // Only the given fields change: the image is replaced, the replica count is
    // raised, and neither drops what the service was created with.
    const updated = await postJson<SwarmService>(url, `/api/swarm/services/${listed.id}/update`, { replicas: 2 });
    assert.equal(updated.status, 200, `updating the service failed: ${updated.text}`);
    const rereadAfterUpdate = await waitFor("the raised replica count", async () => {
      const listing = await call<SwarmListing<SwarmService>>(url, "/api/swarm/services");
      const service = listing.body.items.find((entry) => entry.name === name);
      return service?.replicasDesired === 2 ? service : undefined;
    });
    assert.deepEqual(
      rereadAfterUpdate.ports.map((port) => port.published),
      [published],
      "an update must not drop the ports the service publishes",
    );
    // swarm-services-panel.md — "an update preserves the labels the service already carries".
    const afterUpdate = await call<SwarmServiceDetail>(url, `/api/swarm/services/${listed.id}`);
    assert.equal(afterUpdate.body.labels[OWNER_LABEL], RUN_ID, "an update must not drop the labels the service was created with");

    const removed = await call(url, `/api/swarm/services/${listed.id}`, { method: "DELETE" });
    assert.equal(removed.status, 204);
    const afterRemoval = await call<SwarmListing<SwarmService>>(url, "/api/swarm/services");
    assert.equal(
      afterRemoval.body.items.find((service) => service.name === name),
      undefined,
      "a removed service is gone from the listing",
    );
  } finally {
    await removeQuietly("service", name);
    await close();
  }
});

// plan-docker_management_app/REQ-82 — mode (replicated/global). swarm-endpoints.md — "409 -> ...
// replicas asked of a global service".
test("a global service reads as global, and a replica count asked of it is refused", async (t) => {
  if (!manager) {
    t.skip("this daemon is not a swarm manager");
    return;
  }
  const { url, close } = await startApp(app());
  const name = `vexel-test-global-${RUN_ID}`;
  try {
    const created = await postJson<SwarmService>(url, "/api/swarm/services", {
      name,
      image: ALPINE_IMAGE,
      mode: "global",
      labels: ownershipLabels("swarm-global-service"),
    });

    assert.equal(created.status, 200, `creating the global service failed: ${created.text}`);
    assert.equal(created.body.mode, "global");

    const refused = await postJson<{ error?: string }>(url, `/api/swarm/services/${created.body.id}/update`, { replicas: 3 });
    assert.equal(refused.status, 409, `a replica count asked of a global service must be refused: ${refused.text}`);
    assert.ok((refused.body.error ?? "").length > 0, "the refusal must say what does not apply");

    // swarm-endpoints.md — "400 -> a missing name/image or an unknown mode"
    const badMode = await postJson<{ error?: string }>(url, "/api/swarm/services", { name: `${name}-x`, image: ALPINE_IMAGE, mode: "sideways" });
    assert.equal(badMode.status, 400, `an unknown mode must be refused: ${badMode.text}`);
    const noImage = await postJson<{ error?: string }>(url, "/api/swarm/services", { name: `${name}-y`, mode: "replicated" });
    assert.equal(noImage.status, 400, `a missing image must be refused: ${noImage.text}`);

    // swarm-endpoints.md — "an unknown service comes back as the daemon's own refusal, per the rule
    // above": 502, or the status the daemon itself gave.
    const unknown = await call<{ error?: string }>(url, "/api/swarm/services/no-such-service-here");
    assert.ok(unknown.status >= 400, `an unknown service must be reported, got ${unknown.status}`);
    assert.notEqual(unknown.status, 200);
    assert.ok((unknown.body.error ?? "").length > 0, "the daemon's own message must reach the operator");
  } finally {
    await removeQuietly("service", name);
    await removeQuietly("service", `${name}-x`);
    await removeQuietly("service", `${name}-y`);
    await close();
  }
});

// plan-docker_management_app/REQ-84 — secrets and configs are listed with name and age, created,
// inspected as metadata (never revealing a secret's value) and removed. Probed as an attacker: the
// value is submitted and then hunted for in every answer, every error and every log line.
test("a secret's value and a config's data are write-only: submitted once, and returned by nothing", async (t) => {
  if (!manager) {
    t.skip("this daemon is not a swarm manager");
    return;
  }
  const { url, close } = await startApp(app());
  const secretName = `vexel-test-secret-${RUN_ID}`;
  const configName = `vexel-test-config-${RUN_ID}`;
  const secretValue = "c0rrect-horse-battery-staple-secret";
  const configValue = "server { listen 80; } # config content";
  const encodedSecret = Buffer.from(secretValue, "utf8").toString("base64");
  try {
    let createdSecret: Answer<SwarmDataItem> | undefined;
    let createdConfig: Answer<SwarmDataItem> | undefined;
    const output = await captureProcessOutput(async () => {
      createdSecret = await postJson<SwarmDataItem>(url, "/api/swarm/secrets", {
        name: secretName,
        value: secretValue,
        // swarm-endpoints.md — "labels is read the same way as on the secret and
        // config creations: string entries only, anything else ignored."
        labels: { ...ownershipLabels("swarm-secrets"), ignored: 42 },
      });
      createdConfig = await postJson<SwarmDataItem>(url, "/api/swarm/configs", {
        name: configName,
        value: configValue,
        labels: ownershipLabels("swarm-secrets"),
      });
    });

    assert.equal(createdSecret!.status, 200, `creating the secret failed: ${createdSecret!.text}`);
    assert.equal(createdConfig!.status, 200, `creating the config failed: ${createdConfig!.text}`);
    assert.equal(createdSecret!.body.name, secretName);
    assert.equal(createdSecret!.body.kind, "secret");
    assert.ok((createdSecret!.body.createdAt ?? "").length > 0, "the age is read from the creation time");

    // swarm-endpoints.md — every creation accepts labels, string entries only.
    assert.equal(createdSecret!.body.labels[OWNER_LABEL], RUN_ID, "a secret created through the application carries its labels");
    assert.equal(createdSecret!.body.labels.ignored, undefined, "a label entry that is not a string is ignored");
    assert.equal(createdConfig!.body.labels[OWNER_LABEL], RUN_ID, "a config created through the application carries its labels");
    assert.ok((await ownedByThisRun("secret")).includes(secretName), "the daemon's own label filter must find the secret this run created");
    assert.ok((await ownedByThisRun("config")).includes(configName), "the daemon's own label filter must find the config this run created");

    // The value reached the daemon — this is write-only, not dropped. A config's
    // data is the one the daemon hands back, so it is the one that can be
    // checked against what was sent.
    const { stdout: storedData } = await execFileAsync("docker", ["config", "inspect", configName]);
    const stored = (JSON.parse(storedData) as { Spec?: { Data?: string } }[])[0]?.Spec?.Data ?? "";
    assert.equal(stored, Buffer.from(configValue, "utf8").toString("base64"), "the cluster must hold exactly what was submitted");

    // ...and it comes back from nothing.
    const probes = [
      `/api/swarm/secrets`,
      `/api/swarm/configs`,
      `/api/swarm/secrets/${createdSecret!.body.id}`,
      `/api/swarm/configs/${createdConfig!.body.id}`,
      `/api/swarm/secrets/${createdSecret!.body.id}?reveal=true&data=true&value=true`,
      `/api/swarm/configs/${createdConfig!.body.id}?reveal=true&data=true&value=true`,
      `/api/swarm/secrets/${secretName}`,
      `/api/swarm/configs/${configName}`,
      `/api/swarm/stacks`,
      `/api/swarm/services`,
      `/api/swarm`,
    ];
    for (const path of probes) {
      const answer = await call(url, path);
      assert.ok(!answer.text.includes(secretValue), `${path} must not carry the secret's value: ${answer.text}`);
      assert.ok(!answer.text.includes(encodedSecret), `${path} must not carry the encoded secret either`);
      assert.ok(!answer.text.includes(configValue), `${path} must not carry the config's data: ${answer.text}`);
      assert.ok(!/"(data|value|secret)"\s*:/i.test(answer.text), `${path} must expose no data-carrying field: ${answer.text}`);
    }

    // An endpoint that would hand a value back does not exist at all.
    for (const path of [
      `/api/swarm/secrets/${createdSecret!.body.id}/data`,
      `/api/swarm/secrets/${createdSecret!.body.id}/value`,
      `/api/swarm/configs/${createdConfig!.body.id}/data`,
    ]) {
      const answer = await call(url, path);
      assert.equal(answer.status, 404, `no endpoint may exist to read a value back: ${path} answered ${answer.status}`);
      assert.ok(!answer.text.includes(secretValue) && !answer.text.includes(configValue));
    }

    assert.ok(!output.includes(secretValue), "the secret's value must appear in no line the server writes out");
    assert.ok(!output.includes(configValue), "the config's data must appear in no line the server writes out");
    assert.ok(!output.includes(encodedSecret), "not even the encoded value may be written out");

    // swarm-endpoints.md — "502 -> the daemon's refusal (e.g. the name is taken)", and the refusal
    // carries no value either.
    const duplicate = await postJson<{ error?: string }>(url, "/api/swarm/secrets", { name: secretName, value: secretValue });
    assert.ok(duplicate.status >= 400, "a name already taken must be refused");
    assert.notEqual(duplicate.status, 400, "a name already taken is the daemon's refusal, not a malformed request");
    assert.ok((duplicate.body.error ?? "").length > 0, "the daemon's own message must reach the operator");
    assert.ok(!duplicate.text.includes(secretValue), `a refusal must not echo the value: ${duplicate.text}`);

    // swarm-endpoints.md — "400 -> a missing name or value"
    const noValue = await postJson<{ error?: string }>(url, "/api/swarm/secrets", { name: `${secretName}-2` });
    assert.equal(noValue.status, 400, `a missing value must be refused: ${noValue.text}`);

    // ...and both are removed through the application.
    const removedSecret = await call(url, `/api/swarm/secrets/${createdSecret!.body.id}`, { method: "DELETE" });
    const removedConfig = await call(url, `/api/swarm/configs/${createdConfig!.body.id}`, { method: "DELETE" });
    assert.equal(removedSecret.status, 204);
    assert.equal(removedConfig.status, 204);
    const secrets = await call<SwarmListing<SwarmDataItem>>(url, "/api/swarm/secrets");
    assert.equal(secrets.body.items.find((item) => item.name === secretName), undefined, "a removed secret is gone from the listing");
  } finally {
    await removeQuietly("secret", secretName);
    await removeQuietly("secret", `${secretName}-2`);
    await removeQuietly("config", configName);
    await close();
  }
});

// plan-docker_management_app/REQ-83 — stacks are listed with their services and can be removed. The
// stack is deployed from a terminal, as the only way there is: the application observes and removes
// stacks, it does not deploy them (departure Three).
test("a stack deployed outside the application is listed with its services, and removing it takes its own objects only", async (t) => {
  if (!manager) {
    t.skip("this daemon is not a swarm manager");
    return;
  }
  const { url, close } = await startApp(app());
  const stack = `vexel-test-stack-${RUN_ID}`;
  const serviceName = `${stack}_web`;
  const secretName = `${stack}_password`;
  const configName = `${stack}_settings`;
  const networkName = `${stack}_default`;
  const outsiderName = `vexel-test-outsider-${RUN_ID}`;
  const namespace = ["--label", `com.docker.stack.namespace=${stack}`];
  const owned = ownershipArgs("swarm-stacks");
  let contentDir = "";
  try {
    contentDir = await mkdtemp(join(tmpdir(), "vexel-test-swarm-"));
    const contentFile = join(contentDir, "content");
    await writeFile(contentFile, "fixture content", "utf8");

    await execFileAsync("docker", ["secret", "create", ...namespace, ...owned, secretName, contentFile]);
    await execFileAsync("docker", ["config", "create", ...namespace, ...owned, configName, contentFile]);
    await execFileAsync("docker", ["network", "create", "--driver", "overlay", ...namespace, ...owned, networkName]);
    await execFileAsync("docker", ["service", "create", "--detach", "--name", serviceName, ...namespace, ...owned, ALPINE_IMAGE, "sleep", "600"]);
    // An object of this run's own that belongs to no stack: the removal must
    // leave it exactly where it is.
    await execFileAsync("docker", ["secret", "create", ...owned, outsiderName, contentFile]);

    const listed = await waitFor(`the stack ${stack}`, async () => {
      const listing = await call<SwarmListing<SwarmStack>>(url, "/api/swarm/stacks");
      assert.equal(listing.status, 200);
      return listing.body.items.find((entry) => entry.name === stack);
    });

    assert.equal(listed.serviceCount, 1);
    assert.equal(listed.secretCount, 1);
    assert.equal(listed.configCount, 1);
    assert.equal(listed.networkCount, 1);
    assert.deepEqual(
      listed.services.map((service) => service.name),
      [serviceName],
      "a stack is listed with the services that make it up",
    );
    assert.equal(listed.services[0]!.image, ALPINE_IMAGE);

    const removal = await call<StackRemovalResult>(url, `/api/swarm/stacks/${stack}`, { method: "DELETE" });

    assert.equal(removal.status, 200, `removing the stack failed: ${removal.text}`);
    assert.deepEqual(removal.body.removedServices, [serviceName]);
    assert.deepEqual(removal.body.removedSecrets, [secretName]);
    assert.deepEqual(removal.body.removedConfigs, [configName]);
    assert.deepEqual(removal.body.removedNetworks, [networkName]);

    const secrets = await call<SwarmListing<SwarmDataItem>>(url, "/api/swarm/secrets");
    assert.equal(secrets.body.items.find((item) => item.name === secretName), undefined, "the stack's secret is gone");
    assert.ok(
      secrets.body.items.some((item) => item.name === outsiderName),
      "an object outside the stack must not be removed by a stack removal",
    );
  } finally {
    await removeQuietly("service", serviceName);
    await removeQuietly("secret", secretName);
    await removeQuietly("secret", outsiderName);
    await removeQuietly("config", configName);
    await removeQuietly("network", networkName);
    if (contentDir !== "") await rm(contentDir, { recursive: true, force: true });
    await close();
  }
});
