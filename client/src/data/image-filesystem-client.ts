// Typed client for the filesystem extraction/tree-read endpoints (REQ-52–56, REQ-113).
export type FilesystemEntryKind = 'file' | 'directory' | 'symlink';

export interface FilesystemEntry {
  path: string;
  name: string;
  kind: FilesystemEntryKind;
  sizeBytes?: number;
}

export interface FilesystemExtractionResult {
  imageId: string;
  entryCount: number;
  fromCache: boolean;
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

/** Builds the filesystem extraction progress-stream URL; consumed with `useImageFilesystemExtraction`. `force` bypasses the cache and re-extracts. */
export function imageFilesystemStreamUrl(id: string, force?: boolean): string {
  const query = force ? '?force=true' : '';
  return `/api/images/${encodeURIComponent(id)}/filesystem/stream${query}`;
}

/** Direct children of `path` (root when omitted) in a previously extracted filesystem (REQ-52); throws when this image has no cached extraction yet. */
export async function fetchImageFilesystemChildren(id: string, path?: string): Promise<FilesystemEntry[]> {
  const query = path ? `?path=${encodeURIComponent(path)}` : '';
  const response = await fetch(`/api/images/${encodeURIComponent(id)}/filesystem/entries${query}`);
  await requireOk(response);
  const body = (await response.json()) as { entries: FilesystemEntry[] };
  return body.entries;
}
