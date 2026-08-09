// Typed client for the server's plugin endpoints: both inventories, the
// privileges a reference asks for, and the management of daemon plugins
// (REQ-98, REQ-99, REQ-111).

export interface PluginListing<T> {
  items: T[];
  /** Why there is nothing to list, in the installation's or the daemon's own words. */
  unavailableReason?: string;
}

export type CliPluginAvailability = 'enabled' | 'available' | 'unavailable';

export interface CliPlugin {
  name: string;
  command: string;
  version?: string;
  vendor?: string;
  description?: string;
  path?: string;
  availability: CliPluginAvailability;
  unavailableReason?: string;
}

export interface DaemonPlugin {
  id: string;
  name: string;
  reference?: string;
  enabled: boolean;
  interfaceTypes: string[];
  /** The interfaces said in words: "log driver", "volume driver", … */
  type: string;
  description?: string;
}

export interface PluginInspect extends DaemonPlugin {
  documentation?: string;
  mounts: string[];
  devices: string[];
  capabilities: string[];
  env: string[];
  raw: unknown;
}

export interface PluginPrivilege {
  name: string;
  description?: string;
  values: string[];
}

export interface PluginsReading {
  cli: PluginListing<CliPlugin>;
  daemon: PluginListing<DaemonPlugin>;
}

export interface InstallPluginInput {
  remote: string;
  alias?: string;
  /** Exactly the privileges the server reported for `remote`, once the human has granted them. */
  grantedPrivileges: PluginPrivilege[];
  enable?: boolean;
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // no JSON body; fall through to the generic message
  }
  return `Request failed with HTTP ${response.status}`;
}

async function requireOk(response: Response): Promise<void> {
  if (!response.ok) throw new Error(await extractErrorMessage(response));
}

async function readJson<T>(response: Response): Promise<T> {
  await requireOk(response);
  return (await response.json()) as T;
}

function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export async function fetchPlugins(): Promise<PluginsReading> {
  return readJson<PluginsReading>(await fetch('/api/plugins'));
}

export async function fetchPluginPrivileges(remote: string): Promise<PluginPrivilege[]> {
  return readJson<PluginPrivilege[]>(await fetch(`/api/plugins/privileges?remote=${encodeURIComponent(remote)}`));
}

export async function fetchPluginInspect(name: string): Promise<PluginInspect> {
  return readJson<PluginInspect>(await fetch(`/api/plugins/inspect?name=${encodeURIComponent(name)}`));
}

export async function installPlugin(input: InstallPluginInput): Promise<DaemonPlugin> {
  return readJson<DaemonPlugin>(await post('/api/plugins/install', input));
}

export async function enablePlugin(name: string): Promise<DaemonPlugin> {
  return readJson<DaemonPlugin>(await post('/api/plugins/enable', { name }));
}

export async function disablePlugin(name: string): Promise<DaemonPlugin> {
  return readJson<DaemonPlugin>(await post('/api/plugins/disable', { name }));
}

export async function removePlugin(name: string): Promise<void> {
  await requireOk(await fetch(`/api/plugins?name=${encodeURIComponent(name)}`, { method: 'DELETE' }));
}
