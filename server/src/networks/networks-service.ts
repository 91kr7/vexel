// Network listing, inspect, create, remove, prune and container
// attach/detach over the Engine API (REQ-72, REQ-73, REQ-74). Attached
// containers are not part of the daemon's own /networks listing: they are
// merged in from /containers/json (each container's own NetworkSettings).
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { byNameThenIdentity } from "../list-order/list-order.js";
import { registerRefreshKind } from "../refresh-cache/refresh-cache.js";

export interface NetworkSummary {
  id: string;
  name: string;
  driver: string;
  scope: string;
  subnet?: string;
  gateway?: string;
  ipRange?: string;
  labels: Record<string, string>;
  options: Record<string, string>;
  /** Names of the containers currently attached to this network; empty when unattached. */
  attachedContainers: string[];
}

export interface NetworkInspect extends NetworkSummary {
  raw: unknown;
}

export interface CreateNetworkInput {
  name: string;
  driver?: string;
  subnet?: string;
  gateway?: string;
  ipRange?: string;
  options?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface NetworkPruneResult {
  removedNames: string[];
}

interface RawIpamConfig {
  Subnet?: string;
  Gateway?: string;
  IPRange?: string;
}

interface RawNetwork {
  Id: string;
  Name: string;
  Driver: string;
  Scope: string;
  IPAM?: { Config?: RawIpamConfig[] | null } | null;
  Labels?: Record<string, string> | null;
  Options?: Record<string, string> | null;
  Containers?: Record<string, { Name?: string }> | null;
}

interface RawContainerSummary {
  Names?: string[];
  NetworkSettings?: { Networks?: Record<string, unknown> | null } | null;
}

/** Every container's own NetworkSettings.Networks, grouped by network name. */
async function readAttachedContainers(): Promise<Map<string, string[]>> {
  const response = await getEngineClient().request("/containers/json?all=true");
  const raw = JSON.parse(response.body) as RawContainerSummary[];
  const attached = new Map<string, string[]>();
  for (const container of raw) {
    const name = (container.Names?.[0] ?? "").replace(/^\//, "");
    for (const networkName of Object.keys(container.NetworkSettings?.Networks ?? {})) {
      const names = attached.get(networkName) ?? [];
      names.push(name);
      attached.set(networkName, names);
    }
  }
  return attached;
}

function toSummary(raw: RawNetwork, attachedContainers: Map<string, string[]>): NetworkSummary {
  const ipamConfig = raw.IPAM?.Config?.[0];
  return {
    id: raw.Id,
    name: raw.Name,
    driver: raw.Driver,
    scope: raw.Scope,
    subnet: ipamConfig?.Subnet,
    gateway: ipamConfig?.Gateway,
    ipRange: ipamConfig?.IPRange,
    labels: raw.Labels ?? {},
    options: raw.Options ?? {},
    attachedContainers: attachedContainers.get(raw.Name) ?? [],
  };
}

export async function listNetworks(): Promise<NetworkSummary[]> {
  const [networksResponse, attachedContainers] = await Promise.all([
    getEngineClient().request("/networks"),
    readAttachedContainers(),
  ]);
  const raw = JSON.parse(networksResponse.body) as RawNetwork[];
  // Docker does not guarantee network-name uniqueness, so the id decides
  // between two rows carrying one name rather than the daemon's own order.
  return raw
    .map((network) => toSummary(network, attachedContainers))
    .sort(byNameThenIdentity({ name: (network) => network.name, identity: (network) => network.id }));
}

/**
 * The network listing as the refresh cache keeps it: read on its own period and
 * whenever a `network` or `container` event — a container attaching or leaving
 * changes what the list shows — or one of this application's own operations
 * says so (REQ-9, REQ-11, REQ-12, REQ-13).
 */
export const networkListCache = registerRefreshKind({
  key: "networks",
  periodMs: 30000,
  eventTypes: ["network", "container"],
  read: listNetworks,
});

/** `GET /networks/{id}` itself rejects with a daemon 404 for an unknown id/name; its own `Containers` map is authoritative. */
export async function getNetworkInspect(id: string): Promise<NetworkInspect> {
  const response = await getEngineClient().request(`/networks/${encodeURIComponent(id)}`);
  const raw = JSON.parse(response.body) as RawNetwork;
  const attachedContainers = new Map<string, string[]>();
  const names = Object.values(raw.Containers ?? {})
    .map((entry) => entry.Name)
    .filter((name): name is string => typeof name === "string");
  attachedContainers.set(raw.Name, names);
  return { ...toSummary(raw, attachedContainers), raw };
}

export async function createNetwork(input: CreateNetworkInput): Promise<NetworkSummary> {
  const hasIpam = Boolean(input.subnet || input.gateway || input.ipRange);
  const body = JSON.stringify({
    Name: input.name.trim(),
    Driver: input.driver && input.driver.trim() !== "" ? input.driver.trim() : undefined,
    IPAM: hasIpam
      ? { Config: [{ Subnet: input.subnet || undefined, Gateway: input.gateway || undefined, IPRange: input.ipRange || undefined }] }
      : undefined,
    Options: input.options && Object.keys(input.options).length > 0 ? input.options : undefined,
    Labels: input.labels && Object.keys(input.labels).length > 0 ? input.labels : undefined,
  });
  const response = await getEngineClient().request("/networks/create", { method: "POST", body });
  const created = JSON.parse(response.body) as { Id: string };
  networkListCache.markChanged();
  return getNetworkInspect(created.Id);
}

export async function removeNetwork(id: string): Promise<void> {
  await getEngineClient().request(`/networks/${encodeURIComponent(id)}`, { method: "DELETE" });
  networkListCache.markChanged();
}

/** Prunes every network not currently used by a container, reporting the removed names. */
export async function pruneNetworks(): Promise<NetworkPruneResult> {
  const response = await getEngineClient().request("/networks/prune", { method: "POST" });
  const payload = JSON.parse(response.body) as { NetworksDeleted?: string[] };
  networkListCache.markChanged();
  return { removedNames: payload.NetworksDeleted ?? [] };
}

/** Attaches a container to a network; returns the network's updated attachment set. */
export async function attachContainer(networkId: string, containerId: string): Promise<NetworkInspect> {
  await getEngineClient().request(`/networks/${encodeURIComponent(networkId)}/connect`, {
    method: "POST",
    body: JSON.stringify({ Container: containerId }),
  });
  networkListCache.markChanged();
  return getNetworkInspect(networkId);
}

/** Detaches a container from a network; returns the network's updated attachment set. */
export async function detachContainer(networkId: string, containerId: string): Promise<NetworkInspect> {
  await getEngineClient().request(`/networks/${encodeURIComponent(networkId)}/disconnect`, {
    method: "POST",
    body: JSON.stringify({ Container: containerId, Force: true }),
  });
  networkListCache.markChanged();
  return getNetworkInspect(networkId);
}
