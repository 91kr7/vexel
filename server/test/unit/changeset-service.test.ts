import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileAsync } from "../support/docker-cli.js";

// Isolated from the real ~/.vexel cache, like analysis-cache-store.test.ts: local-store.ts resolves
// its data directory once at import time.
process.env.VEXEL_DATA_DIR = await mkdtemp(join(tmpdir(), "vexel-changeset-service-"));

// The service exports the image via ImageTransferService and reads its own layer metadata via
// LayerMetadataService; both are mocked so a hand-built export tarball (via the real `tar` CLI,
// not this project's own writer) drives the read path under test — including a deliberately
// invalid layer blob, to exercise the "neither tar nor gzip" failure path.
let exportTarPath = "";
let layerStack: { imageId: string; layers: unknown[] } = { imageId: "test-image", layers: [] };

mock.module(new URL("../../src/images/image-transfer-service.ts", import.meta.url).href, {
  namedExports: {
    openImageSaveStream: async () => ({ response: createReadStream(exportTarPath), suggestedFilename: "export.tar" }),
  },
});
mock.module(new URL("../../src/image-analysis/layer-metadata-service.ts", import.meta.url).href, {
  namedExports: {
    getImageLayerStack: async () => layerStack,
  },
});

const { computeImageChangesets, computeLayerChangesetPaths } = await import("../../src/image-analysis/changeset-service.js");

