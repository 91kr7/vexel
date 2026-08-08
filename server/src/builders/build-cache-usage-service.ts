// Reverse lookup from a build-cache record to the local images and layers it
// is associated with (REQ-69). Like the forward direction, an association
// that does not exist answers with its reason rather than with an empty list
// and no explanation.
import { buildStepKeyFromCacheDescription, buildStepKeyFromHistory } from "../image-analysis/build-step-matching.js";
import { getImageLayerStack } from "../image-analysis/layer-metadata-service.js";
import { listImages } from "../images/images-service.js";
import { listBuildCache, type BuildCacheRecord } from "./build-cache-service.js";

export type BuildCacheUsageUnavailableReason = "NonLayerCacheRecord" | "NoRecordedDescription" | "NoMatchingImage";

export interface BuildCacheLayerReference {
  imageId: string;
  imageShortId: string;
  tags: string[];
  layerIndex: number;
  diffId?: string;
  instruction: string;
  command?: string;
}

export interface BuildCacheUsage {
  record: BuildCacheRecord;
  references: BuildCacheLayerReference[];
  unavailableReason?: BuildCacheUsageUnavailableReason;
  /** Sentence stating why no reference can be named; present exactly when `unavailableReason` is. */
  unavailableDetail?: string;
}

/** Layer stacks are read a few images at a time, so a host with many images does not open one request per image at once. */
const IMAGE_LOOKUP_CONCURRENCY = 6;

const NO_DESCRIPTION_DETAIL = "The build cache recorded no description for this record, so the step it came from cannot be named.";
const NO_MATCHING_IMAGE_DETAIL =
  "No local image carries a build step matching this record: the image it was built for has been removed, or it belongs to a build whose result was never kept.";

/**
 * The images and layers `recordId` is associated with, or the reason none can
 * be named. Resolves to `undefined` when no record carries that id.
 */
export async function getBuildCacheUsage(recordId: string): Promise<BuildCacheUsage | undefined> {
  const record = (await listBuildCache()).find((candidate) => candidate.id === recordId);
  if (!record) return undefined;

  if (record.type !== "regular") {
    return {
      record,
      references: [],
      unavailableReason: "NonLayerCacheRecord",
      unavailableDetail: `A "${record.type}" record holds build input (a context, a Dockerfile, a cache mount) rather than an image layer, so no layer relates to it.`,
    };
  }

  const key = buildStepKeyFromCacheDescription(record.description);
  if (key === undefined) {
    return { record, references: [], unavailableReason: "NoRecordedDescription", unavailableDetail: NO_DESCRIPTION_DETAIL };
  }

  const references = await collectReferences(key);
  if (references.length === 0) {
    return { record, references, unavailableReason: "NoMatchingImage", unavailableDetail: NO_MATCHING_IMAGE_DETAIL };
  }
  return { record, references };
}

async function collectReferences(key: string): Promise<BuildCacheLayerReference[]> {
  const images = await listImages();
  const perImage = await mapWithConcurrency(images, IMAGE_LOOKUP_CONCURRENCY, async (image) => {
    let layers;
    try {
      layers = (await getImageLayerStack(image.id)).layers;
    } catch {
      // An image removed while the walk was in flight simply contributes
      // nothing; one unreadable image must not fail the whole lookup.
      return [];
    }
    return layers
      .filter((layer) => !layer.emptyLayer && buildStepKeyFromHistory(layer.command) === key)
      .map((layer) => ({
        imageId: image.id,
        imageShortId: image.shortId,
        tags: image.tags,
        layerIndex: layer.index,
        diffId: layer.diffId,
        instruction: layer.instruction,
        command: layer.command,
      }));
  });
  return perImage.flat();
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}
