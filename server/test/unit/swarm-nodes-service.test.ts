import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DockerDaemonError } from "../../src/docker/errors.js";
import { installEngineMock } from "../support/engine-mock.js";

// The node inventory of the swarm and the two changes an operator makes to one
// (swarm/specs/swarm-nodes-service.md, REQ-81).
//
// The daemon is mocked: a cluster with a manager, a worker and an unreachable
// node cannot be arranged on the machine this runs on, and the ordering, the
// self marking and the "whole spec at the current version" rule are exactly
// what a single-node cluster would never show.
const engine = installEngineMock();

const { listNodes, updateNode, removeNode } = await import("../../src/swarm/swarm-nodes-service.js");

const SELF_ID = "self-node-id";

function managerInfo(): unknown {
  return { Swarm: { NodeID: SELF_ID, LocalNodeState: "active", ControlAvailable: true, Error: "", Nodes: 3, Managers: 1 } };
}

function inactiveInfo(): unknown {
  return { Swarm: { NodeID: "", LocalNodeState: "inactive", ControlAvailable: false, Error: "" } };
}

interface RawNodeOverrides {
  ID?: string;
  hostname?: string;
  role?: string;
  availability?: string;
  state?: string;
  message?: string;
  manager?: { Leader: boolean; Reachability: string } | undefined;
  labels?: Record<string, string>;
  index?: number;
}

/** One `/nodes` entry, in the shape the Engine API returns. */
function rawNode(overrides: RawNodeOverrides = {}): Record<string, unknown> {
  const {
    ID = "node-a",
    hostname = "host-a",
    role = "worker",
    availability = "active",
    state = "ready",
    message = "",
    manager = undefined,
    labels = {},
    index = 10,
  } = overrides;
  return {
    ID,
    Version: { Index: index },
    CreatedAt: "2026-01-01T00:00:00.000000000Z",
    UpdatedAt: "2026-02-01T00:00:00.000000000Z",
    Spec: { Name: `spec-name-${ID}`, Labels: labels, Role: role, Availability: availability },
    Description: {
      Hostname: hostname,
      Platform: { Architecture: "x86_64", OS: "linux" },
      Engine: { EngineVersion: "27.0.3" },
    },
    Status: { State: state, Message: message, Addr: "10.0.0.7" },
    ...(manager ? { ManagerStatus: { ...manager, Addr: "10.0.0.7:2377" } } : {}),
  };
}

beforeEach(() => {
  engine.reset();
  engine.on("GET", "/info", () => managerInfo());
  engine.on("GET", "/nodes", () => []);
});

// swarm-nodes-service.md — SwarmNode carries hostname, role, availability, status, statusMessage,
// address, leader, reachability, engineVersion, platform, self, version, labels (REQ-81)
test("listNodes reports each node as the daemon describes it", async () => {
  engine.on("GET", "/nodes", () => [
    rawNode({
      ID: SELF_ID,
      hostname: "manager-1",
      role: "manager",
      availability: "drain",
      state: "down",
      message: "heartbeat failure",
      manager: { Leader: true, Reachability: "reachable" },
      labels: { region: "eu" },
      index: 27,
    }),
  ]);

  const listing = await listNodes();

  assert.equal(listing.unavailableReason, undefined);
  const node = listing.items[0]!;
  assert.equal(node.id, SELF_ID);
  assert.equal(node.hostname, "manager-1");
  assert.equal(node.role, "manager");
  assert.equal(node.availability, "drain");
  assert.equal(node.status, "down");
  assert.equal(node.statusMessage, "heartbeat failure");
  assert.equal(node.address, "10.0.0.7");
  assert.equal(node.leader, true);
  assert.equal(node.reachability, "reachable");
  assert.equal(node.engineVersion, "27.0.3");
  assert.equal(node.self, true, "the node the application is talking to is marked as such");
  assert.equal(node.version, 27, "the version is the index the next update must carry");
  assert.deepEqual(node.labels, { region: "eu" });
});

// swarm-nodes-service.md — "leader is false on a worker"
test("listNodes reports a worker as not the leader", async () => {
  engine.on("GET", "/nodes", () => [rawNode({ ID: "worker-1", hostname: "worker-1", role: "worker" })]);

  const [node] = (await listNodes()).items;

  assert.equal(node!.leader, false);
  assert.equal(node!.self, false, "only the daemon's own node is marked as itself");
});

// swarm-nodes-service.md — "ordered: managers first, then by hostname"
test("listNodes orders managers first, then by hostname", async () => {
  engine.on("GET", "/nodes", () => [
    rawNode({ ID: "w2", hostname: "zeta", role: "worker" }),
    rawNode({ ID: "m2", hostname: "manager-b", role: "manager", manager: { Leader: false, Reachability: "reachable" } }),
    rawNode({ ID: "w1", hostname: "alpha", role: "worker" }),
    rawNode({ ID: "m1", hostname: "manager-a", role: "manager", manager: { Leader: true, Reachability: "reachable" } }),
  ]);

  const hostnames = (await listNodes()).items.map((node) => node.hostname);

  assert.deepEqual(hostnames, ["manager-a", "manager-b", "alpha", "zeta"]);
});

