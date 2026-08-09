// Swarm state of the active daemon, the operations that change it, and the
// join tokens (REQ-79, REQ-80).
//
// Two rules shape this module. The state itself is read from `/info`, which
// answers whatever the swarm state is — every manager-only Engine API route
// answers 503 on a node that is not a manager, so it could not tell us why.
// And every manager-only reading of this area degrades to a *stated reason*
// (`managerScoped`) rather than to an error: on a daemon outside a swarm the
// screen must say so and offer init/join, not show an empty panel.
//
// A join token is a credential: it is returned to the caller that asked for it
// and is never logged, never part of the state and never part of an error.
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { DockerDaemonError } from "../docker/errors.js";

export type SwarmRole = "inactive" | "manager" | "worker";

export interface SwarmRaftHealth {
  status: "healthy" | "degraded" | "unknown";
  detail: string;
}

export interface SwarmState {
  role: SwarmRole;
  /** The daemon's own word: inactive | pending | active | error | locked. */
  localNodeState: string;
  manager: boolean;
  clusterId?: string;
  nodeId?: string;
  nodeCount?: number;
  managerCount?: number;
  raft: SwarmRaftHealth;
  /** Why manager-only readings cannot be served here; absent on a manager. */
  unavailableReason?: string;
  /** The swarm error the daemon reports, when it reports one. */
  error?: string;
}

export interface SwarmJoinTokens {
  worker: string;
  manager: string;
}

export interface SwarmTokensReading {
  tokens?: SwarmJoinTokens;
  unavailableReason?: string;
}

/** A manager-only listing: the items, or the reason there are none to show. */
export interface SwarmListing<T> {
  items: T[];
  unavailableReason?: string;
}

export interface InitialiseSwarmInput {
  advertiseAddr?: string;
  listenAddr?: string;
}

export interface JoinSwarmInput {
  remoteAddrs: string[];
  joinToken: string;
  advertiseAddr?: string;
  listenAddr?: string;
}

const DEFAULT_LISTEN_ADDR = "0.0.0.0:2377";

interface RawInfoSwarm {
  NodeID?: string;
  NodeAddr?: string;
  LocalNodeState?: string;
  ControlAvailable?: boolean;
  Error?: string;
  Nodes?: number;
  Managers?: number;
  RemoteManagers?: { NodeID?: string; Addr?: string }[] | null;
  Cluster?: { ID?: string } | null;
}

interface RawSwarmInspect {
  ID?: string;
  Version?: { Index?: number };
  Spec?: unknown;
  JoinTokens?: { Worker?: string; Manager?: string };
}

interface RawManagerStatus {
  Leader?: boolean;
  Reachability?: string;
  Addr?: string;
}

async function readInfoSwarm(): Promise<RawInfoSwarm> {
  const response = await getEngineClient().request("/info");
  const payload = JSON.parse(response.body) as { Swarm?: RawInfoSwarm };
  return payload.Swarm ?? {};
}

function roleOf(swarm: RawInfoSwarm): SwarmRole {
  if (swarm.ControlAvailable) return "manager";
  const state = swarm.LocalNodeState ?? "inactive";
  return state === "inactive" ? "inactive" : "worker";
}

/** Why a manager-only reading cannot be served, said in a way that names the way out. */
function unavailableReasonFor(swarm: RawInfoSwarm): string | undefined {
  if (swarm.ControlAvailable) return undefined;
  const state = swarm.LocalNodeState ?? "inactive";
  const daemonError = swarm.Error && swarm.Error !== "" ? ` The daemon reports: ${swarm.Error}` : "";
  if (state === "inactive") {
    return "This daemon is not part of a swarm. Initialise a swarm or join an existing one to see its nodes, services, stacks, secrets and configs.";
  }
  if (state === "active") {
    return "This daemon is a swarm worker: only a manager can read the cluster's nodes, services, stacks, secrets and configs.";
  }
  return `The swarm on this daemon is "${state}", so the cluster cannot be read from here.${daemonError}`;
}

/**
 * Raft health is derived, not reported: the daemon exposes no health flag, so
 * it comes from the reachability and leadership carried by the node listing.
 * Read here rather than through the node service so the two do not import each
 * other.
 */
async function readRaftHealth(manager: boolean): Promise<SwarmRaftHealth> {
  if (!manager) return { status: "unknown", detail: "Raft health is only visible from a swarm manager." };
  let managers: RawManagerStatus[];
  try {
    const response = await getEngineClient().request("/nodes");
    const raw = JSON.parse(response.body) as { ManagerStatus?: RawManagerStatus }[];
    managers = raw.map((node) => node.ManagerStatus).filter((status): status is RawManagerStatus => Boolean(status));
  } catch (error) {
    return { status: "unknown", detail: (error as Error).message };
  }
  if (managers.length === 0) return { status: "unknown", detail: "The daemon reported no manager status for any node." };
  const unreachable = managers.filter((status) => (status.Reachability ?? "unknown") !== "reachable");
  const leaders = managers.filter((status) => status.Leader === true);
  if (leaders.length === 0) {
    return { status: "degraded", detail: `no leader among ${managers.length} manager${managers.length === 1 ? "" : "s"}` };
  }
  if (unreachable.length > 0) {
    return { status: "degraded", detail: `${unreachable.length} of ${managers.length} managers unreachable` };
  }
  return { status: "healthy", detail: `${managers.length} manager${managers.length === 1 ? "" : "s"}, quorum held` };
}

