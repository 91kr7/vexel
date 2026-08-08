// Typed client for the filesystem extraction/tree-read endpoints (REQ-52–56,
// REQ-113) and the in-tree file operations built on them: entry metadata,
// content preview, name/path search, and single-file/subtree export as a
// browser download (REQ-58–62).
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
  refusedCount: number;
}

export interface FilesystemEntryMetadata {
  path: string;
  name: string;
  kind: FilesystemEntryKind;
  sizeBytes?: number;
  permissions?: string;
  uid?: number;
  gid?: number;
  modifiedAt?: string;
  linkTarget?: string;
}

export type FilesystemContentMode = 'text' | 'hex';

export interface FilesystemContentResult {
  path: string;
  mode: FilesystemContentMode;
  autoMode: FilesystemContentMode;
  content: string;
  totalSizeBytes: number;
  truncated: boolean;
}

export interface FilesystemSearchMatch {
  path: string;
  name: string;
  kind: FilesystemEntryKind;
  parentPath: string;
}

export interface FilesystemSearchResult {
  query: string;
  matches: FilesystemSearchMatch[];
  totalMatches: number;
  truncated: boolean;
}

export interface FilesystemContainmentRefusal {
  path: string;
  reason: string;
}

export interface SubtreeExportSummary {
  rootPath: string;
  fileCount: number;
  directoryCount: number;
  symlinkCount: number;
  totalBytes: number;
  refusals: FilesystemContainmentRefusal[];
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

/** An entry's full metadata (REQ-58); throws (including on a `404`) rather than returning `undefined`. */
export async function fetchImageFilesystemEntryMetadata(id: string, path: string): Promise<FilesystemEntryMetadata> {
  const response = await fetch(`/api/images/${encodeURIComponent(id)}/filesystem/metadata?path=${encodeURIComponent(path)}`);
  await requireOk(response);
  const body = (await response.json()) as { metadata: FilesystemEntryMetadata };
  return body.metadata;
}

/** A file's preview content (REQ-59), auto-detected unless `mode` overrides it; throws (with the refusal reason) for a directory, a symlink, or an unlocated entry. */
export async function fetchImageFilesystemEntryContent(id: string, path: string, mode?: FilesystemContentMode): Promise<FilesystemContentResult> {
  const query = new URLSearchParams({ path });
  if (mode) query.set('mode', mode);
  const response = await fetch(`/api/images/${encodeURIComponent(id)}/filesystem/content?${query.toString()}`);
  await requireOk(response);
  const body = (await response.json()) as { result: FilesystemContentResult };
  return body.result;
}

/** Name/path fragment search across the extracted tree (REQ-60), bounded and reporting whether more matches exist beyond the bound; supports an `AbortSignal` so a superseded search never overwrites a fresher one. */
export async function searchImageFilesystem(id: string, query: string, signal?: AbortSignal): Promise<FilesystemSearchResult> {
  const response = await fetch(`/api/images/${encodeURIComponent(id)}/filesystem/search?query=${encodeURIComponent(query)}`, { signal });
  await requireOk(response);
  return (await response.json()) as FilesystemSearchResult;
}

/** Preview of what downloading `path`'s subtree (root when empty) would contain, shown before the operator confirms (REQ-61). */
export async function fetchSubtreeExportSummary(id: string, path: string): Promise<SubtreeExportSummary> {
  const response = await fetch(`/api/images/${encodeURIComponent(id)}/filesystem/subtree-summary?path=${encodeURIComponent(path)}`);
  await requireOk(response);
  const body = (await response.json()) as { summary: SubtreeExportSummary };
  return body.summary;
}

/** Builds a single entry's download URL, consumed with the ui-library's `triggerDownload` (REQ-61). */
export function imageFilesystemEntryDownloadUrl(id: string, path: string): string {
  return `/api/images/${encodeURIComponent(id)}/filesystem/download?path=${encodeURIComponent(path)}`;
}

/** Builds a subtree's archive-download URL (root when `path` is empty), consumed with `triggerDownload` (REQ-61). */
export function imageFilesystemSubtreeDownloadUrl(id: string, path: string): string {
  return `/api/images/${encodeURIComponent(id)}/filesystem/subtree-download?path=${encodeURIComponent(path)}`;
}
