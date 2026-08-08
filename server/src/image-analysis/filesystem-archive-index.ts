// Random-access index over an already-extracted image's cached raw tarball
// (REQ-59, REQ-61): maps a validated, tree-relative path to its byte offset
// and size, reusing the same containment resolution `FilesystemExtractionService`
// applied when it first built the entry list, so a lookup can never resolve
// to something INT-7 would have refused.
import { resolveEntryPath } from "./filesystem-containment.js";
import { indexTarFile, type TarEntryLocation } from "./tar-reader.js";

/** Builds a `path -> byte location` index of `archivePath`'s entries, keyed by the same normalized, contained path used elsewhere (REQ-62). */
export async function buildContainedArchiveIndex(archivePath: string): Promise<Map<string, TarEntryLocation>> {
  const raw = await indexTarFile(archivePath);
  const index = new Map<string, TarEntryLocation>();
  for (const [rawName, location] of raw) {
    const resolved = resolveEntryPath(rawName);
    if ("path" in resolved && resolved.path) index.set(resolved.path, location);
  }
  return index;
}