/** Builds a real export tarball (manifest.json + one named blob) with the system `tar`, mirroring what `docker save` produces. */
async function buildExportTar(blobName: string, blobContent: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vexel-export-fixture-"));
  await writeFile(join(dir, "manifest.json"), JSON.stringify([{ Config: "config.json", Layers: [blobName] }]));
  await writeFile(join(dir, blobName), blobContent);
  const tarPath = join(dir, "export.tar");
  await execFileAsync("tar", ["-cf", tarPath, "-C", dir, "manifest.json", blobName], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  return tarPath;
}

function collect(imageId: string): Promise<{ progress: unknown[]; result?: unknown; error?: string }> {
  return new Promise((resolve, reject) => {
    const progress: unknown[] = [];
    computeImageChangesets(imageId, {
      onProgress: (p) => progress.push(p),
      onEnd: (result) => resolve({ progress, result }),
      onError: (message) => resolve({ progress, error: message }),
    }).catch(reject);
  });
}

beforeEach(() => {
  layerStack = { imageId: "test-image", layers: [{ index: 0, diffId: "sha256:layer", uncompressedSizeBytes: 10, emptyLayer: false, instruction: "RUN" }] };
});

// changeset-service.md — a blob that is neither a valid tar nor gzip-compressed now fails loudly
// (onError) instead of walking on and emitting whatever garbage the bytes happen to parse into.
test("computeImageChangesets reports an error, not a garbage result, when a layer blob is neither tar nor gzip", async () => {
  // A full 512-byte (one tar block) buffer of non-zero, non-gzip-magic bytes: long enough to reach
  // the header checksum check (a shorter buffer is instead read as a graceful, truncated end).
  exportTarPath = await buildExportTar("bad-layer.bin", Buffer.alloc(512, 0x41));

  const outcome = await collect(`test-image-invalid-${Date.now()}`);

  assert.equal(outcome.result, undefined, "expected no result to be delivered for corrupted layer content");
  assert.ok(outcome.error, "expected onError to fire");
  assert.match(outcome.error!, /tar|gzip/i);
});

// changeset-service.md — a genuinely valid (real tar) layer blob is still read correctly, so the
// checksum validation added for the failure path above does not reject good input.
test("computeImageChangesets still succeeds for a genuinely valid layer blob", async () => {
  const layerDir = await mkdtemp(join(tmpdir(), "vexel-layer-fixture-"));
  await writeFile(join(layerDir, "file.txt"), "content");
  const layerTarPath = join(layerDir, "layer.tar");
  await execFileAsync("tar", ["-cf", layerTarPath, "-C", layerDir, "file.txt"], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  const layerBytes = await (await import("node:fs/promises")).readFile(layerTarPath);
  exportTarPath = await buildExportTar("good-layer.tar", layerBytes);

  const outcome = await collect(`test-image-valid-${Date.now()}`);

  assert.ok(outcome.result, `expected a result, got error: ${outcome.error}`);
  const result = outcome.result as { layers: { paths: { path: string; status: string }[] }[] };
  assert.deepEqual(
    result.layers[0]!.paths.map((p) => ({ path: p.path, status: p.status })),
    [{ path: "file.txt", status: "added" }],
  );
});

// changeset-service.md — a path already known from a lower layer is "modified", otherwise "added"
test("computeLayerChangesetPaths reports a new path as added and a path already known as modified", () => {
  const knownPaths = new Set<string>();

  // Projected onto the three fields under test: an entry also carries the
  // optional `contentHash`, which is only populated when the layer's content is
  // read (changeset-service.md) and is not what this test is about.
  const summarise = (paths: ReturnType<typeof computeLayerChangesetPaths>) =>
    paths.map((entry) => ({ path: entry.path, status: entry.status, sizeBytes: entry.sizeBytes }));

  const first = computeLayerChangesetPaths([{ name: "app/config.yml", size: 100, typeFlag: "0" }], knownPaths);
  assert.deepEqual(summarise(first), [{ path: "app/config.yml", status: "added", sizeBytes: 100 }]);

  const second = computeLayerChangesetPaths([{ name: "app/config.yml", size: 150, typeFlag: "0" }], knownPaths);
  assert.deepEqual(summarise(second), [{ path: "app/config.yml", status: "modified", sizeBytes: 150 }]);
});

// changeset-service.md — an OCI whiteout marker (.wh.<name>) yields a deleted entry for <name> in
// the marker's directory, with no sizeBytes, only a sizeUnavailableReason
test("computeLayerChangesetPaths reports a .wh.<name> marker as a deletion of <name>, dropping it from knownPaths", () => {
  const knownPaths = new Set<string>(["app/old.txt", "app/keep.txt"]);

  const paths = computeLayerChangesetPaths([{ name: "app/.wh.old.txt", size: 0, typeFlag: "0" }], knownPaths);

  assert.equal(paths.length, 1);
  assert.equal(paths[0]!.path, "app/old.txt");
  assert.equal(paths[0]!.status, "deleted");
  assert.equal(paths[0]!.sizeBytes, undefined);
  assert.ok(paths[0]!.sizeUnavailableReason);
  assert.ok(!knownPaths.has("app/old.txt"));
  assert.ok(knownPaths.has("app/keep.txt"), "an unrelated known path must survive the deletion");
});

// changeset-service.md — an opaque-directory marker (.wh..wh..opq) yields a single deleted entry
// for the directory itself, hiding everything a lower layer put there
test("computeLayerChangesetPaths reports a .wh..wh..opq marker as a single deletion of the directory, hiding its known children", () => {
  const knownPaths = new Set<string>(["mydir/a.txt", "mydir/nested/b.txt", "other/c.txt"]);

  const paths = computeLayerChangesetPaths([{ name: "mydir/.wh..wh..opq", size: 0, typeFlag: "0" }], knownPaths);

  assert.equal(paths.length, 1);
  assert.equal(paths[0]!.path, "mydir");
  assert.equal(paths[0]!.status, "deleted");
  assert.equal(paths[0]!.sizeBytes, undefined);
  assert.ok(paths[0]!.sizeUnavailableReason);
  assert.ok(!knownPaths.has("mydir/a.txt"), "a direct child of the opaque directory must be hidden");
  assert.ok(!knownPaths.has("mydir/nested/b.txt"), "a nested descendant of the opaque directory must be hidden too");
  assert.ok(knownPaths.has("other/c.txt"), "a path outside the opaque directory must survive");
});

// changeset-service.md — a fresh opaque directory (no lower-layer children yet known) is still
// reported as a single deletion of the directory itself
test("computeLayerChangesetPaths reports an opaque-directory marker as a deletion even with no known children", () => {
  const knownPaths = new Set<string>();

  const paths = computeLayerChangesetPaths([{ name: "empty-dir/.wh..wh..opq", size: 0, typeFlag: "0" }], knownPaths);

  assert.deepEqual(
    paths.map((p) => ({ path: p.path, status: p.status })),
    [{ path: "empty-dir", status: "deleted" }],
  );
});
