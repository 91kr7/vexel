import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeDuplicateContent } from "../../src/image-analysis/layer-duplicate-detection.js";
import type { ImageChangesets } from "../../src/image-analysis/changeset-service.js";

function changesets(layers: ImageChangesets["layers"]): ImageChangesets {
  return { imageId: "test-image", layers };
}

// plan-docker_management_app/REQ-66 — identical live content at two or more paths is reported as a
// duplicate group, wasting the bytes of every copy past the first.
test("analyzeDuplicateContent reports two live paths sharing identical content as a duplicate group", () => {
  const result = analyzeDuplicateContent(
    changesets([{ layerIndex: 0, paths: [{ path: "a/one.bin", status: "added", sizeBytes: 500, contentHash: "H1" }, { path: "b/two.bin", status: "added", sizeBytes: 500, contentHash: "H1" }] }]),
  );

  assert.deepEqual(result.duplicates, [
    {
      contentHash: "H1",
      sizeBytes: 500,
      paths: [{ path: "a/one.bin", layerIndex: 0 }, { path: "b/two.bin", layerIndex: 0 }],
      wastedBytes: 500,
    },
  ]);
  assert.equal(result.totalDuplicateWastedBytes, 500);
});

// layer-duplicate-detection.md — a hash held by a single live path is not reported.
test("analyzeDuplicateContent does not report content held by a single live path", () => {
  const result = analyzeDuplicateContent(changesets([{ layerIndex: 0, paths: [{ path: "a/one.bin", status: "added", sizeBytes: 300, contentHash: "H2" }] }]));

  assert.deepEqual(result.duplicates, []);
  assert.equal(result.totalDuplicateWastedBytes, 0);
});

// layer-duplicate-detection.md — zero-byte content is excluded regardless of how many paths share it.
test("analyzeDuplicateContent excludes zero-byte content even when shared by several paths", () => {
  const result = analyzeDuplicateContent(
    changesets([{ layerIndex: 0, paths: [{ path: "a/empty1", status: "added", sizeBytes: 0, contentHash: "HZ" }, { path: "b/empty2", status: "added", sizeBytes: 0, contentHash: "HZ" }] }]),
  );

  assert.deepEqual(result.duplicates, []);
});

// layer-duplicate-detection.md — only a path's final, live content is considered: a superseded
// occurrence is LayerWasteAnalysis's concern and must never be double-counted here.
test("analyzeDuplicateContent ignores a superseded (non-final) occurrence, even if it shares a hash with a live path", () => {
  const result = analyzeDuplicateContent(
    changesets([
      { layerIndex: 0, paths: [{ path: "a/one.bin", status: "added", sizeBytes: 200, contentHash: "H3" }] },
      {
        layerIndex: 1,
        paths: [
          { path: "a/one.bin", status: "modified", sizeBytes: 900, contentHash: "H4" },
          { path: "b/two.bin", status: "added", sizeBytes: 200, contentHash: "H3" },
        ],
      },
    ]),
  );

  // H3 is now held live only by b/two.bin (a/one.bin's H3 occurrence was superseded) — a single
  // live path, so not reported; H4 is held by a/one.bin alone — also not reported.
  assert.deepEqual(result.duplicates, []);
});

// layer-duplicate-detection.md — duplicates is sorted by wastedBytes descending.
test("analyzeDuplicateContent sorts duplicate groups by wastedBytes descending", () => {
  const result = analyzeDuplicateContent(
    changesets([
      {
        layerIndex: 0,
        paths: [
          { path: "a/small1", status: "added", sizeBytes: 10, contentHash: "SMALL" },
          { path: "a/small2", status: "added", sizeBytes: 10, contentHash: "SMALL" },
          { path: "a/large1", status: "added", sizeBytes: 1000, contentHash: "LARGE" },
          { path: "a/large2", status: "added", sizeBytes: 1000, contentHash: "LARGE" },
        ],
      },
    ]),
  );

  assert.deepEqual(result.duplicates.map((group) => group.contentHash), ["LARGE", "SMALL"]);
});
