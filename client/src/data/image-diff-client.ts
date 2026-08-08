// Typed client for the cross-image filesystem diff endpoints (REQ-63, REQ-64).
export type ImageDiffStatus = 'added' | 'removed' | 'changed';
export type ImageDiffNature = 'content' | 'size' | 'mode' | 'ownership' | 'symlink-target';
export type ImageDiffEntryKind = 'file' | 'directory' | 'symlink';

export interface ImageDiffSideMetadata {
  sizeBytes?: number;
  mode?: number;
  uid?: number;
  gid?: number;
  linkTarget?: string;
}

export interface ImageDiffEntry {
  path: string;
  name: string;
  kind: ImageDiffEntryKind;
  status?: ImageDiffStatus;
  natures?: ImageDiffNature[];
  a?: ImageDiffSideMetadata;
  b?: ImageDiffSideMetadata;
  rollup?: { added: number; removed: number; changed: number };
}

export interface ImageFilesystemDiff {
  imageIdA: string;
  imageIdB: string;
  entries: ImageDiffEntry[];
  addedCount: number;
  removedCount: number;
  changedCount: number;
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

/** Builds the diff comparison progress-stream URL; consumed with `useImageDiffStream`. */
export function imageDiffStreamUrl(imageIdA: string, imageIdB: string): string {
  return `/api/images/diff/stream?a=${encodeURIComponent(imageIdA)}&b=${encodeURIComponent(imageIdB)}`;
}

/** Direct children of `path` (root when omitted) in the last compared diff tree for this pair (REQ-63); throws (including on a `404`, meaning the pair has not been compared yet) rather than returning an empty list. */
export async function fetchImageDiffChildren(imageIdA: string, imageIdB: string, path?: string): Promise<ImageDiffEntry[]> {
  const query = new URLSearchParams({ a: imageIdA, b: imageIdB });
  if (path) query.set('path', path);
  const response = await fetch(`/api/images/diff/entries?${query.toString()}`);
  await requireOk(response);
  const body = (await response.json()) as { entries: ImageDiffEntry[] };
  return body.entries;
}
