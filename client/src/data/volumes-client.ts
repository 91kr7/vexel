// Typed client for the server's volume listing, inspect, create, remove and
// prune endpoints (REQ-70, REQ-71).
export interface VolumeSummary {
  name: string;
  driver: string;
  mountpoint: string;
  scope: string;
  createdAt: string;
  labels: Record<string, string>;
  options: Record<string, string>;
  sizeBytes?: number;
  mountedBy: string[];
}

export interface VolumeInspect extends VolumeSummary {
  raw: unknown;
}

export interface CreateVolumeInput {
  name?: string;
  driver?: string;
  driverOpts?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface VolumePruneResult {
  removedNames: string[];
  reclaimedBytes: number;
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

export async function fetchVolumes(): Promise<VolumeSummary[]> {
  const response = await fetch('/api/volumes');
  await requireOk(response);
  return (await response.json()) as VolumeSummary[];
}

export async function fetchVolumeInspect(name: string): Promise<VolumeInspect> {
  const response = await fetch(`/api/volumes/${encodeURIComponent(name)}/inspect`);
  await requireOk(response);
  return (await response.json()) as VolumeInspect;
}

export async function createVolume(input: CreateVolumeInput): Promise<VolumeSummary> {
  const response = await fetch('/api/volumes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await requireOk(response);
  return (await response.json()) as VolumeSummary;
}

export async function removeVolume(name: string): Promise<void> {
  const response = await fetch(`/api/volumes/${encodeURIComponent(name)}`, { method: 'DELETE' });
  await requireOk(response);
}

export async function pruneVolumes(): Promise<VolumePruneResult> {
  const response = await fetch('/api/volumes/prune', { method: 'POST' });
  await requireOk(response);
  return (await response.json()) as VolumePruneResult;
}
