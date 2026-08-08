import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { BuildCacheRecord } from "../../src/builders/build-cache-service.js";
import type { ImageLayerStack, LayerMetadata } from "../../src/image-analysis/layer-metadata-service.js";
import type { ImageSummary } from "../../src/images/images-service.js";

// The reverse lookup reads the cache inventory, the local image list and each
// image's layer stack: all three are mocked, so the reference building and the
// reason taxonomy of build-cache-usage-service.md are the only behaviour under
// test here.
let cacheRecords: BuildCacheRecord[] = [];
let cacheFailure: Error | undefined;
let images: ImageSummary[] = [];
let layerStacks: Record<string, ImageLayerStack> = {};
let layerStackFailureIds = new Set<string>();

mock.module(new URL("../../src/builders/build-cache-service.ts", import.meta.url).href, {
  namedExports: {
    listBuildCache: async () => {
      if (cacheFailure) throw cacheFailure;
      return cacheRecords;
    },
  },
});

mock.module(new URL("../../src/images/images-service.ts", import.meta.url).href, {
  namedExports: {
    listImages: async () => images,
  },
});

mock.module(new URL("../../src/image-analysis/layer-metadata-service.ts", import.meta.url).href, {
  namedExports: {
    getImageLayerStack: async (imageId: string) => {
      if (layerStackFailureIds.has(imageId)) throw new Error(`No such image: ${imageId}`);
      return layerStacks[imageId] ?? { imageId, layers: [] };
    },
  },
});

const { getBuildCacheUsage } = await import("../../src/builders/build-cache-usage-service.js");

function summary(id: string, tags: string[]): ImageSummary {
  return { id, shortId: id.slice(0, 12), tags, digest: undefined, platforms: [], sizeBytes: 0, createdAt: "2024-01-01T00:00:00.000Z" };
}

/** A layer as LayerMetadataService assembles it: `command` carries the daemon's whole `CreatedBy` text. */
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
  cacheRecords = [record()];
  cacheFailure = undefined;
  images = [];
  layerStacks = {};
  layerStackFailureIds = new Set();
});

// build-cache-usage-service.md — "An unknown record id is answered as
// `undefined`, not as an error."
test("answers undefined for a record id no record in the inventory carries", async () => {
  const usage = await getBuildCacheUsage("rec-unknown");

  assert.equal(usage, undefined);
});

// plan-docker_management_app/REQ-69 — from a build-cache entry, the images and
// layers it is associated with can be reached.
test("names the image and layer whose build step matches the record", async () => {
  images = [summary("sha256:aaaaaaaaaaaabbbb", ["fixture:1"])];
  layerStacks["sha256:aaaaaaaaaaaabbbb"] = {
    imageId: "sha256:aaaaaaaaaaaabbbb",
    layers: [layer({ index: 0, command: "RUN /bin/sh -c echo other # buildkit" }), layer({ index: 1, diffId: "sha256:diff-1" })],
  };

  const usage = await getBuildCacheUsage("rec-1");

  assert.ok(usage, "expected a usage answer for a known record id");
  assert.equal(usage!.record.id, "rec-1");
  assert.equal(usage!.unavailableReason, undefined);
  assert.equal(usage!.unavailableDetail, undefined);
  assert.equal(usage!.references.length, 1);
  const reference = usage!.references[0]!;
  assert.equal(reference.imageId, "sha256:aaaaaaaaaaaabbbb");
  assert.equal(reference.imageShortId, images[0]!.shortId);
  assert.deepEqual(reference.tags, ["fixture:1"]);
  assert.equal(reference.layerIndex, 1);
  assert.equal(reference.diffId, "sha256:diff-1");
  assert.equal(reference.instruction, "RUN");
  assert.equal(reference.command, "RUN /bin/sh -c mkdir /a # buildkit");
});

// build-cache-usage-service.md — "if the record's type is not `regular` ->
// NonLayerCacheRecord (naming the type: build input, not an image layer)"
test("states NonLayerCacheRecord, naming the type, for a record that is not regular", async () => {
  cacheRecords = [record({ type: "source.local", description: "local source for context" })];
  images = [summary("sha256:aaaaaaaaaaaabbbb", ["fixture:1"])];
  layerStacks["sha256:aaaaaaaaaaaabbbb"] = { imageId: "sha256:aaaaaaaaaaaabbbb", layers: [layer()] };

  const usage = await getBuildCacheUsage("rec-1");

  assert.equal(usage!.references.length, 0);
  assert.equal(usage!.unavailableReason, "NonLayerCacheRecord");
  assert.ok(usage!.unavailableDetail!.includes("source.local"), `expected the record's type in the detail, got: ${usage!.unavailableDetail}`);
});

