import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DockerDaemonError } from "../../src/docker/errors.js";
import { installEngineMock } from "../support/engine-mock.js";

// The swarm state of the active daemon, its join tokens and the manager scoping
// every other reading of this area degrades through
// (swarm/specs/swarm-state-service.md, REQ-79, REQ-80).
//
// The daemon is mocked: what is under test is what the service derives from
// what a daemon says — the role, the stated reason, the *derived* raft health —
// none of which can be observed on a machine that is in one swarm state only.
const engine = installEngineMock();

const {
  getSwarmState,
  getJoinTokens,
  rotateJoinToken,
  initialiseSwarm,
  joinSwarm,
  leaveSwarm,
  managerScoped,
  requireManager,
} = await import("../../src/swarm/swarm-state-service.js");

const WORKER_TOKEN = "SWMTKN-1-worker-token-value-0000";
const MANAGER_TOKEN = "SWMTKN-1-manager-token-value-0000";

/** The `Swarm` section of `/info`, as a daemon outside a swarm reports it. */
function inactiveInfo(): unknown {
  return { Swarm: { NodeID: "", LocalNodeState: "inactive", ControlAvailable: false, Error: "" } };
}

/** The same section as a manager reports it. */
function managerInfo(overrides: Record<string, unknown> = {}): unknown {
  return {
    Swarm: {
      NodeID: "self-node-id",
      LocalNodeState: "active",
      ControlAvailable: true,
      Error: "",
      Nodes: 3,
      Managers: 1,
      Cluster: { ID: "cluster-abc123" },
      ...overrides,
    },
  };
}

/** One entry of `/nodes`, reduced to what raft health is derived from. */
function managerNode(overrides: { Leader?: boolean; Reachability?: string } = {}): unknown {
  return { ManagerStatus: { Leader: true, Reachability: "reachable", Addr: "10.0.0.1:2377", ...overrides } };
}

beforeEach(() => {
  engine.reset();
  engine.on("GET", "/info", () => inactiveInfo());
  engine.on("GET", "/nodes", () => []);
  engine.on("GET", "/swarm", () => ({ Version: { Index: 42 }, JoinTokens: { Worker: WORKER_TOKEN, Manager: MANAGER_TOKEN } }));
});

// swarm-state-service.md — "never rejects because the daemon is not in a swarm — that is a state,
// not a failure"; `unavailableReason` "says ... not in a swarm (initialise or join)"
test("getSwarmState reports a daemon outside a swarm as a state, with the way in", async () => {
  const state = await getSwarmState();

  assert.equal(state.role, "inactive");
  assert.equal(state.manager, false);
  assert.equal(state.localNodeState, "inactive");
  assert.equal(state.clusterId, undefined, "a daemon outside a swarm knows no cluster id");
  assert.equal(state.nodeCount, undefined);
  assert.ok(state.unavailableReason && state.unavailableReason.length > 0, "the reason must be stated");
  assert.match(state.unavailableReason!, /initialis|join/i, "the reason must name the way into a swarm");
});

// swarm-state-service.md — a worker: "only a manager can read the cluster"
test("getSwarmState reports a worker as a worker, and says only a manager reads the cluster", async () => {
  engine.on("GET", "/info", () => ({ Swarm: { NodeID: "worker-id", LocalNodeState: "active", ControlAvailable: false, Error: "" } }));

  const state = await getSwarmState();

  assert.equal(state.role, "worker");
  assert.equal(state.manager, false);
  assert.match(state.unavailableReason ?? "", /worker/i);
  assert.match(state.unavailableReason ?? "", /manager/i);
});

// swarm-state-service.md — "localNodeState -> the daemon's own word for it ... passed through
// unchanged"; the reason for a pending/locked/errored swarm carries "its error message when it
// reports one"
test("getSwarmState passes the daemon's own state word through, with the error it reports", async () => {
  engine.on("GET", "/info", () => ({
    Swarm: { NodeID: "n1", LocalNodeState: "locked", ControlAvailable: false, Error: "swarm is encrypted and locked" },
  }));

  const state = await getSwarmState();

  assert.equal(state.localNodeState, "locked");
  assert.equal(state.error, "swarm is encrypted and locked");
  assert.match(state.unavailableReason ?? "", /locked/);
  assert.match(state.unavailableReason ?? "", /swarm is encrypted and locked/);
});

