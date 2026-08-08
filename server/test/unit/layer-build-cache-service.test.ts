import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { BuildCacheRecord } from "../../src/builders/build-cache-service.js";
import type { ImageLayerStack, LayerMetadata } from "../../src/image-analysis/layer-metadata-service.js";

// The service reads the layer stack through LayerMetadataService and the cache
// inventory through BuildCacheService: both are mocked, so the association and
// the reason taxonomy of layer-build-cache-service.md are the only behaviour
// under test here.
let layerStack: ImageLayerStack = { imageId: "", layers: [] };
let layerStackFailure: Error | undefined;
let cacheRecords: BuildCacheRecord[] = [];
let cacheFailure: Error | undefined;

mock.module(new URL("../../src/image-analysis/layer-metadata-service.ts", import.meta.url).href, {
  namedExports: {
    getImageLayerStack: async (imageId: string) => {
      if (layerStackFailure) throw layerStackFailure;
      return { ...layerStack, imageId };
    },
  },
});

mock.module(new URL("../../src/builders/build-cache-service.ts", import.meta.url).href, {
  namedExports: {
    listBuildCache: async () => {
      if (cacheFailure) throw cacheFailure;
      return cacheRecords;
    },
  },
});

const { getImageBuildCacheTrace } = await import("../../src/image-analysis/layer-build-cache-service.js");

/**
 * A layer as LayerMetadataService assembles it: `command` carries the daemon's
 * whole `CreatedBy` text, buildkit marker included.
 */
function layer(overrides: Partial<LayerMetadata> = {}): LayerMetadata {
  return {
    index: 0,
    diffId: "sha256:diff-0",
    uncompressedSizeBytes: 1024,
    emptyLayer: false,
    instruction: "RUN",
    command: "RUN /bin/sh -c mkdir /a # buildkit",
    ...overrides,
  };
}

function record(overrides: Partial<BuildCacheRecord> = {}): BuildCacheRecord {
  return {
    id: "rec-1",
    type: "regular",
    sizeBytes: 2048,
    usageState: "reclaimable",
    description: "mount / from exec /bin/sh -c mkdir /a",
    ...overrides,
  };
}

beforeEach(() => {
  layerStack = { imageId: "sha256:image", layers: [layer()] };
  layerStackFailure = undefined;
  cacheRecords = [];
  cacheFailure = undefined;
});

/**
 * layer-build-cache-service.md — "`unavailableReason` / `unavailableDetail` are
 * present exactly when `cacheRecord` is absent", and the detail is the sentence
 * shown to the operator.
 */
function assertReasonInvariant(trace: { layers: Array<Record<string, unknown>> }): void {
  for (const link of trace.layers) {
    if (link.cacheRecord !== undefined) {
      assert.equal(link.unavailableReason, undefined, "a linked layer must carry no reason");
      assert.equal(link.unavailableDetail, undefined, "a linked layer must carry no detail");
    } else {
      assert.ok(typeof link.unavailableReason === "string" && link.unavailableReason.length > 0, "an unlinked layer must state its reason");
      assert.ok(
        typeof link.unavailableDetail === "string" && (link.unavailableDetail as string).trim().length > 0,
        "an unlinked layer must carry an operator-facing sentence",
      );
    }
  }
}

// plan-docker_management_app/REQ-68 — from a layer of a locally built image, the
// build step and the build-cache entry responsible for it can be reached.
test("pairs a layer with the cache record carrying the same build step", async () => {
  cacheRecords = [record({ id: "rec-match" })];

  const trace = await getImageBuildCacheTrace("sha256:image");

  assert.equal(trace.imageId, "sha256:image");
  assert.equal(trace.layers.length, 1);
  assert.equal(trace.layers[0]!.cacheRecord?.id, "rec-match");
  assertReasonInvariant(trace);
});

// layer-build-cache-service.md — the link repeats the layer's own build step, so
// it stands on its own.
test("carries the layer's index, diff id, instruction and command on the link itself", async () => {
  cacheRecords = [record()];
  layerStack = { imageId: "sha256:image", layers: [layer({ index: 0, diffId: "sha256:diff-a" })] };

  const trace = await getImageBuildCacheTrace("sha256:image");

  const link = trace.layers[0]!;
  assert.equal(link.layerIndex, 0);
  assert.equal(link.diffId, "sha256:diff-a");
  assert.equal(link.instruction, "RUN");
  assert.equal(link.command, "RUN /bin/sh -c mkdir /a # buildkit");
});

// build-step-matching.md — a COPY step spells itself `COPY x /y # buildkit` in
// the history and `[n/m] COPY x /y` in the cache: the same step, so the same link.
test("pairs a COPY layer with the bracketed cache record of the same step", async () => {
  layerStack = { imageId: "sha256:image", layers: [layer({ command: "COPY payload.txt /payload.txt # buildkit" })] };
  cacheRecords = [record({ id: "rec-copy", description: "[2/2] COPY payload.txt /payload.txt" })];

  const trace = await getImageBuildCacheTrace("sha256:image");

  assert.equal(trace.layers[0]!.cacheRecord?.id, "rec-copy");
});

// layer-build-cache-service.md — "if the layer is empty -> MetadataOnlyStep"
test("states MetadataOnlyStep for an empty layer", async () => {
  layerStack = { imageId: "sha256:image", layers: [layer({ emptyLayer: true, diffId: undefined, uncompressedSizeBytes: 0 })] };
  cacheRecords = [record()];

  const trace = await getImageBuildCacheTrace("sha256:image");

  assert.equal(trace.layers[0]!.unavailableReason, "MetadataOnlyStep");
  assert.equal(trace.layers[0]!.cacheRecord, undefined);
  assertReasonInvariant(trace);
});