// build-cache-usage-service.md — "else if it carries no usable description ->
// NoRecordedDescription"
test("states NoRecordedDescription for a regular record carrying no description", async () => {
  cacheRecords = [record({ description: undefined })];

  const usage = await getBuildCacheUsage("rec-1");

  assert.equal(usage!.references.length, 0);
  assert.equal(usage!.unavailableReason, "NoRecordedDescription");
  assert.ok((usage!.unavailableDetail ?? "").trim().length > 0, "expected an operator-facing sentence");
});

// build-cache-usage-service.md — "else if no local image's step matches it ->
// NoMatchingImage"
test("states NoMatchingImage when no local image carries the record's build step", async () => {
  images = [summary("sha256:aaaaaaaaaaaabbbb", ["fixture:1"])];
  layerStacks["sha256:aaaaaaaaaaaabbbb"] = {
    imageId: "sha256:aaaaaaaaaaaabbbb",
    layers: [layer({ command: "RUN /bin/sh -c echo something-else # buildkit" })],
  };

  const usage = await getBuildCacheUsage("rec-1");

  assert.equal(usage!.references.length, 0);
  assert.equal(usage!.unavailableReason, "NoMatchingImage");
  assert.ok((usage!.unavailableDetail ?? "").trim().length > 0, "expected an operator-facing sentence");
});

// build-cache-usage-service.md — "Empty layers are never referenced: they
// produce no cache record."
test("never references an empty layer", async () => {
  cacheRecords = [record({ description: '[1/1] CMD ["/bin/sh"]' })];
  images = [summary("sha256:aaaaaaaaaaaabbbb", ["fixture:1"])];
  layerStacks["sha256:aaaaaaaaaaaabbbb"] = {
    imageId: "sha256:aaaaaaaaaaaabbbb",
    layers: [layer({ emptyLayer: true, diffId: undefined, uncompressedSizeBytes: 0, command: 'CMD ["/bin/sh"] # buildkit' })],
  };

  const usage = await getBuildCacheUsage("rec-1");

  assert.equal(usage!.references.length, 0);
  assert.equal(usage!.unavailableReason, "NoMatchingImage");
});

// build-cache-usage-service.md — "An image whose layer stack cannot be read
// (e.g. removed mid-walk) contributes nothing and never fails the lookup."
test("skips an image whose layer stack cannot be read, still naming the ones that match", async () => {
  images = [summary("sha256:removedmidwalk", []), summary("sha256:aaaaaaaaaaaabbbb", ["fixture:1"])];
  layerStackFailureIds.add("sha256:removedmidwalk");
  layerStacks["sha256:aaaaaaaaaaaabbbb"] = { imageId: "sha256:aaaaaaaaaaaabbbb", layers: [layer()] };

  const usage = await getBuildCacheUsage("rec-1");

  assert.equal(usage!.references.length, 1);
  assert.equal(usage!.references[0]!.imageId, "sha256:aaaaaaaaaaaabbbb");
});

// build-cache-usage-service.md — the lookup walks more images than its own
// concurrency window, so a host with many images is still covered end to end.
test("walks the whole image list, beyond its concurrency window", async () => {
  const matchingId = "sha256:cccccccccccclast";
  images = [...Array.from({ length: 20 }, (_, index) => summary(`sha256:filler${index}`, [])), summary(matchingId, ["fixture:last"])];
  for (const image of images) {
    layerStacks[image.id] = { imageId: image.id, layers: [layer({ command: "RUN /bin/sh -c echo filler # buildkit" })] };
  }
  layerStacks[matchingId] = { imageId: matchingId, layers: [layer()] };

  const usage = await getBuildCacheUsage("rec-1");

  assert.equal(usage!.references.length, 1);
  assert.equal(usage!.references[0]!.imageId, matchingId);
});

// build-cache-usage-service.md — "rejects with the CLI's own message when the
// cache inventory itself cannot be read."
test("rejects with the CLI's own message when the cache inventory cannot be read", async () => {
  cacheFailure = new Error("buildx du: failed to connect to the builder");

  await assert.rejects(() => getBuildCacheUsage("rec-1"), /failed to connect to the builder/);
});