// swarm-state-service.md — on a manager: role, cluster id, node and manager counts, and no reason
test("getSwarmState reports a manager with the cluster id and the counts the daemon gives", async () => {
  engine.on("GET", "/info", () => managerInfo());
  engine.on("GET", "/nodes", () => [managerNode()]);

  const state = await getSwarmState();

  assert.equal(state.role, "manager");
  assert.equal(state.manager, true);
  assert.equal(state.clusterId, "cluster-abc123");
  assert.equal(state.nodeId, "self-node-id");
  assert.equal(state.nodeCount, 3);
  assert.equal(state.managerCount, 1);
  assert.equal(state.unavailableReason, undefined, "a manager needs no reason: it can read everything");
});

// swarm-state-service.md — "raft.status -> 'healthy' when every manager is reachable and one of
// them is the leader"
test("raft health is healthy when every manager is reachable and one leads", async () => {
  engine.on("GET", "/info", () => managerInfo({ Managers: 3 }));
  engine.on("GET", "/nodes", () => [managerNode({ Leader: true }), managerNode({ Leader: false }), managerNode({ Leader: false })]);

  const state = await getSwarmState();

  assert.equal(state.raft.status, "healthy");
  assert.ok(state.raft.detail.length > 0, "a derived health always says what it was derived from");
});

// swarm-state-service.md — "'degraded' when ... there is no leader, detail naming which"
test("raft health is degraded, and says so, when no manager is the leader", async () => {
  engine.on("GET", "/info", () => managerInfo({ Managers: 2 }));
  engine.on("GET", "/nodes", () => [managerNode({ Leader: false }), managerNode({ Leader: false })]);

  const state = await getSwarmState();

  assert.equal(state.raft.status, "degraded");
  assert.match(state.raft.detail, /leader/i);
});

// swarm-state-service.md — "'degraded' when a manager is unreachable ..., detail naming which"
test("raft health is degraded, and says so, when a manager is unreachable", async () => {
  engine.on("GET", "/info", () => managerInfo({ Managers: 3 }));
  engine.on("GET", "/nodes", () => [
    managerNode({ Leader: true }),
    managerNode({ Leader: false, Reachability: "unreachable" }),
    managerNode({ Leader: false }),
  ]);

  const state = await getSwarmState();

  assert.equal(state.raft.status, "degraded");
  assert.match(state.raft.detail, /unreachable/i);
});

// swarm-state-service.md — "'unknown' off a manager ..., detail carrying the reason"
test("raft health is unknown off a manager, and the cluster is not asked for it", async () => {
  const state = await getSwarmState();

  assert.equal(state.raft.status, "unknown");
  assert.ok(state.raft.detail.length > 0);
  assert.equal(engine.callsTo("GET", "/nodes").length, 0, "a node listing cannot be served here, so it is not attempted");
});

// swarm-state-service.md — "'unknown' ... when the node listing itself failed, detail carrying the
// reason"
test("raft health is unknown when the node listing fails, carrying its reason", async () => {
  engine.on("GET", "/info", () => managerInfo());
  engine.on("GET", "/nodes", () => {
    throw new DockerDaemonError("DaemonRejected", "rpc error: code = Unavailable", undefined, 503);
  });

  const state = await getSwarmState();

  assert.equal(state.raft.status, "unknown");
  assert.match(state.raft.detail, /rpc error: code = Unavailable/);
});

// swarm-state-service.md — "It rejects only when the daemon itself is unreachable."
test("getSwarmState rejects only when the daemon itself is unreachable", async () => {
  engine.on("GET", "/info", () => {
    throw new DockerDaemonError("DaemonUnreachable", "Cannot connect to the Docker daemon");
  });

  await assert.rejects(getSwarmState(), /Cannot connect to the Docker daemon/);
});

