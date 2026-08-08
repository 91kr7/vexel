// Waste analysis over per-layer changesets (REQ-65): estimates the bytes a
// layer wrote for a path that a later layer then overwrote or deleted — still
// physically stored in the image, invisible in the final merged filesystem.
// Pure computation over an already-computed ImageChangesets (ChangesetService,
// batch 13), no I/O of its own.
import type { ImageChangesets, LayerChangesetPath } from "./changeset-service.js";

export interface PathEvent {
  layerIndex: number;
  status: LayerChangesetPath["status"];
  sizeBytes?: number;
  contentHash?: string;
}

export interface WastedFile {
  path: string;
  /** The layer whose version of `path` these bytes belong to. */
  layerIndex: number;
  sizeBytes: number;
  /** The layer that overwrote or deleted this version. */
  supersededByLayerIndex: number;
  reason: "overwritten" | "deleted";
}

export interface LayerWasteAnalysis {
  imageId: string;
  wastedFiles: WastedFile[];
  totalWastedBytes: number;
  /** Sum of every added/modified entry's size across every layer, wasted or not. */
  totalBytesWritten: number;
  /** 1 minus the wasted fraction of bytes ever written, bounded to [0, 1]; 1 when nothing was ever written. */
  efficiencyScore: number;
}

/**
 * Every path's added/modified/deleted events across the image's layers, in
 * layer (build) order — shared by LayerWasteAnalysis and
 * LayerDuplicateDetection so both read the same per-path history.
 */
export function buildPathTimelines(changesets: ImageChangesets): Map<string, PathEvent[]> {
  const timelines = new Map<string, PathEvent[]>();
  for (const layer of changesets.layers) {
    for (const path of layer.paths) {
      const events = timelines.get(path.path) ?? [];
      events.push({ layerIndex: layer.layerIndex, status: path.status, sizeBytes: path.sizeBytes, contentHash: path.contentHash });
      timelines.set(path.path, events);
    }
  }
  return timelines;
}

/**
 * A path's every occurrence except its last is dead weight: superseded by a
 * later layer that overwrote or deleted it, yet still stored where it was
 * first written. The last occurrence is never wasted — it is either the live
 * content (an 'added'/'modified' event) or a 'deleted' marker, which itself
 * carries no bytes.
 */
export function analyzeLayerWaste(changesets: ImageChangesets): LayerWasteAnalysis {
  const timelines = buildPathTimelines(changesets);
  const wastedFiles: WastedFile[] = [];
  let totalWastedBytes = 0;
  let totalBytesWritten = 0;

  for (const [path, events] of timelines) {
    for (const event of events) {
      if (event.sizeBytes !== undefined) totalBytesWritten += event.sizeBytes;
    }
    for (let i = 0; i < events.length - 1; i += 1) {
      const event = events[i];
      if (event.sizeBytes === undefined) continue;
      const next = events[i + 1];
      wastedFiles.push({
        path,
        layerIndex: event.layerIndex,
        sizeBytes: event.sizeBytes,
        supersededByLayerIndex: next.layerIndex,
        reason: next.status === "deleted" ? "deleted" : "overwritten",
      });
      totalWastedBytes += event.sizeBytes;
    }
  }

  wastedFiles.sort((a, b) => b.sizeBytes - a.sizeBytes);
  const efficiencyScore = totalBytesWritten > 0 ? Math.max(0, 1 - totalWastedBytes / totalBytesWritten) : 1;
  return { imageId: changesets.imageId, wastedFiles, totalWastedBytes, totalBytesWritten, efficiencyScore };
}
