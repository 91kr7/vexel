// Typed client for the server's network listing, inspect, create, remove,
// prune and container attach/detach endpoints (REQ-72, REQ-73, REQ-74).
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

export async function fetchNetworks(): Promise<NetworkSummary[]> {
  const response = await fetch('/api/networks');
  await requireOk(response);
  return (await response.json()) as NetworkSummary[];
}

export async function fetchNetworkInspect(id: string): Promise<NetworkInspect> {
  const response = await fetch(`/api/networks/${encodeURIComponent(id)}/inspect`);
  await requireOk(response);
  return (await response.json()) as NetworkInspect;
}

export async function createNetwork(input: CreateNetworkInput): Promise<NetworkSummary> {
  const response = await fetch('/api/networks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await requireOk(response);
  return (await response.json()) as NetworkSummary;
}

export async function removeNetwork(id: string): Promise<void> {
  const response = await fetch(`/api/networks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await requireOk(response);
}

export async function pruneNetworks(): Promise<NetworkPruneResult> {
  const response = await fetch('/api/networks/prune', { method: 'POST' });
  await requireOk(response);
  return (await response.json()) as NetworkPruneResult;
}

export async function attachContainer(networkId: string, containerId: string): Promise<NetworkInspect> {
  const response = await fetch(`/api/networks/${encodeURIComponent(networkId)}/attach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ containerId }),
  });
  await requireOk(response);
  return (await response.json()) as NetworkInspect;
}

export async function detachContainer(networkId: string, containerId: string): Promise<NetworkInspect> {
  const response = await fetch(`/api/networks/${encodeURIComponent(networkId)}/detach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ containerId }),
  });
  await requireOk(response);
  return (await response.json()) as NetworkInspect;
}
