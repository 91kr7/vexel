// Typed client for the layer stack, changeset-analysis and layer-to-build-cache
// traceability endpoints (REQ-47–51, REQ-68).
import type { BuildCacheRecord } from './builders-client';

export interface LayerSharingImage {
  id: string;
  tags: string[];
}

export interface LayerMetadata {
  index: number;
  diffId?: string;
  diffIdUnavailableReason?: string;
  uncompressedSizeBytes: number;
  compressedSizeBytes?: number;
  compressedSizeUnavailableReason?: string;
  emptyLayer: boolean;
  instruction: string;
  command?: string;
  commandUnavailableReason?: string;
  sharedWith: LayerSharingImage[];
}

export interface ImageLayerStack {
  imageId: string;
  layers: LayerMetadata[];
}

export interface LayerChangesetPath {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  sizeBytes?: number;
  sizeUnavailableReason?: string;
}

export interface LayerChangeset {
  layerIndex: number;
  diffId?: string;
  paths: LayerChangesetPath[];
}

export interface ImageChangesets {
  imageId: string;
  layers: LayerChangeset[];
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

export async function fetchImageLayerStack(id: string): Promise<ImageLayerStack> {
  const response = await fetch(`/api/images/${encodeURIComponent(id)}/layers`);
  await requireOk(response);
  return (await response.json()) as ImageLayerStack;
}

/** Builds the changeset analysis progress-stream URL; consumed with `useImageChangesetStream`. */
export function imageChangesetsStreamUrl(id: string): string {
  return `/api/images/${encodeURIComponent(id)}/changesets/stream`;
}

export type LayerBuildCacheUnavailableReason =
  | 'MetadataOnlyStep'
  | 'NoRecordedCommand'
  | 'BuildCacheUnreadable'
  | 'BuildCacheEmpty'
  | 'NoMatchingCacheRecord';

export interface LayerBuildCacheLink {
  layerIndex: number;
  diffId?: string;
  instruction: string;
  command?: string;
  /** The record that produced this layer; present exactly when the association exists. */
  cacheRecord?: BuildCacheRecord;
  unavailableReason?: LayerBuildCacheUnavailableReason;
  /** Sentence stating why the association is unavailable; present exactly when `unavailableReason` is. */
  unavailableDetail?: string;
}

export interface ImageBuildCacheTrace {
  imageId: string;
  layers: LayerBuildCacheLink[];
}

export async function fetchImageBuildCacheTrace(id: string, signal?: AbortSignal): Promise<ImageBuildCacheTrace> {
  const response = await fetch(`/api/images/${encodeURIComponent(id)}/layers/build-cache`, { signal });
  await requireOk(response);
  return (await response.json()) as ImageBuildCacheTrace;
}