// layer-build-cache-service.md — "else if its command yields no comparable key
// -> NoRecordedCommand"
test("states NoRecordedCommand for a layer whose command was never recorded", async () => {
  layerStack = { imageId: "sha256:image", layers: [layer({ command: undefined, instruction: "UNKNOWN" })] };
  cacheRecords = [record()];

  const trace = await getImageBuildCacheTrace("sha256:image");

  assert.equal(trace.layers[0]!.unavailableReason, "NoRecordedCommand");
  assertReasonInvariant(trace);
});

// layer-build-cache-service.md — "else if the build cache could not be read ->
// BuildCacheUnreadable (carrying the CLI's message)", and "A build cache the CLI
// cannot read never fails the call: it becomes every layer's stated reason, and
// the layer stack is still answered with."
test("states BuildCacheUnreadable, carrying the CLI's message, when the cache cannot be read", async () => {
  cacheFailure = new Error("buildx du: failed to connect to the builder");
  layerStack = { imageId: "sha256:image", layers: [layer({ index: 0 }), layer({ index: 1, diffId: "sha256:diff-1" })] };

  const trace = await getImageBuildCacheTrace("sha256:image");

  assert.equal(trace.layers.length, 2, "the layer stack is still answered with");
  for (const link of trace.layers) {
    assert.equal(link.unavailableReason, "BuildCacheUnreadable");
    assert.ok(link.unavailableDetail!.includes("failed to connect to the builder"), `expected the CLI's own message, got: ${link.unavailableDetail}`);
  }
  assertReasonInvariant(trace);
});

// layer-build-cache-service.md — "else if the build cache holds no records ->
// BuildCacheEmpty"
test("states BuildCacheEmpty when the cache holds no records at all", async () => {
  cacheRecords = [];

  const trace = await getImageBuildCacheTrace("sha256:image");

  assert.equal(trace.layers[0]!.unavailableReason, "BuildCacheEmpty");
  assertReasonInvariant(trace);
});

// layer-build-cache-service.md — "else if no record matches the step ->
// NoMatchingCacheRecord", whose detail states both possibilities: the image was
// not built on this host (the registry-pulled case), or its record was pruned.
test("states NoMatchingCacheRecord, naming both possibilities, when no record matches the step", async () => {
  cacheRecords = [record({ description: "mount / from exec /bin/sh -c echo something-else" })];

  const trace = await getImageBuildCacheTrace("sha256:image");

  const link = trace.layers[0]!;
  assert.equal(link.unavailableReason, "NoMatchingCacheRecord");
  assert.match(link.unavailableDetail!, /not built on this host/i);
  assert.match(link.unavailableDetail!, /pruned/i);
  assertReasonInvariant(trace);
});

// layer-build-cache-service.md — "Only `regular` cache records stand for a
// layer-producing step; a record of any other type is never matched to a layer."
test("never matches a layer to a record of a type other than regular", async () => {
  cacheRecords = [record({ id: "rec-source", type: "source.local" })];

  const trace = await getImageBuildCacheTrace("sha256:image");

  assert.equal(trace.layers[0]!.cacheRecord, undefined);
  assert.equal(trace.layers[0]!.unavailableReason, "NoMatchingCacheRecord");
});

// layer-build-cache-service.md — "Where two records carry the same build step,
// the first one the cache reports wins, so the answer is stable."
test("takes the first of two records carrying the same build step", async () => {
  cacheRecords = [record({ id: "rec-first" }), record({ id: "rec-second" })];

  const trace = await getImageBuildCacheTrace("sha256:image");

  assert.equal(trace.layers[0]!.cacheRecord?.id, "rec-first");
});

// layer-build-cache-service.md — "Every layer of the stack is present in the
// answer: none is dropped for having no association", in the same order and with
// the same layerIndex as the stack.
test("answers with every layer of the stack, in order, associated or not", async () => {
  layerStack = {
    imageId: "sha256:image",
    layers: [
      layer({ index: 0, emptyLayer: true, diffId: undefined, uncompressedSizeBytes: 0, command: '/bin/sh -c #(nop) CMD ["/bin/sh"]', instruction: "CMD" }),
      layer({ index: 1, diffId: "sha256:diff-1", command: "RUN /bin/sh -c mkdir /a # buildkit" }),
      layer({ index: 2, diffId: "sha256:diff-2", command: "RUN /bin/sh -c mkdir /b # buildkit" }),
    ],
  };
  cacheRecords = [record({ id: "rec-b", description: "mount / from exec /bin/sh -c mkdir /b" })];

  const trace = await getImageBuildCacheTrace("sha256:image");

  assert.deepEqual(
    trace.layers.map((link) => link.layerIndex),
    [0, 1, 2],
  );
  assert.equal(trace.layers[0]!.unavailableReason, "MetadataOnlyStep");
  assert.equal(trace.layers[1]!.unavailableReason, "NoMatchingCacheRecord");
  assert.equal(trace.layers[2]!.cacheRecord?.id, "rec-b");
  assertReasonInvariant(trace);
});

// layer-build-cache-service.md — "rejects only when the image's own layer stack
// cannot be read -> the daemon's own error."
test("rejects with the daemon's own error when the layer stack cannot be read", async () => {
  layerStackFailure = new Error("No such image: sha256:image");

  await assert.rejects(() => getImageBuildCacheTrace("sha256:image"), /No such image/);
});
