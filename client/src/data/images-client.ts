// Typed client for the server's image listing, inspect and registry-facing
// endpoints (REQ-37, REQ-38, REQ-39, REQ-40).
export interface ImageSummary {
  id: string;
  shortId: string;
  tags: string[];
  digest?: string;
  platforms: string[];
  sizeBytes: number;
  createdAt: string;
}

export interface ImageHistoryEntry {
  createdAt: string;
  createdBy: string;
  sizeBytes: number;
  comment?: string;
  emptyLayer: boolean;
}

export interface ImageInspect {
  id: string;
  tags: string[];
  digest?: string;
  platforms: string[];
  sizeBytes: number;
  createdAt: string;
  entrypoint: string[];
  command: string[];
  env: string[];
  labels: Record<string, string>;
  exposedPorts: string[];
  history: ImageHistoryEntry[];
  raw: unknown;
}

export interface PruneResult {
  removedCount: number;
  reclaimedBytes: number;
}

export interface ImageSaveLoadResult {
  references: string[];
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

export async function fetchImageInspect(id: string): Promise<ImageInspect> {
  const response = await fetch(`/api/images/${encodeURIComponent(id)}/inspect`);
  await requireOk(response);
  return (await response.json()) as ImageInspect;
}

/** Builds the pull progress stream URL; consumed with `useImageTransferStream`. */
export function imagePullStreamUrl(reference: string, platform?: string): string {
  const params = new URLSearchParams({ reference });
  if (platform && platform.trim() !== '') params.set('platform', platform.trim());
  return `/api/images/pull/stream?${params.toString()}`;
}

/** Builds the push progress stream URL for `id`, pushing `reference` (defaults to `id`'s own reference server-side). */
export function imagePushStreamUrl(id: string, reference?: string): string {
  const params = new URLSearchParams();
  if (reference) params.set('reference', reference);
  const query = params.toString();
  return `/api/images/${encodeURIComponent(id)}/push/stream${query ? `?${query}` : ''}`;
}

/** Builds the browser-download URL for saving one or several images (REQ-42); triggered with `triggerDownload`. */
export function saveImagesUrl(references: string[], filename?: string): string {
  const params = new URLSearchParams();
  for (const reference of references) params.append('references', reference);
  if (filename) params.set('filename', filename);
  return `/api/images/save?${params.toString()}`;
}

/** The upload URL for loading images from a local tarball (REQ-42); consumed with `useFileUpload`. */
export const IMAGE_LOAD_URL = '/api/images/load';

export async function tagImage(id: string, reference: string): Promise<void> {
  const response = await fetch(`/api/images/${encodeURIComponent(id)}/tag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference }),
  });
  await requireOk(response);
}

export async function untagImage(reference: string): Promise<void> {
  const response = await fetch(`/api/images/untag?${new URLSearchParams({ reference }).toString()}`, { method: 'DELETE' });
  await requireOk(response);
}

export async function removeImage(id: string): Promise<void> {
  const response = await fetch(`/api/images/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await requireOk(response);
}

export async function pruneDanglingImages(): Promise<PruneResult> {
  const response = await fetch('/api/images/prune', { method: 'POST' });
  await requireOk(response);
  return (await response.json()) as PruneResult;
}
