// Container creation from a full configuration (REQ-27, REQ-28) with image
// resolution first (REQ-29): a reference already present locally is used as-is,
// one that is missing is pulled with per-layer progress before the container is
// created. Every daemon refusal is reported with the daemon's own message.
import { DockerDaemonError } from "../docker/errors.js";
import { pullImage, type ImageTransferStep } from "../images/image-transfer-service.js";
import { getEngineClient } from "../connectivity/connection-status-service.js";
import type { PortBinding, ResourceLimits, RestartPolicy } from "./containers-service.js";

export interface MountSpec {
  type: "bind" | "volume";
  source: string;
  destination: string;
  readOnly: boolean;
}

export interface ContainerCapabilities {
  add: string[];
  drop: string[];
}

export interface ContainerCreateSpec {
  /** The image reference to run: a local image's reference, or any reference to pull. */
  image: string;
  /** Optional platform hint used only when the image has to be pulled. */
  platform?: string;
  name?: string;
  command?: string[];
  entrypoint?: string[];
  /** Environment entries in the daemon's own `KEY=value` form. */
  env?: string[];
  ports?: PortBinding[];
  mounts?: MountSpec[];
  networks?: string[];
  restartPolicy?: RestartPolicy;
  resourceLimits?: ResourceLimits;
  labels?: Record<string, string>;
  privileged?: boolean;
  capabilities?: ContainerCapabilities;
  /** `true` creates and starts the container, `false` only creates it. */
  start?: boolean;
}

export interface ContainerCreateResult {
  id: string;
  name: string;
  started: boolean;
  /** `true` when the image was missing locally and had to be pulled first. */
  imagePulled: boolean;
  /** Non-fatal notes from the daemon (e.g. platform mismatch warnings). */
  warnings: string[];
}

export interface ContainerCreateHandlers {
  onImageResolved: (pulled: boolean) => void;
  onPullStep: (step: ImageTransferStep) => void;
  onCreated: (result: ContainerCreateResult) => void;
  /** The daemon's own refusal message, verbatim. */
  onError: (message: string) => void;
}

const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

/**
 * Resolves the image, creates the container and — in create-and-start mode —
 * starts it. Terminates through exactly one of `onCreated` / `onError`.
 */
export async function createContainer(spec: ContainerCreateSpec, handlers: ContainerCreateHandlers): Promise<void> {
  try {
    const rejection = validateSpec(spec);
    if (rejection) {
      handlers.onError(rejection);
      return;
    }

    const present = await isImagePresentLocally(spec.image);
    if (!present) await pullMissingImage(spec.image, spec.platform, handlers.onPullStep);
    handlers.onImageResolved(!present);

    const result = await createAndOptionallyStart(spec, !present);
    handlers.onCreated(result);
  } catch (error) {
    handlers.onError(error instanceof DockerDaemonError ? error.message : (error as Error).message);
  }
}

function validateSpec(spec: ContainerCreateSpec): string | undefined {
  if (!spec.image || spec.image.trim() === "") return "An image reference is required";
  if (spec.name !== undefined && spec.name !== "" && !NAME_PATTERN.test(spec.name)) {
    return `Invalid container name "${spec.name}": it must start with a letter or digit and may contain only letters, digits, "_", "." and "-"`;
  }
  return undefined;
}

/** A reference the daemon already holds needs no pull; any other refusal is a real error. */
async function isImagePresentLocally(reference: string): Promise<boolean> {
  try {
    await getEngineClient().request(`/images/${encodeURIComponent(reference)}/json`);
    return true;
  } catch (error) {
    if (error instanceof DockerDaemonError && error.statusCode === 404) return false;
    throw error;
  }
}

function pullMissingImage(reference: string, platform: string | undefined, onStep: (step: ImageTransferStep) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    pullImage(reference, platform, {
      onStep,
      onError: (message) => reject(new DockerDaemonError("DaemonRejected", message)),
      onEnd: () => resolve(),
    }).catch(reject);
  });
}

async function createAndOptionallyStart(spec: ContainerCreateSpec, imagePulled: boolean): Promise<ContainerCreateResult> {
  const client = getEngineClient();
  const networks = spec.networks ?? [];
  const query = spec.name && spec.name !== "" ? `?name=${encodeURIComponent(spec.name)}` : "";

  const response = await client.request(`/containers/create${query}`, {
    method: "POST",
    body: JSON.stringify(buildCreatePayload(spec, networks[0])),
  });
  const created = JSON.parse(response.body) as { Id: string; Warnings?: string[] };

  // The Engine API accepts a single endpoint at creation time; any further
  // network is attached right after, before the container is started.
  for (const network of networks.slice(1)) {
    await client.request(`/networks/${encodeURIComponent(network)}/connect`, {
      method: "POST",
      body: JSON.stringify({ Container: created.Id }),
    });
  }

  if (spec.start) await client.request(`/containers/${created.Id}/start`, { method: "POST" });

  return {
    id: created.Id,
    name: spec.name ?? "",
    started: Boolean(spec.start),
    imagePulled,
    warnings: created.Warnings ?? [],
  };
}

function buildCreatePayload(spec: ContainerCreateSpec, firstNetwork: string | undefined): Record<string, unknown> {
  const exposedPorts: Record<string, object> = {};
  const portBindings: Record<string, { HostIp?: string; HostPort: string }[]> = {};
  for (const port of spec.ports ?? []) {
    const key = `${port.containerPort}/${port.protocol}`;
    exposedPorts[key] = {};
    if (port.hostPort !== undefined) {
      portBindings[key] = [{ HostIp: port.hostIp, HostPort: String(port.hostPort) }];
    }
  }

  const binds = (spec.mounts ?? []).map((mount) => `${mount.source}:${mount.destination}${mount.readOnly ? ":ro" : ""}`);

  const hostConfig: Record<string, unknown> = {
    Binds: binds,
    PortBindings: portBindings,
    Privileged: Boolean(spec.privileged),
  };
  if (spec.restartPolicy) {
    hostConfig.RestartPolicy = { Name: spec.restartPolicy.name, MaximumRetryCount: spec.restartPolicy.maximumRetryCount ?? 0 };
  }
  if (spec.resourceLimits?.memoryBytes !== undefined) hostConfig.Memory = spec.resourceLimits.memoryBytes;
  if (spec.resourceLimits?.cpus !== undefined) {
    hostConfig.CpuPeriod = 100000;
    hostConfig.CpuQuota = Math.round(spec.resourceLimits.cpus * 100000);
  }
  if (spec.capabilities?.add.length) hostConfig.CapAdd = spec.capabilities.add;
  if (spec.capabilities?.drop.length) hostConfig.CapDrop = spec.capabilities.drop;

  const payload: Record<string, unknown> = {
    Image: spec.image,
    Env: spec.env ?? [],
    Labels: spec.labels ?? {},
    ExposedPorts: exposedPorts,
    HostConfig: hostConfig,
  };
  if (spec.command?.length) payload.Cmd = spec.command;
  if (spec.entrypoint?.length) payload.Entrypoint = spec.entrypoint;
  if (firstNetwork) payload.NetworkingConfig = { EndpointsConfig: { [firstNetwork]: {} } };

  return payload;
}