export async function getSwarmState(): Promise<SwarmState> {
  const swarm = await readInfoSwarm();
  const manager = swarm.ControlAvailable === true;
  const unavailableReason = unavailableReasonFor(swarm);
  return {
    role: roleOf(swarm),
    localNodeState: swarm.LocalNodeState ?? "inactive",
    manager,
    clusterId: swarm.Cluster?.ID,
    nodeId: swarm.NodeID && swarm.NodeID !== "" ? swarm.NodeID : undefined,
    nodeCount: swarm.Nodes,
    managerCount: swarm.Managers ?? swarm.RemoteManagers?.length,
    raft: await readRaftHealth(manager),
    unavailableReason,
    error: swarm.Error && swarm.Error !== "" ? swarm.Error : undefined,
  };
}

/** True when the daemon refused a read for the one reason that is a state, not a failure. */
function refusedForNotAManager(error: unknown): error is DockerDaemonError {
  return error instanceof DockerDaemonError && error.statusCode === 503 && /not a swarm manager/i.test(error.message);
}

/**
 * Runs a manager-only listing, degrading to a stated reason instead of an
 * error when this daemon cannot serve it.
 */
export async function managerScoped<T>(read: () => Promise<T[]>): Promise<SwarmListing<T>> {
  const swarm = await readInfoSwarm();
  const unavailableReason = unavailableReasonFor(swarm);
  if (unavailableReason) return { items: [], unavailableReason };
  try {
    return { items: await read() };
  } catch (error) {
    // The node stopped being a manager between the two calls.
    if (refusedForNotAManager(error)) return { items: [], unavailableReason: error.message };
    throw error;
  }
}

/** Resolves on a manager; rejects with the stated reason otherwise (HTTP 409 for the caller). */
export async function requireManager(): Promise<void> {
  const reason = unavailableReasonFor(await readInfoSwarm());
  if (reason) throw new DockerDaemonError("DaemonRejected", reason, undefined, 409);
}

async function inspectSwarm(): Promise<RawSwarmInspect> {
  const response = await getEngineClient().request("/swarm");
  return JSON.parse(response.body) as RawSwarmInspect;
}

function tokensOf(raw: RawSwarmInspect): SwarmJoinTokens {
  return { worker: raw.JoinTokens?.Worker ?? "", manager: raw.JoinTokens?.Manager ?? "" };
}

export async function getJoinTokens(): Promise<SwarmTokensReading> {
  const reason = unavailableReasonFor(await readInfoSwarm());
  if (reason) return { unavailableReason: reason };
  try {
    return { tokens: tokensOf(await inspectSwarm()) };
  } catch (error) {
    if (refusedForNotAManager(error)) return { unavailableReason: error.message };
    throw error;
  }
}

/**
 * Rotates one of the two tokens. The daemon's swarm update takes the current
 * spec back, so the spec read here is sent unchanged: rotation must not alter
 * any other cluster setting.
 */
export async function rotateJoinToken(target: "worker" | "manager"): Promise<SwarmTokensReading> {
  await requireManager();
  const current = await inspectSwarm();
  const version = current.Version?.Index ?? 0;
  const query = new URLSearchParams({
    version: String(version),
    rotateWorkerToken: String(target === "worker"),
    rotateManagerToken: String(target === "manager"),
  });
  await getEngineClient().request(`/swarm/update?${query.toString()}`, {
    method: "POST",
    body: JSON.stringify(current.Spec ?? {}),
  });
  return { tokens: tokensOf(await inspectSwarm()) };
}

export async function initialiseSwarm(input: InitialiseSwarmInput): Promise<SwarmState> {
  const body = JSON.stringify({
    ListenAddr: input.listenAddr?.trim() || DEFAULT_LISTEN_ADDR,
    AdvertiseAddr: input.advertiseAddr?.trim() || undefined,
    // Never forces a new cluster out of an existing one: recovering a lost
    // quorum is a destructive, out-of-band operation, not an affordance here.
    ForceNewCluster: false,
  });
  await getEngineClient().request("/swarm/init", { method: "POST", body });
  return getSwarmState();
}

export async function joinSwarm(input: JoinSwarmInput): Promise<SwarmState> {
  const remoteAddrs = input.remoteAddrs.map((addr) => addr.trim()).filter((addr) => addr !== "");
  if (remoteAddrs.length === 0) throw new DockerDaemonError("DaemonRejected", "At least one manager address is required to join a swarm.", undefined, 400);
  if (input.joinToken.trim() === "") throw new DockerDaemonError("DaemonRejected", "A join token is required to join a swarm.", undefined, 400);
  const body = JSON.stringify({
    ListenAddr: input.listenAddr?.trim() || DEFAULT_LISTEN_ADDR,
    AdvertiseAddr: input.advertiseAddr?.trim() || undefined,
    RemoteAddrs: remoteAddrs,
    JoinToken: input.joinToken.trim(),
  });
  await getEngineClient().request("/swarm/join", { method: "POST", body });
  return getSwarmState();
}

export async function leaveSwarm(force: boolean): Promise<SwarmState> {
  await getEngineClient().request(`/swarm/leave?force=${force ? "true" : "false"}`, { method: "POST" });
  return getSwarmState();
}
