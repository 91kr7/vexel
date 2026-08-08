// Association between an image's layers (their build steps) and the local
// build-cache records that produced them (REQ-68). Every layer answers either
// with its cache record or with the reason the association does not exist —
// never with silence.
import { listBuildCache, type BuildCacheRecord } from "../builders/build-cache-service.js";
import { buildStepKeyFromCacheDescription, buildStepKeyFromHistory } from "./build-step-matching.js";
import { getImageLayerStack, type LayerMetadata } from "./layer-metadata-service.js";

export type LayerBuildCacheUnavailableReason =
  | "MetadataOnlyStep"
  | "NoRecordedCommand"
  | "BuildCacheUnreadable"
  | "BuildCacheEmpty"
  | "NoMatchingCacheRecord";

export interface LayerBuildCacheLink {
  layerIndex: number;
  diffId?: string;
  /** The build step this layer came from, repeated here so the link stands on its own. */
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

const METADATA_ONLY_DETAIL =
  "This step only changed image metadata: it produced no filesystem content, so the build cache never held a record for it.";
const NO_COMMAND_DETAIL = "The daemon recorded no command for this step, so there is nothing to match a build-cache record against.";
const EMPTY_CACHE_DETAIL =
  "The local build cache holds no records at all: this image was not built on this host, or the cache has been pruned since.";
const NO_MATCH_DETAIL =
  "No local build-cache record matches this step: the image was not built on this host — a registry-pulled image leaves no build cache behind — or its record has been pruned since.";

/**
 * The layer stack of `imageId`, each layer paired with the build-cache record
 * behind it or with the reason no such record can be named.
 */
export async function getImageBuildCacheTrace(imageId: string): Promise<ImageBuildCacheTrace> {
  const stack = await getImageLayerStack(imageId);

  let records: BuildCacheRecord[] = [];
  let readFailure: string | undefined;
  try {
    records = await listBuildCache();
  } catch (error) {
    // A cache the CLI cannot read is a stated reason, not a failed request:
    // the layer stack itself is still worth answering with.
    readFailure = error instanceof Error ? error.message : String(error);
  }

  const byBuildStep = indexByBuildStep(records);
  return {
    imageId: stack.imageId,
    layers: stack.layers.map((layer) => linkFor(layer, byBuildStep, records.length, readFailure)),
  };
}

/** Only `regular` records stand for a layer-producing step; the first record of a repeated step wins. */
function indexByBuildStep(records: BuildCacheRecord[]): Map<string, BuildCacheRecord> {
  const index = new Map<string, BuildCacheRecord>();
  for (const record of records) {
    if (record.type !== "regular") continue;
    const key = buildStepKeyFromCacheDescription(record.description);
    if (key === undefined || index.has(key)) continue;
    index.set(key, record);
  }
  return index;
}

function linkFor(
  layer: LayerMetadata,
  byBuildStep: Map<string, BuildCacheRecord>,
  recordCount: number,
  readFailure: string | undefined,
): LayerBuildCacheLink {
  const base = { layerIndex: layer.index, diffId: layer.diffId, instruction: layer.instruction, command: layer.command };
  if (layer.emptyLayer) return { ...base, unavailableReason: "MetadataOnlyStep", unavailableDetail: METADATA_ONLY_DETAIL };

  const key = buildStepKeyFromHistory(layer.command);
  if (key === undefined) return { ...base, unavailableReason: "NoRecordedCommand", unavailableDetail: NO_COMMAND_DETAIL };
  if (readFailure !== undefined) {
    return { ...base, unavailableReason: "BuildCacheUnreadable", unavailableDetail: `The local build cache could not be read: ${readFailure}` };
  }
  if (recordCount === 0) return { ...base, unavailableReason: "BuildCacheEmpty", unavailableDetail: EMPTY_CACHE_DETAIL };

  const cacheRecord = byBuildStep.get(key);
  if (!cacheRecord) return { ...base, unavailableReason: "NoMatchingCacheRecord", unavailableDetail: NO_MATCH_DETAIL };
  return { ...base, cacheRecord };
}
