// Swarm node inventory, role/availability updates and node removal (REQ-81).
// Every reading goes through the manager scoping of the state service, so on a
// daemon that is not a manager it degrades to a stated reason.
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { byNameThenIdentity } from "../list-order/list-order.js";
import { getSwarmState, managerScoped, requireManager, type SwarmListing } from "./swarm-state-service.js";

export type SwarmNodeRole = "manager" | "worker";
export type SwarmNodeAvailability = "active" | "pause" | "drain";

export interface SwarmNode {
  id: string;
  hostname: string;
  role: SwarmNodeRole;
  availability: SwarmNodeAvailability;
  status: string;
  statusMessage?: string;
  address?: string;
  leader: boolean;
  reachability?: string;
  engineVersion?: string;
  platform?: string;
  /** This node is the daemon the application is talking to. */
  self: boolean;
  /** The version index the daemon requires to accept the next update. */
  version: number;
  labels: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateNodeInput {
  role?: SwarmNodeRole;
  availability?: SwarmNodeAvailability;
}

interface RawNodeSpec {
  Name?: string;
  Labels?: Record<string, string> | null;
  Role?: string;
  Availability?: string;
}

interface RawNode {
  ID: string;
  Version?: { Index?: number };
  CreatedAt?: string;
  UpdatedAt?: string;
  Spec?: RawNodeSpec;
  Description?: {
    Hostname?: string;
    Platform?: { Architecture?: string; OS?: string };
    Engine?: { EngineVersion?: string };
  };
  Status?: { State?: string; Message?: string; Addr?: string };
  ManagerStatus?: { Leader?: boolean; Reachability?: string; Addr?: string };
}

function platformOf(raw: RawNode): string | undefined {
  const os = raw.Description?.Platform?.OS;
  const architecture = raw.Description?.Platform?.Architecture;
  if (!os && !architecture) return undefined;
  return [os, architecture].filter(Boolean).join("/");
}

function toNode(raw: RawNode, localNodeId: string | undefined): SwarmNode {
  return {
    id: raw.ID,
    hostname: raw.Description?.Hostname ?? raw.ID,
    role: raw.Spec?.Role === "manager" ? "manager" : "worker",
    availability: (raw.Spec?.Availability as SwarmNodeAvailability | undefined) ?? "active",
    status: raw.Status?.State ?? "unknown",
    statusMessage: raw.Status?.Message && raw.Status.Message !== "" ? raw.Status.Message : undefined,
    address: raw.Status?.Addr ?? raw.ManagerStatus?.Addr,
    leader: raw.ManagerStatus?.Leader === true,
    reachability: raw.ManagerStatus?.Reachability,
    engineVersion: raw.Description?.Engine?.EngineVersion,
    platform: platformOf(raw),
    self: localNodeId !== undefined && raw.ID === localNodeId,
    version: raw.Version?.Index ?? 0,
    labels: raw.Spec?.Labels ?? {},
    createdAt: raw.CreatedAt,
    updatedAt: raw.UpdatedAt,
  };
}

async function readNode(id: string): Promise<RawNode> {
  const response = await getEngineClient().request(`/nodes/${encodeURIComponent(id)}`);
  return JSON.parse(response.body) as RawNode;
}

export function listNodes(): Promise<SwarmListing<SwarmNode>> {
  return managerScoped(async () => {
    const [response, state] = await Promise.all([getEngineClient().request("/nodes"), getSwarmState()]);
    const raw = JSON.parse(response.body) as RawNode[];
    // Managers stay ahead of workers: the role is the grouping rank compared
    // before the hostname, and only the comparison of hostnames changes.
    return raw
      .map((node) => toNode(node, state.nodeId))
      .sort(
        byNameThenIdentity({
          group: (node) => (node.role === "manager" ? 0 : 1),
          name: (node) => node.hostname,
          identity: (node) => node.id,
        }),
      );
  });
}

/**
 * Changes a node's role and/or availability. The daemon replaces the whole
 * spec, so the current one is re-read and sent back with only the requested
 * fields changed — otherwise the node's name and labels would be dropped — and
 * against the version it carries right now, which is what makes a concurrent
 * update fail instead of overwrite.
 */
export async function updateNode(id: string, input: UpdateNodeInput): Promise<SwarmNode> {
  await requireManager();
  const current = await readNode(id);
  const spec: RawNodeSpec = {
    Name: current.Spec?.Name,
    Labels: current.Spec?.Labels ?? {},
    Role: input.role ?? current.Spec?.Role ?? "worker",
    Availability: input.availability ?? current.Spec?.Availability ?? "active",
  };
  await getEngineClient().request(`/nodes/${encodeURIComponent(id)}/update?version=${current.Version?.Index ?? 0}`, {
    method: "POST",
    body: JSON.stringify(spec),
  });
  const state = await getSwarmState();
  return toNode(await readNode(id), state.nodeId);
}

export async function removeNode(id: string, force: boolean): Promise<void> {
  await requireManager();
  await getEngineClient().request(`/nodes/${encodeURIComponent(id)}?force=${force ? "true" : "false"}`, { method: "DELETE" });
}
