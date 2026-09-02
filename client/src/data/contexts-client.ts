// Typed client for the server's Docker context and daemon-information
// endpoints (REQ-92, REQ-93, REQ-94).
export type ContextEndpointKind = 'local' | 'ssh' | 'tcp';

/** The endpoint kinds this application creates; a TCP+TLS context is created from the console. */
export type CreatableContextKind = 'local' | 'ssh';

export interface ContextSummary {
  name: string;
  description?: string;
  endpoint: string;
  kind: ContextEndpointKind;
  tls: boolean;
  active: boolean;
  error?: string;
}

export interface CreateContextInput {
  name: string;
  kind: CreatableContextKind;
  /** SSH destination (`user@host`); the local kind needs none. */
  host?: string;
  description?: string;
}

export interface DaemonContainerCounts {
  total: number;
  running: number;
  paused: number;
  stopped: number;
}

export interface DaemonInfo {
  version: string;
  apiVersion: string;
  minApiVersion?: string;
  buildkitVersion?: string;
  storageDriver: string;
  cgroupDriver: string;
  cgroupVersion?: string;
  operatingSystem: string;
  osType: string;
  kernelVersion: string;
  architecture: string;
  rootDirectory: string;
  containers: DaemonContainerCounts;
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

export async function createContext(input: CreateContextInput): Promise<ContextSummary> {
  const response = await fetch('/api/contexts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await requireOk(response);
  return (await response.json()) as ContextSummary;
}

/** Makes `name` the active context. Named to avoid the `use*` naming lint treats as a React Hook. */
export async function activateContext(name: string): Promise<ContextSummary> {
  const response = await fetch(`/api/contexts/${encodeURIComponent(name)}/use`, { method: 'POST' });
  await requireOk(response);
  return (await response.json()) as ContextSummary;
}

export async function removeContext(name: string): Promise<void> {
  const response = await fetch(`/api/contexts/${encodeURIComponent(name)}`, { method: 'DELETE' });
  await requireOk(response);
}

export async function fetchDaemonInfo(): Promise<DaemonInfo> {
  const response = await fetch('/api/contexts/daemon-info');
  await requireOk(response);
  return (await response.json()) as DaemonInfo;
}