// swarm-state-service.md — "on a manager: both tokens"
test("getJoinTokens answers both tokens on a manager", async () => {
  engine.on("GET", "/info", () => managerInfo());
  engine.on("GET", "/nodes", () => [managerNode()]);

  const reading = await getJoinTokens();

  assert.deepEqual(reading.tokens, { worker: WORKER_TOKEN, manager: MANAGER_TOKEN });
  assert.equal(reading.unavailableReason, undefined);
});

// swarm-state-service.md — "otherwise: no tokens and the stated reason"
test("getJoinTokens answers no token and the stated reason off a manager", async () => {
  const reading = await getJoinTokens();

  assert.equal(reading.tokens, undefined);
  assert.ok((reading.unavailableReason ?? "").length > 0);
});

// swarm-state-service.md — "A join token is a credential: ... never appears in the swarm state"
// (REQ-80)
test("the swarm state carries no join token, and does not even ask for one", async () => {
  engine.on("GET", "/info", () => managerInfo());
  engine.on("GET", "/nodes", () => [managerNode()]);

  const state = await getSwarmState();

  const serialised = JSON.stringify(state);
  assert.ok(!serialised.includes(WORKER_TOKEN), `the state must carry no worker token: ${serialised}`);
  assert.ok(!serialised.includes(MANAGER_TOKEN), `the state must carry no manager token: ${serialised}`);
  assert.equal(engine.callsTo("GET", "/swarm").length, 0, "reading the state must not read the cluster's tokens");
});

// swarm-state-service.md — "rotates that one token and answers with both current tokens. The other
// token is left as it is."
test("rotateJoinToken rotates the asked-for token only, and answers with both", async () => {
  engine.on("GET", "/info", () => managerInfo());
  engine.on("GET", "/nodes", () => [managerNode()]);
  engine.on("POST", "/swarm/update", () => ({}));

  const reading = await rotateJoinToken("worker");

  assert.deepEqual(reading.tokens, { worker: WORKER_TOKEN, manager: MANAGER_TOKEN });
  const rotation = engine.callsTo("POST", "/swarm/update");
  assert.equal(rotation.length, 1, "exactly one rotation is asked of the daemon");
  assert.equal(rotation[0]!.query.get("rotateWorkerToken"), "true");
  assert.notEqual(rotation[0]!.query.get("rotateManagerToken"), "true", "the manager token must be left as it is");
});

test("rotateJoinToken rotates the manager token alone when that is the target", async () => {
  engine.on("GET", "/info", () => managerInfo());
  engine.on("GET", "/nodes", () => [managerNode()]);
  engine.on("POST", "/swarm/update", () => ({}));

  await rotateJoinToken("manager");

  const rotation = engine.callsTo("POST", "/swarm/update")[0]!;
  assert.equal(rotation.query.get("rotateManagerToken"), "true");
  assert.notEqual(rotation.query.get("rotateWorkerToken"), "true", "the worker token must be left as it is");
});

// swarm-state-service.md — "rejects if the daemon is not a manager -> the reason it states"
test("rotateJoinToken rejects off a manager, with the stated reason and nothing asked of the daemon", async () => {
  await assert.rejects(rotateJoinToken("worker"), (error: Error) => {
    assert.match(error.message, /not part of a swarm/i);
    return true;
  });
  assert.equal(engine.callsTo("POST", "/swarm/update").length, 0, "no rotation may be attempted where it cannot be served");
});

// swarm-state-service.md — "rejects on an empty remoteAddrs or an empty joinToken"
test("joinSwarm rejects an empty address list and an empty token, without touching the daemon", async () => {
  await assert.rejects(joinSwarm({ remoteAddrs: [], joinToken: WORKER_TOKEN }));
  await assert.rejects(joinSwarm({ remoteAddrs: ["10.0.0.1:2377"], joinToken: "  " }));

  assert.equal(engine.callsTo("POST", "/swarm/join").length, 0);
});

