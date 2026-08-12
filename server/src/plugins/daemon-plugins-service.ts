// Daemon (managed) plugin inventory over the Engine API (REQ-99): the plugins
// the daemon itself runs — log, volume, network and other drivers — with the
// interface each implements and whether it is enabled.
//
// A daemon that does not expose managed plugins at all (the endpoint is not
// there) is a stated reason, not a failure: the screen says so rather than
// showing an empty list that would read as "none installed".
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { DockerDaemonError } from "../docker/errors.js";
import { byNameThenIdentity } from "../list-order/list-order.js";
import type { PluginListing } from "./cli-plugins-service.js";

export interface DaemonPlugin {
  id: string;
  /** The name the daemon addresses it by, e.g. `grafana/loki-docker-driver:latest`. */
  name: string;
  /** The reference it was installed from, when the daemon records one. */
  reference?: string;
  enabled: boolean;
  /** The interface types it implements, verbatim (`docker.volumedriver/1.0`). */
  interfaceTypes: string[];
  /** Those interfaces said in words: "volume driver", "log driver", …; "plugin" when none is reported. */
  type: string;
  description?: string;
}

export interface PluginInspect extends DaemonPlugin {
  documentation?: string;
  /** The host paths, devices and capabilities the plugin runs with, as the daemon reports them. */
  mounts: string[];
  devices: string[];
  capabilities: string[];
  env: string[];
  /** The daemon's own inspect document, untouched. */
  raw: unknown;
}

interface RawPlugin {
  Id?: string;
  Name?: string;
  Enabled?: boolean;
  PluginReference?: string;
  Config?: {
    Description?: string;
    Documentation?: string;
    Interface?: { Types?: string[] };
    Linux?: { Capabilities?: string[] | null; Devices?: { Path?: string; Name?: string }[] | null };
    Mounts?: { Source?: string | null; Destination?: string }[] | null;
    Env?: { Name?: string; Value?: string | null }[] | null;
  };
}

/** The interfaces the Engine defines, said the way the operator reads them on the screen. */
const INTERFACE_LABELS: Record<string, string> = {
  "docker.volumedriver": "volume driver",
  "docker.networkdriver": "network driver",
  "docker.ipamdriver": "IPAM driver",
  "docker.logdriver": "log driver",
  "docker.authz": "authorization",
  "docker.secretprovider": "secret provider",
  "docker.metricscollector": "metrics collector",
};

export async function listDaemonPlugins(): Promise<PluginListing<DaemonPlugin>> {
  try {
    const response = await getEngineClient().request("/plugins");
    const raw = JSON.parse(response.body) as RawPlugin[] | null;
    if (!Array.isArray(raw)) return { items: [], unavailableReason: "This daemon did not answer with a plugin list." };
    return { items: raw.map(toDaemonPlugin).sort(byNameThenIdentity({ name: (plugin) => plugin.name, identity: (plugin) => plugin.id })) };
  } catch (error) {
    if (isNotExposed(error)) {
      return { items: [], unavailableReason: `This daemon does not expose managed plugins: ${error.message}` };
    }
    throw error;
  }
}

/** One plugin's summary, the shape every state change answers with. */
export async function getDaemonPlugin(name: string): Promise<DaemonPlugin> {
  return toDaemonPlugin(await readPlugin(name));
}

export async function inspectPlugin(name: string): Promise<PluginInspect> {
  const raw = await readPlugin(name);
  const config = raw.Config ?? {};
  return {
    ...toDaemonPlugin(raw),
    documentation: nonEmpty(config.Documentation),
    mounts: (config.Mounts ?? []).map((mount) => `${mount.Source ?? ""} → ${mount.Destination ?? ""}`),
    devices: (config.Linux?.Devices ?? []).map((device) => device.Path ?? device.Name ?? ""),
    capabilities: config.Linux?.Capabilities ?? [],
    env: (config.Env ?? []).map((entry) => (entry.Value ? `${entry.Name}=${entry.Value}` : (entry.Name ?? ""))),
    raw,
  };
}

async function readPlugin(name: string): Promise<RawPlugin> {
  const response = await getEngineClient().request(`/plugins/${pluginPathSegment(name)}/json`);
  return JSON.parse(response.body) as RawPlugin;
}

function toDaemonPlugin(raw: RawPlugin): DaemonPlugin {
  const interfaceTypes = raw.Config?.Interface?.Types ?? [];
  return {
    id: raw.Id ?? raw.Name ?? "",
    name: raw.Name ?? "",
    reference: nonEmpty(raw.PluginReference),
    enabled: raw.Enabled === true,
    interfaceTypes,
    type: typeLabel(interfaceTypes),
    description: nonEmpty(raw.Config?.Description),
  };
}

/**
 * A plugin name: a registry host that may carry a port, a repository path, and
 * a tag — `grafana/loki:latest`, `localhost:5000/driver:v1`. The first
 * component's `:port` is only a port when path components follow it; on its
 * own, a trailing `:…` is the tag.
 */
const PLUGIN_NAME =
  /^(?:[A-Za-z0-9][A-Za-z0-9._-]*(?::\d+)?(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)+(?::[A-Za-z0-9._-]+)?|[A-Za-z0-9][A-Za-z0-9._-]*(?::[A-Za-z0-9._-]+)?)$/;

/**
 * The name is handed to the daemon as it is — slashes, port and tag included —
 * exactly as the Docker CLI does. Everything outside that alphabet is refused
 * rather than encoded, so a name can never walk out of the `/plugins` route.
 */
export function pluginPathSegment(name: string): string {
  if (!PLUGIN_NAME.test(name)) {
    throw new DockerDaemonError("DaemonRejected", `"${name}" is not a plugin name.`, undefined, 400);
  }
  return name;
}

function typeLabel(types: string[]): string {
  const labels = types
    .map((type) => type.split("/")[0])
    .filter((type) => type !== "")
    .map((type) => INTERFACE_LABELS[type] ?? type);
  return labels.length === 0 ? "plugin" : [...new Set(labels)].join(", ");
}

/** The daemon has no plugin API at all (an old or non-Linux daemon), as opposed to having refused this call. */
function isNotExposed(error: unknown): error is DockerDaemonError {
  return error instanceof DockerDaemonError && (error.statusCode === 404 || error.statusCode === 501);
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== "" ? value : undefined;
}
