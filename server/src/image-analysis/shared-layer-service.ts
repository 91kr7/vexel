// Cross-image shared-layer detection (REQ-50): for each of an image's
// layers, which other local images reference the same content-addressed diff
// id. An image whose own inspect fails degrades to "shares nothing" rather
// than failing the whole lookup.
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { listImages } from "../images/images-service.js";

export interface SharingImage {
  id: string;
  tags: string[];
}

interface RawImageInspect {
  RootFS?: { Layers?: string[] };
}

/** Maps each of `diffIds` to the other local images (excluding `imageId`) that also reference it. */
export async function getSharedLayerImages(imageId: string, diffIds: string[]): Promise<Record<string, SharingImage[]>> {
  const result: Record<string, SharingImage[]> = {};
  for (const diffId of diffIds) result[diffId] = [];
  if (diffIds.length === 0) return result;

  const wanted = new Set(diffIds);
  const summaries = await listImages();
  const client = getEngineClient();

  for (const summary of summaries) {
    if (summary.id === imageId) continue;
    let layers: string[];
    try {
      const response = await client.request(`/images/${summary.id}/json`);
      const raw = JSON.parse(response.body) as RawImageInspect;
      layers = raw.RootFS?.Layers ?? [];
    } catch {
      continue;
    }
    for (const diffId of layers) {
      if (!wanted.has(diffId)) continue;
      result[diffId].push({ id: summary.id, tags: summary.tags });
    }
  }

  return result;
}