// swarm-state-service.md — joinSwarm "effect: this daemon joins the swarm the token belongs to";
// the token travels in the request body, never in the path or the query (REQ-80)
test("joinSwarm hands the daemon the addresses and the token, in the body alone", async () => {
  engine.on("POST", "/swarm/join", () => ({}));

  await joinSwarm({ remoteAddrs: ["10.0.0.1:2377"], joinToken: WORKER_TOKEN, advertiseAddr: "10.0.0.9" });

  const join = engine.callsTo("POST", "/swarm/join")[0]!;
  assert.ok(!join.path.includes(WORKER_TOKEN), `a token must never travel in a path: ${join.path}`);
  const body = join.json as { RemoteAddrs?: string[]; JoinToken?: string; AdvertiseAddr?: string };
  assert.deepEqual(body.RemoteAddrs, ["10.0.0.1:2377"]);
  assert.equal(body.JoinToken, WORKER_TOKEN);
  assert.equal(body.AdvertiseAddr, "10.0.0.9");
});

// swarm-state-service.md — initialiseSwarm "rejects if it is already in a swarm -> the daemon's own
// message"
test("initialiseSwarm reports the daemon's own refusal when it is already in a swarm", async () => {
  engine.on("POST", "/swarm/init", () => {
    throw new DockerDaemonError("DaemonRejected", "This node is already part of a swarm", undefined, 503);
  });

  await assert.rejects(initialiseSwarm({}), /already part of a swarm/);
});

// swarm-state-service.md — leaveSwarm: "force is what a last manager needs to leave"
test("leaveSwarm passes the force the caller asked for to the daemon", async () => {
  engine.on("POST", "/swarm/leave", () => ({}));

  await leaveSwarm(true);
  await leaveSwarm(false);

  const leaves = engine.callsTo("POST", "/swarm/leave");
  assert.equal(leaves[0]!.query.get("force"), "true");
  assert.equal(leaves[1]!.query.get("force"), "false");
});

// swarm-state-service.md — managerScoped: "off a manager: { items: [], unavailableReason } — read is
// never called"
test("managerScoped never runs a manager-only read off a manager, and states why", async () => {
  let ran = false;

  const listing = await managerScoped(async () => {
    ran = true;
    return ["something"];
  });

  assert.equal(ran, false, "the read must not be attempted where the daemon cannot serve it");
  assert.deepEqual(listing.items, []);
  assert.ok((listing.unavailableReason ?? "").length > 0);
});

// swarm-state-service.md — managerScoped: "on a manager: { items } from read"
test("managerScoped returns the read's items on a manager, with no reason", async () => {
  engine.on("GET", "/info", () => managerInfo());

  const listing = await managerScoped(async () => ["a", "b"]);

  assert.deepEqual(listing.items, ["a", "b"]);
  assert.equal(listing.unavailableReason, undefined);
});

// swarm-state-service.md — "when the daemon refuses the read *because* this node is not a manager (a
// state change between the two calls): { items: [], unavailableReason } carrying the daemon's own
// message"
test("managerScoped degrades to the daemon's own message when the node stops being a manager mid-read", async () => {
  engine.on("GET", "/info", () => managerInfo());

  const listing = await managerScoped(async () => {
    throw new DockerDaemonError("DaemonRejected", "This node is not a swarm manager.", undefined, 503);
  });

  assert.deepEqual(listing.items, []);
  assert.equal(listing.unavailableReason, "This node is not a swarm manager.");
});

// swarm-state-service.md — "any other failure propagates"
test("managerScoped lets any other failure propagate", async () => {
  engine.on("GET", "/info", () => managerInfo());

  await assert.rejects(
    managerScoped(async () => {
      throw new DockerDaemonError("DaemonRejected", "something else went wrong", undefined, 500);
    }),
    /something else went wrong/,
  );
});

// swarm-state-service.md — requireManager "resolves on a manager; otherwise rejects with the stated
// reason, as a daemon-rejection carrying HTTP 409"
test("requireManager resolves on a manager and rejects with a 409-carrying reason otherwise", async () => {
  engine.on("GET", "/info", () => managerInfo());
  await requireManager();

  engine.on("GET", "/info", () => inactiveInfo());
  await assert.rejects(requireManager(), (error: unknown) => {
    assert.ok(error instanceof DockerDaemonError);
    assert.equal((error as DockerDaemonError).statusCode, 409);
    assert.match((error as Error).message, /not part of a swarm/i);
    return true;
  });
});
