// Path/name search across an already-extracted image filesystem (REQ-60):
// a case-insensitive substring match over the same validated entry list
// FilesystemExtractionService indexed, bounded in result count so a huge
// image never returns an unbounded payload.
import { getExtractedFilesystem, parentOf, type FilesystemEntryKind } from "./filesystem-extraction-service.js";

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

/** Bounds the result list (REQ-60): enough to be useful, small enough to render and to scroll through without paging. */
export const MAX_SEARCH_RESULTS = 200;

/**
 * Matches of `query` as a name/path fragment (REQ-60). `undefined` when the
 * image has no cached extraction yet. An empty or whitespace-only `query`
 * matches nothing.
 */
export async function searchFilesystemEntries(imageId: string, query: string): Promise<FilesystemSearchResult | undefined> {
  const filesystem = await getExtractedFilesystem(imageId);
  if (!filesystem) return undefined;

  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return { query, matches: [], totalMatches: 0, truncated: false };

  const allMatches = filesystem.entries.filter((entry) => entry.path.toLowerCase().includes(trimmed));
  const matches = allMatches.slice(0, MAX_SEARCH_RESULTS).map((entry) => ({
    path: entry.path,
    name: entry.name,
    kind: entry.kind,
    parentPath: parentOf(entry.path),
  }));

  return { query, matches, totalMatches: allMatches.length, truncated: allMatches.length > matches.length };
}
