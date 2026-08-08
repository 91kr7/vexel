// Layer metadata assembly from the image manifest and config (REQ-47,
// REQ-48): ordered layers with digest, size, empty-layer flag and
// originating instruction, sourced from the image inspect (RootFS diff ids)
// and history — never from `docker history` text output alone. Anything the
// daemon genuinely cannot provide is marked unavailable with its reason.
//
// The daemon's two sources disagree on direction: `GET /images/{id}/history`
// answers newest-layer-first (verified against a running daemon), while
// `RootFS.Layers` is base-first (the OCI config's own diff id order). History
// is reversed here so both walk base-to-top before diff ids are paired to
// non-empty steps, one diff id per non-empty step in that order.
import { getEngineClient } from "../connectivity/connection-status-service.js";

export interface LayerMetadata {
  index: number;
  diffId?: string;
  diffIdUnavailableReason?: string;
  uncompressedSizeBytes: number;
  compressedSizeBytes?: number;
  compressedSizeUnavailableReason?: string;
  emptyLayer: boolean;
  instruction: string;
  command?: string;
  commandUnavailableReason?: string;
}

export interface ImageLayerStack {
  imageId: string;
  layers: LayerMetadata[];
}

interface RawImageInspect {
  RootFS?: { Layers?: string[] };
}

interface RawHistoryEntry {
  CreatedBy?: string;
  Size: number;
}

const NOP_MARKER = "#(nop)";
const COMPRESSED_SIZE_UNAVAILABLE =
  "The local daemon reports only the uncompressed layer content size; a compressed size is not available for a locally stored image.";

export async function getImageLayerStack(imageId: string): Promise<ImageLayerStack> {
  const client = getEngineClient();
  const inspectResponse = await client.request(`/images/${imageId}/json`);
  const inspect = JSON.parse(inspectResponse.body) as RawImageInspect;
  const historyResponse = await client.request(`/images/${imageId}/history`);
  // The daemon returns history newest-first; reverse to build order (base
  // layer first) so it lines up with `RootFS.Layers`, which is already
  // base-first.
  const history = (JSON.parse(historyResponse.body) as RawHistoryEntry[]).slice().reverse();
  const diffIds = inspect.RootFS?.Layers ?? [];

  let diffIdCursor = 0;
  const layers: LayerMetadata[] = history.map((entry, index) => {
    const emptyLayer = entry.Size === 0;
    const parsed = parseCreatedBy(entry.CreatedBy ?? "");
    const diffId = emptyLayer ? undefined : diffIds[diffIdCursor];
    if (!emptyLayer) diffIdCursor += 1;
    return {
      index,
      diffId,
      diffIdUnavailableReason: diffIdUnavailableReason(emptyLayer, diffId),
      uncompressedSizeBytes: entry.Size,
      compressedSizeUnavailableReason: COMPRESSED_SIZE_UNAVAILABLE,
      emptyLayer,
      ...parsed,
    };
  });

  return { imageId, layers };
}

function diffIdUnavailableReason(emptyLayer: boolean, diffId: string | undefined): string | undefined {
  if (emptyLayer) return "Empty layers add no filesystem content and therefore carry no diff id";
  if (!diffId) return "The image manifest reported fewer content-addressed layers than non-empty build steps";
  return undefined;
}

function parseCreatedBy(createdBy: string): { instruction: string; command?: string; commandUnavailableReason?: string } {
  const trimmed = createdBy.trim();
  if (!trimmed) return { instruction: "UNKNOWN", commandUnavailableReason: "The daemon recorded no command text for this build step" };
  const nopIndex = trimmed.indexOf(NOP_MARKER);
  if (nopIndex === -1) return { instruction: "RUN", command: trimmed };
  const afterNop = trimmed.slice(nopIndex + NOP_MARKER.length).trim();
  const firstSpace = afterNop.indexOf(" ");
  const instruction = (firstSpace === -1 ? afterNop : afterNop.slice(0, firstSpace)).toUpperCase();
  return { instruction: instruction || "UNKNOWN", command: trimmed };
}
