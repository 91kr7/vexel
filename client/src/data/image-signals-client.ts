// Typed client for the layer-efficiency and secret-signal stream (REQ-65–67).
export interface WastedFile {
  path: string;
  layerIndex: number;
  sizeBytes: number;
  supersededByLayerIndex: number;
  reason: 'overwritten' | 'deleted';
}

export interface LayerWasteAnalysis {
  imageId: string;
  wastedFiles: WastedFile[];
  totalWastedBytes: number;
  totalBytesWritten: number;
  efficiencyScore: number;
}

export interface DuplicateContentPath {
  path: string;
  layerIndex: number;
}

export interface DuplicateContentGroup {
  contentHash: string;
  sizeBytes: number;
  paths: DuplicateContentPath[];
  wastedBytes: number;
}

export interface LayerDuplicateAnalysis {
  imageId: string;
  duplicates: DuplicateContentGroup[];
  totalDuplicateWastedBytes: number;
}

export interface SecretFinding {
  path: string;
  patternName: string;
  introducedLayerIndex: number;
  removedLayerIndex?: number;
}

export interface LayerSecretScan {
  imageId: string;
  findings: SecretFinding[];
}

export interface LayerSignals {
  imageId: string;
  waste: LayerWasteAnalysis;
  duplicates: LayerDuplicateAnalysis;
  secrets: LayerSecretScan;
}

/** Builds the layer-efficiency/secret-signal analysis progress-stream URL; consumed with `useImageSignalsStream`. */
export function imageSignalsStreamUrl(id: string): string {
  return `/api/images/${encodeURIComponent(id)}/signals/stream`;
}
