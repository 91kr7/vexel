// Duplicate-content detection across layers (REQ-66): identical file content
// still present at more than one path in the final merged filesystem, wasting
// the bytes of every copy past the first. Pure computation over an
// already-computed ImageChangesets (ChangesetService, batch 13), reusing the
// per-path timelines built for LayerWasteAnalysis.
import type { ImageChangesets } from "./changeset-service.js";
import { buildPathTimelines } from "./layer-waste-analysis.js";

export interface DuplicateContentPath {
  path: string;
  /** The layer that wrote this path's live content. */
  layerIndex: number;
}

export interface DuplicateContentGroup {
  contentHash: string;
  sizeBytes: number;
  paths: DuplicateContentPath[];
  /** `(paths.length - 1) * sizeBytes`: every copy past the first. */
  wastedBytes: number;
}

export interface LayerDuplicateAnalysis {
  imageId: string;
  duplicates: DuplicateContentGroup[];
  totalDuplicateWastedBytes: number;
}

/**
 * Groups every path's *final, live* content (its last timeline event, when
 * not a deletion) by content hash; a hash shared by two or more paths is
 * reported as duplicated. Superseded (non-final) occurrences are
 * LayerWasteAnalysis's concern, not this one, so they are excluded here to
 * avoid double-counting the same bytes as two different kinds of waste.
 * Zero-byte content (e.g. empty marker files) is excluded: it wastes nothing.
 */
export function analyzeDuplicateContent(changesets: ImageChangesets): LayerDuplicateAnalysis {
  const timelines = buildPathTimelines(changesets);
  const byHash = new Map<string, DuplicateContentGroup>();

  for (const [path, events] of timelines) {
    const last = events[events.length - 1];
    if (!last || last.status === "deleted" || !last.contentHash || !last.sizeBytes) continue;
    const group = byHash.get(last.contentHash) ?? { contentHash: last.contentHash, sizeBytes: last.sizeBytes, paths: [], wastedBytes: 0 };
    group.paths.push({ path, layerIndex: last.layerIndex });
    byHash.set(last.contentHash, group);
  }

  const duplicates: DuplicateContentGroup[] = [];
  let totalDuplicateWastedBytes = 0;
  for (const group of byHash.values()) {
    if (group.paths.length < 2) continue;
    group.wastedBytes = group.sizeBytes * (group.paths.length - 1);
    totalDuplicateWastedBytes += group.wastedBytes;
    duplicates.push(group);
  }

  duplicates.sort((a, b) => b.wastedBytes - a.wastedBytes);
  return { imageId: changesets.imageId, duplicates, totalDuplicateWastedBytes };
}
