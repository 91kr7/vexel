// Combined layer-efficiency and secret-signal job (REQ-65, REQ-66, REQ-67):
// runs (or reuses the cached result of) the batch-13 changeset analysis job,
// then derives waste, duplicate-content and secret-pattern findings from it —
// sharing the analysis job and cache of the layer explorer, so analysing
// either view first serves the other from cache.
import { computeImageChangesets, type ChangesetProgress, type ImageChangesets } from "./changeset-service.js";
import { analyzeDuplicateContent, type LayerDuplicateAnalysis } from "./layer-duplicate-detection.js";
import { analyzeLayerWaste, type LayerWasteAnalysis } from "./layer-waste-analysis.js";
import { scanForSecretPaths, type LayerSecretScan } from "./secret-pattern-scan.js";

export interface LayerSignals {
  imageId: string;
  waste: LayerWasteAnalysis;
  duplicates: LayerDuplicateAnalysis;
  secrets: LayerSecretScan;
}

export interface LayerSignalsHandlers {
  onProgress: (progress: ChangesetProgress) => void;
  onError: (message: string) => void;
  onEnd: (result: LayerSignals) => void;
}

/**
 * Drives `computeImageChangesets` for `imageId` — its progress, cache and
 * cancellation semantics apply unchanged — then, once it ends, derives the
 * three findings categories synchronously before calling `onEnd`.
 */
export async function analyzeLayerSignals(imageId: string, handlers: LayerSignalsHandlers): Promise<() => void> {
  return computeImageChangesets(imageId, {
    onProgress: handlers.onProgress,
    onError: handlers.onError,
    onEnd: (changesets: ImageChangesets) => {
      handlers.onEnd({
        imageId,
        waste: analyzeLayerWaste(changesets),
        duplicates: analyzeDuplicateContent(changesets),
        secrets: scanForSecretPaths(changesets),
      });
    },
  });
}
