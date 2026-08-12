// Swarm stacks: listed with their services, and removable (REQ-83).
//
// A stack is not a Docker object — it exists only as the
// `com.docker.stack.namespace` label the services, secrets, configs and
// networks deployed together carry. Membership is read from that label alone,
// so a stack deployed from a terminal reads exactly like any other.
//
// This service does NOT deploy stacks: deployment was withdrawn on 2026-08-07
// (departure Three), so nothing here takes a compose file.
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { DockerDaemonError } from "../docker/errors.js";
import { byNameThenIdentity } from "../list-order/list-order.js";
import { listServices, STACK_NAMESPACE_LABEL, type SwarmServiceMode } from "./swarm-services-service.js";
import { managerScoped, requireManager, type SwarmListing } from "./swarm-state-service.js";

export interface SwarmStackService {
  id: string;
  name: string;
  image: string;
  mode: SwarmServiceMode;
  replicasRunning?: number;
  replicasDesired?: number;
}

export interface SwarmStack {
  name: string;
  serviceCount: number;
  services: SwarmStackService[];
  secretCount: number;
  configCount: number;
  networkCount: number;
}

export interface StackRemovalResult {
  removedServices: string[];
  removedSecrets: string[];
  removedConfigs: string[];
  removedNetworks: string[];
}

interface RawLabelled {
  ID?: string;
  Id?: string;
  Name?: string;
  Spec?: { Name?: string; Labels?: Record<string, string> | null };
  Labels?: Record<string, string> | null;
}

function namespaceFilter(name: string): string {
  return encodeURIComponent(JSON.stringify({ label: [`${STACK_NAMESPACE_LABEL}=${name}`] }));
}

/** Objects of one collection belonging to a stack, as `{ id, name }` pairs. */
async function readStackMembers(path: string, name: string): Promise<{ id: string; name: string }[]> {
  const response = await getEngineClient().request(`${path}?filters=${namespaceFilter(name)}`);
  const raw = JSON.parse(response.body) as RawLabelled[];
  return raw.map((entry) => {
    const id = entry.ID ?? entry.Id ?? "";
    return { id, name: entry.Spec?.Name ?? entry.Name ?? id };
  });
}

/** How many objects of a collection carry each stack namespace. */
async function countByNamespace(path: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    const response = await getEngineClient().request(path);
    const raw = JSON.parse(response.body) as RawLabelled[];
    for (const entry of raw) {
      const namespace = (entry.Spec?.Labels ?? entry.Labels ?? {})[STACK_NAMESPACE_LABEL];
      if (!namespace) continue;
      counts.set(namespace, (counts.get(namespace) ?? 0) + 1);
    }
  } catch {
    // A collection that cannot be read leaves its count at zero; the stack and
    // its services still list.
  }
  return counts;
}

export function listStacks(): Promise<SwarmListing<SwarmStack>> {
  return managerScoped(async () => {
    const [services, secretCounts, configCounts, networkCounts] = await Promise.all([
      listServices(),
      countByNamespace("/secrets"),
      countByNamespace("/configs"),
      countByNamespace("/networks"),
    ]);
    const stacks = new Map<string, SwarmStack>();
    const ensure = (name: string): SwarmStack => {
      const existing = stacks.get(name);
      if (existing) return existing;
      const created: SwarmStack = {
        name,
        serviceCount: 0,
        services: [],
        secretCount: secretCounts.get(name) ?? 0,
        configCount: configCounts.get(name) ?? 0,
        networkCount: networkCounts.get(name) ?? 0,
      };
      stacks.set(name, created);
      return created;
    };
    for (const service of services.items) {
      if (!service.stack) continue;
      const stack = ensure(service.stack);
      stack.services.push({
        id: service.id,
        name: service.name,
        image: service.image,
        mode: service.mode,
        replicasRunning: service.replicasRunning,
        replicasDesired: service.replicasDesired,
      });
      stack.serviceCount += 1;
    }
    // A stack whose services are all gone but whose secrets, configs or
    // networks remain is still a stack, and still removable.
    for (const namespace of [...secretCounts.keys(), ...configCounts.keys(), ...networkCounts.keys()]) ensure(namespace);
    // A stack has no identifier but its name, so the last comparison is that
    // same name compared exactly; a service inside one carries its own id.
    return [...stacks.values()]
      .map((stack) => ({ ...stack, services: stack.services.sort(byNameThenIdentity({ name: (service) => service.name, identity: (service) => service.id })) }))
      .sort(byNameThenIdentity({ name: (stack) => stack.name, identity: (stack) => stack.name }));
  });
}

/**
 * Removes every object of a stack, in the order the CLI uses — services first,
 * then secrets, configs and networks — so nothing is removed while a running
 * task still depends on it.
 */
export async function removeStack(name: string): Promise<StackRemovalResult> {
  const stackName = name.trim();
  if (stackName === "") throw new DockerDaemonError("DaemonRejected", "A stack name is required.", undefined, 400);
  await requireManager();
  const result: StackRemovalResult = { removedServices: [], removedSecrets: [], removedConfigs: [], removedNetworks: [] };
  const collections: { path: string; removed: string[] }[] = [
    { path: "/services", removed: result.removedServices },
    { path: "/secrets", removed: result.removedSecrets },
    { path: "/configs", removed: result.removedConfigs },
    { path: "/networks", removed: result.removedNetworks },
  ];
  for (const collection of collections) {
    const members = await readStackMembers(collection.path, stackName);
    for (const member of members) {
      await getEngineClient().request(`${collection.path}/${encodeURIComponent(member.id)}`, { method: "DELETE" });
      collection.removed.push(member.name);
    }
  }
  return result;
}
