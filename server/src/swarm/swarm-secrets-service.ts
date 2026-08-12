// Swarm secrets and configs: listing, creation, metadata inspection and
// removal (REQ-84).
//
// A value is write-only here. It is accepted once, encoded, handed to the
// daemon and dropped: nothing in this module returns it, and nothing logs it.
// The daemon never returns a secret's data; a config's data, which it does
// return, is stripped for the same reason — the application shows metadata,
// and only metadata.
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { DockerDaemonError } from "../docker/errors.js";
import { byNameThenIdentity } from "../list-order/list-order.js";
import { STACK_NAMESPACE_LABEL } from "./swarm-services-service.js";
import { managerScoped, requireManager, type SwarmListing } from "./swarm-state-service.js";

export type SwarmDataKind = "secret" | "config";

export interface SwarmDataItem {
  kind: SwarmDataKind;
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  version: number;
  labels: Record<string, string>;
  stack?: string;
}

export interface CreateSwarmDataInput {
  name: string;
  /** Held only long enough to be encoded and sent; never stored and never returned. */
  value: string;
  labels?: Record<string, string>;
}

interface RawSwarmData {
  ID: string;
  Version?: { Index?: number };
  CreatedAt?: string;
  UpdatedAt?: string;
  Spec?: { Name?: string; Labels?: Record<string, string> | null; Data?: string };
}

function collectionOf(kind: SwarmDataKind): string {
  return kind === "secret" ? "/secrets" : "/configs";
}

/** Maps the daemon's payload to metadata; `Spec.Data` is deliberately not read. */
function toItem(kind: SwarmDataKind, raw: RawSwarmData): SwarmDataItem {
  const labels = raw.Spec?.Labels ?? {};
  return {
    kind,
    id: raw.ID,
    name: raw.Spec?.Name ?? raw.ID,
    createdAt: raw.CreatedAt,
    updatedAt: raw.UpdatedAt,
    version: raw.Version?.Index ?? 0,
    labels,
    stack: labels[STACK_NAMESPACE_LABEL],
  };
}

export function listSwarmData(kind: SwarmDataKind): Promise<SwarmListing<SwarmDataItem>> {
  return managerScoped(async () => {
    const response = await getEngineClient().request(collectionOf(kind));
    const raw = JSON.parse(response.body) as RawSwarmData[];
    return raw.map((entry) => toItem(kind, entry)).sort(byNameThenIdentity({ name: (item) => item.name, identity: (item) => item.id }));
  });
}

export async function getSwarmDataMetadata(kind: SwarmDataKind, id: string): Promise<SwarmDataItem> {
  await requireManager();
  const response = await getEngineClient().request(`${collectionOf(kind)}/${encodeURIComponent(id)}`);
  return toItem(kind, JSON.parse(response.body) as RawSwarmData);
}

export async function createSwarmData(kind: SwarmDataKind, input: CreateSwarmDataInput): Promise<SwarmDataItem> {
  await requireManager();
  const name = input.name.trim();
  if (name === "") throw new DockerDaemonError("DaemonRejected", `A ${kind} name is required.`, undefined, 400);
  if (input.value === "") throw new DockerDaemonError("DaemonRejected", `A ${kind} value is required.`, undefined, 400);
  const body = JSON.stringify({
    Name: name,
    Labels: input.labels && Object.keys(input.labels).length > 0 ? input.labels : undefined,
    Data: Buffer.from(input.value, "utf8").toString("base64"),
  });
  const response = await getEngineClient().request(`${collectionOf(kind)}/create`, { method: "POST", body });
  const created = JSON.parse(response.body) as { ID?: string };
  return getSwarmDataMetadata(kind, created.ID ?? name);
}

export async function removeSwarmData(kind: SwarmDataKind, id: string): Promise<void> {
  await requireManager();
  await getEngineClient().request(`${collectionOf(kind)}/${encodeURIComponent(id)}`, { method: "DELETE" });
}
