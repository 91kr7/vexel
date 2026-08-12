// Swarm service inventory, creation, update, inspection with tasks and
// removal (REQ-82). Readings degrade to a stated reason off a manager; every
// update sends the service's whole current spec back, since the daemon
// replaces it rather than merging it.
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { DockerDaemonError } from "../docker/errors.js";
import { byNameThenIdentity } from "../list-order/list-order.js";
import { managerScoped, requireManager, type SwarmListing } from "./swarm-state-service.js";

export const STACK_NAMESPACE_LABEL = "com.docker.stack.namespace";

export type SwarmServiceMode = "replicated" | "global";

export interface SwarmServicePort {
  published?: number;
  target: number;
  protocol: string;
  mode?: string;
}

export interface SwarmService {
  id: string;
  name: string;
  image: string;
  mode: SwarmServiceMode;
  replicasRunning?: number;
  replicasDesired?: number;
  ports: SwarmServicePort[];
  stack?: string;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SwarmTask {
  id: string;
  slot?: number;
  nodeId?: string;
  nodeHostname?: string;
  state: string;
  desiredState: string;
  message?: string;
  error?: string;
  timestamp?: string;
}

export interface SwarmServiceDetail {
  service: SwarmService;
  env: string[];
  labels: Record<string, string>;
  tasks: SwarmTask[];
  raw: unknown;
}

export interface CreateSwarmServiceInput {
  name: string;
  image: string;
  mode: SwarmServiceMode;
  replicas?: number;
  /** `KEY=value` strings, the daemon's own shape, so a value containing `=` survives. */
  env?: string[];
  ports?: SwarmServicePort[];
  /** Service labels; what lets a caller mark the service as its own and find it again later. */
  labels?: Record<string, string>;
}

export interface UpdateSwarmServiceInput {
  image?: string;
  replicas?: number;
  env?: string[];
  ports?: SwarmServicePort[];
}

interface RawPort {
  Protocol?: string;
  TargetPort?: number;
  PublishedPort?: number;
  PublishMode?: string;
}

interface RawServiceSpec {
  Name?: string;
  Labels?: Record<string, string> | null;
  TaskTemplate?: { ContainerSpec?: { Image?: string; Env?: string[] | null } } & Record<string, unknown>;
  Mode?: { Replicated?: { Replicas?: number }; Global?: Record<string, never> };
  EndpointSpec?: { Ports?: RawPort[] | null; Mode?: string };
}

interface RawService {
  ID: string;
  Version?: { Index?: number };
  CreatedAt?: string;
  UpdatedAt?: string;
  Spec?: RawServiceSpec;
  Endpoint?: { Ports?: RawPort[] | null };
  ServiceStatus?: { RunningTasks?: number; DesiredTasks?: number };
}

interface RawTask {
  ID: string;
  Slot?: number;
  NodeID?: string;
  Status?: { State?: string; Message?: string; Err?: string; Timestamp?: string };
  DesiredState?: string;
}

/** The daemon pins every deployed service's image to a digest; the operator recognises the reference. */
function displayImage(image: string | undefined): string {
  if (!image) return "";
  const digestIndex = image.indexOf("@sha256:");
  return digestIndex === -1 ? image : image.slice(0, digestIndex);
}

function toPorts(raw: RawPort[] | null | undefined): SwarmServicePort[] {
  return (raw ?? [])
    .filter((port) => typeof port.PublishedPort === "number")
    .map((port) => ({
      published: port.PublishedPort,
      target: port.TargetPort ?? 0,
      protocol: port.Protocol ?? "tcp",
      mode: port.PublishMode,
    }));
}

function toService(raw: RawService): SwarmService {
  const mode: SwarmServiceMode = raw.Spec?.Mode?.Global ? "global" : "replicated";
  const configuredReplicas = raw.Spec?.Mode?.Replicated?.Replicas;
  const desired = raw.ServiceStatus?.DesiredTasks ?? configuredReplicas;
  const labels = raw.Spec?.Labels ?? {};
  return {
    id: raw.ID,
    name: raw.Spec?.Name ?? raw.ID,
    image: displayImage(raw.Spec?.TaskTemplate?.ContainerSpec?.Image),
    mode,
    replicasRunning: raw.ServiceStatus?.RunningTasks,
    replicasDesired: desired,
    // The endpoint carries what is actually published; the spec only what was asked for.
    ports: toPorts(raw.Endpoint?.Ports ?? raw.Spec?.EndpointSpec?.Ports),
    stack: labels[STACK_NAMESPACE_LABEL],
    version: raw.Version?.Index ?? 0,
    createdAt: raw.CreatedAt,
    updatedAt: raw.UpdatedAt,
  };
}

async function readServices(): Promise<RawService[]> {
  const response = await getEngineClient().request("/services?status=true");
  return JSON.parse(response.body) as RawService[];
}

async function readService(id: string): Promise<RawService> {
  const response = await getEngineClient().request(`/services/${encodeURIComponent(id)}`);
  return JSON.parse(response.body) as RawService;
}

export function listServices(): Promise<SwarmListing<SwarmService>> {
  return managerScoped(async () => {
    const raw = await readServices();
    return raw.map(toService).sort(byNameThenIdentity({ name: (service) => service.name, identity: (service) => service.id }));
  });
}

async function readNodeHostnames(): Promise<Map<string, string>> {
  try {
    const response = await getEngineClient().request("/nodes");
    const raw = JSON.parse(response.body) as { ID: string; Description?: { Hostname?: string } }[];
    return new Map(raw.map((node) => [node.ID, node.Description?.Hostname ?? node.ID]));
  } catch {
    // A task still reads without a hostname; the id stands in for it.
    return new Map();
  }
}

export async function getServiceDetail(id: string): Promise<SwarmServiceDetail> {
  await requireManager();
  const raw = await readService(id);
  const filters = encodeURIComponent(JSON.stringify({ service: [raw.Spec?.Name ?? id] }));
  const [tasksResponse, hostnames] = await Promise.all([getEngineClient().request(`/tasks?filters=${filters}`), readNodeHostnames()]);
  const rawTasks = JSON.parse(tasksResponse.body) as RawTask[];
  const tasks: SwarmTask[] = rawTasks
    .map((task) => ({
      id: task.ID,
      slot: task.Slot,
      nodeId: task.NodeID && task.NodeID !== "" ? task.NodeID : undefined,
      nodeHostname: task.NodeID ? hostnames.get(task.NodeID) : undefined,
      state: task.Status?.State ?? "unknown",
      desiredState: task.DesiredState ?? "unknown",
      message: task.Status?.Message,
      error: task.Status?.Err,
      timestamp: task.Status?.Timestamp,
    }))
    .sort((left, right) => (right.timestamp ?? "").localeCompare(left.timestamp ?? ""));
  return {
    service: toService(raw),
    env: raw.Spec?.TaskTemplate?.ContainerSpec?.Env ?? [],
    labels: raw.Spec?.Labels ?? {},
    tasks,
    raw,
  };
}

function toRawPorts(ports: SwarmServicePort[]): RawPort[] {
  return ports.map((port) => ({
    Protocol: port.protocol || "tcp",
    TargetPort: port.target,
    PublishedPort: port.published,
    PublishMode: port.mode,
  }));
}

export async function createService(input: CreateSwarmServiceInput): Promise<SwarmService> {
  await requireManager();
  const name = input.name.trim();
  const image = input.image.trim();
  if (name === "") throw new DockerDaemonError("DaemonRejected", "A service name is required.", undefined, 400);
  if (image === "") throw new DockerDaemonError("DaemonRejected", "An image is required.", undefined, 400);
  const ports = input.ports ?? [];
  const body = JSON.stringify({
    Name: name,
    Labels: input.labels && Object.keys(input.labels).length > 0 ? input.labels : undefined,
    TaskTemplate: { ContainerSpec: { Image: image, Env: input.env && input.env.length > 0 ? input.env : undefined } },
    Mode: input.mode === "global" ? { Global: {} } : { Replicated: { Replicas: input.replicas ?? 1 } },
    EndpointSpec: ports.length > 0 ? { Ports: toRawPorts(ports) } : undefined,
  });
  const response = await getEngineClient().request("/services/create", { method: "POST", body });
  const created = JSON.parse(response.body) as { ID?: string };
  return toService(await readService(created.ID ?? name));
}

/**
 * Updates a service. The daemon replaces the spec wholesale, so the current
 * one is re-read and only the requested fields are changed on it — mounts,
 * networks, secrets, restart policy and the rest are preserved — and the update
 * is applied at the version the service carries right now.
 */
export async function updateService(id: string, input: UpdateSwarmServiceInput): Promise<SwarmService> {
  await requireManager();
  const current = await readService(id);
  const spec = JSON.parse(JSON.stringify(current.Spec ?? {})) as RawServiceSpec;
  if (input.image !== undefined && input.image.trim() !== "") {
    spec.TaskTemplate = { ...(spec.TaskTemplate ?? {}), ContainerSpec: { ...(spec.TaskTemplate?.ContainerSpec ?? {}), Image: input.image.trim() } };
  }
  if (input.env !== undefined) {
    spec.TaskTemplate = { ...(spec.TaskTemplate ?? {}), ContainerSpec: { ...(spec.TaskTemplate?.ContainerSpec ?? {}), Env: input.env } };
  }
  if (input.replicas !== undefined) {
    if (spec.Mode?.Global) {
      throw new DockerDaemonError("DaemonRejected", "ReplicasNotApplicable: a global service runs one task per node and has no replica count.", undefined, 409);
    }
    spec.Mode = { Replicated: { Replicas: input.replicas } };
  }
  if (input.ports !== undefined) {
    spec.EndpointSpec = { ...(spec.EndpointSpec ?? {}), Ports: toRawPorts(input.ports) };
  }
  await getEngineClient().request(`/services/${encodeURIComponent(id)}/update?version=${current.Version?.Index ?? 0}`, {
    method: "POST",
    body: JSON.stringify(spec),
  });
  return toService(await readService(id));
}

export async function removeService(id: string): Promise<void> {
  await requireManager();
  await getEngineClient().request(`/services/${encodeURIComponent(id)}`, { method: "DELETE" });
}