// swarm-nodes-service.md — "off a manager: no items and the stated reason"
test("listNodes degrades to a stated reason off a manager", async () => {
  engine.on("GET", "/info", () => inactiveInfo());

  const listing = await listNodes();

  assert.deepEqual(listing.items, []);
  assert.ok((listing.unavailableReason ?? "").length > 0);
  assert.equal(engine.callsTo("GET", "/nodes").length, 0, "a listing that cannot be served is not attempted");
});

// swarm-nodes-service.md — "An update sends the node's whole current spec with the requested fields
// changed", "against the version the node currently carries, re-read immediately before", and
// "omitting a field leaves it as it is"
test("updateNode sends the whole current spec, one field changed, at the node's current version", async () => {
  const stored = rawNode({ ID: "node-a", hostname: "host-a", role: "worker", availability: "active", labels: { rack: "r7" }, index: 31 });
  engine.on("GET", "/nodes/node-a", () => stored);
  engine.on("GET", "/nodes", () => [stored]);
  engine.on("POST", "/nodes/node-a/update", (call) => {
    Object.assign(stored, { Spec: call.json, Version: { Index: 32 } });
    return {};
  });

  const updated = await updateNode("node-a", { availability: "drain" });

  const request = engine.callsTo("POST", "/nodes/node-a/update")[0]!;
  assert.equal(request.query.get("version"), "31", "the update must carry the version the node currently holds");
  const spec = request.json as { Name?: string; Labels?: Record<string, string>; Role?: string; Availability?: string };
  assert.equal(spec.Availability, "drain", "the asked-for change is applied");
  assert.equal(spec.Role, "worker", "an omitted field keeps the value the node has");
  assert.equal(spec.Name, "spec-name-node-a", "a partial spec would silently drop the node's name");
  assert.deepEqual(spec.Labels, { rack: "r7" }, "a partial spec would silently drop the node's labels");
  assert.equal(updated.availability, "drain");
});

test("updateNode changes the role alone when that is what was asked", async () => {
  const stored = rawNode({ ID: "node-b", hostname: "host-b", role: "worker", availability: "pause", index: 5 });
  engine.on("GET", "/nodes/node-b", () => stored);
  engine.on("GET", "/nodes", () => [stored]);
  engine.on("POST", "/nodes/node-b/update", (call) => {
    Object.assign(stored, { Spec: call.json });
    return {};
  });

  await updateNode("node-b", { role: "manager" });

  const spec = engine.callsTo("POST", "/nodes/node-b/update")[0]!.json as { Role?: string; Availability?: string };
  assert.equal(spec.Role, "manager");
  assert.equal(spec.Availability, "pause", "availability was not asked about, so it is left as it is");
});

// swarm-nodes-service.md — "rejects if the daemon is not a manager -> the stated reason"
test("updateNode rejects off a manager, without asking the daemon", async () => {
  engine.on("GET", "/info", () => inactiveInfo());

  await assert.rejects(updateNode("node-a", { availability: "drain" }), /not part of a swarm/i);
  assert.equal(engine.callsTo("POST", /\/nodes\/.*\/update/).length, 0);
});

// swarm-nodes-service.md — "rejects with the daemon's own message when it refuses (e.g. demoting the
// last manager)"
test("updateNode reports the daemon's own refusal", async () => {
  const stored = rawNode({ ID: "node-a", role: "manager", manager: { Leader: true, Reachability: "reachable" } });
  engine.on("GET", "/nodes/node-a", () => stored);
  engine.on("POST", "/nodes/node-a/update", () => {
    throw new DockerDaemonError("DaemonRejected", "attempting to demote the last manager of the swarm", undefined, 503);
  });

  await assert.rejects(updateNode("node-a", { role: "worker" }), /demote the last manager/);
});

// swarm-nodes-service.md — removeNode: "force is what removing a node that is still reachable
// requires"
test("removeNode passes the force the caller asked for", async () => {
  engine.on("DELETE", "/nodes/node-a", () => ({}));

  await removeNode("node-a", true);

  assert.equal(engine.callsTo("DELETE", "/nodes/node-a")[0]!.query.get("force"), "true");
});

// swarm-nodes-service.md — removeNode "rejects if the daemon is not a manager"
test("removeNode rejects off a manager, without asking the daemon", async () => {
  engine.on("GET", "/info", () => inactiveInfo());

  await assert.rejects(removeNode("node-a", true), /not part of a swarm/i);
  assert.equal(engine.callsTo("DELETE", /\/nodes\//).length, 0);
});
