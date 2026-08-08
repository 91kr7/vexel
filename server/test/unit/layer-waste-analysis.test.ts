import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeLayerWaste, buildPathTimelines } from "../../src/image-analysis/layer-waste-analysis.js";
import type { ImageChangesets } from "../../src/image-analysis/changeset-service.js";

function changesets(layers: ImageChangesets["layers"]): ImageChangesets {
  return { imageId: "test-image", layers };
}

// layer-waste-analysis.md — buildPathTimelines collects every path's added/modified/deleted events
// across the image's layers, in build order.
test("buildPathTimelines collects every path's events across layers, in build order", () => {
  const result = buildPathTimelines(
    changesets([
      { layerIndex: 0, paths: [{ path: "app/config.yml", status: "added", sizeBytes: 100, contentHash: "H1" }] },
      { layerIndex: 1, paths: [{ path: "app/config.yml", status: "modified", sizeBytes: 50, contentHash: "H2" }, { path: "app/other.txt", status: "added", sizeBytes: 10 }] },
    ]),
  );

  assert.deepEqual(result.get("app/config.yml"), [
    { layerIndex: 0, status: "added", sizeBytes: 100, contentHash: "H1" },
    { layerIndex: 1, status: "modified", sizeBytes: 50, contentHash: "H2" },
  ]);
  assert.deepEqual(result.get("app/other.txt"), [{ layerIndex: 1, status: "added", sizeBytes: 10, contentHash: undefined }]);
});

// plan-docker_management_app/REQ-65 — a path overwritten by a later layer counts its earlier bytes
// as waste, naming the layer that wrote them and the layer that superseded them.
test("analyzeLayerWaste reports a path overwritten by a later layer as waste with reason 'overwritten'", () => {
  const result = analyzeLayerWaste(
    changesets([
      { layerIndex: 0, paths: [{ path: "app/config.yml", status: "added", sizeBytes: 100 }] },
      { layerIndex: 1, paths: [{ path: "app/config.yml", status: "modified", sizeBytes: 50 }] },
    ]),
  );

  assert.deepEqual(result.wastedFiles, [{ path: "app/config.yml", layerIndex: 0, sizeBytes: 100, supersededByLayerIndex: 1, reason: "overwritten" }]);
  assert.equal(result.totalWastedBytes, 100);
  assert.equal(result.totalBytesWritten, 150);
  assert.equal(result.efficiencyScore, 1 - 100 / 150);
});

// plan-docker_management_app/REQ-65 — a path deleted by a later layer counts its bytes as waste
// too, with reason 'deleted'; the deletion marker itself carries no bytes.
test("analyzeLayerWaste reports a path deleted by a later layer as waste with reason 'deleted'", () => {
  const result = analyzeLayerWaste(
    changesets([
      { layerIndex: 0, paths: [{ path: "app/tmp.log", status: "added", sizeBytes: 200 }] },
      { layerIndex: 1, paths: [{ path: "app/tmp.log", status: "deleted", sizeUnavailableReason: "the layer deletes this path" }] },
    ]),
  );

  assert.deepEqual(result.wastedFiles, [{ path: "app/tmp.log", layerIndex: 0, sizeBytes: 200, supersededByLayerIndex: 1, reason: "deleted" }]);
  assert.equal(result.totalWastedBytes, 200);
  assert.equal(result.totalBytesWritten, 200);
  assert.equal(result.efficiencyScore, 0);
});

// layer-waste-analysis.md — a path's last occurrence is never waste: it is either the live content
// still reachable in the final filesystem, or a deletion marker with no bytes to count.
test("analyzeLayerWaste never counts a path's only (last) occurrence as waste", () => {
  const result = analyzeLayerWaste(changesets([{ layerIndex: 0, paths: [{ path: "app/keep.txt", status: "added", sizeBytes: 64 }] }]));

  assert.deepEqual(result.wastedFiles, []);
  assert.equal(result.totalWastedBytes, 0);
  assert.equal(result.totalBytesWritten, 64);
  assert.equal(result.efficiencyScore, 1);
});

// layer-waste-analysis.md — wastedFiles is sorted by sizeBytes descending.
test("analyzeLayerWaste sorts wastedFiles by sizeBytes descending", () => {
  const result = analyzeLayerWaste(
    changesets([
      { layerIndex: 0, paths: [{ path: "app/small.txt", status: "added", sizeBytes: 10 }, { path: "app/large.txt", status: "added", sizeBytes: 1000 }] },
      { layerIndex: 1, paths: [{ path: "app/small.txt", status: "deleted", sizeUnavailableReason: "deleted" }, { path: "app/large.txt", status: "deleted", sizeUnavailableReason: "deleted" }] },
    ]),
  );

  assert.deepEqual(result.wastedFiles.map((file) => file.path), ["app/large.txt", "app/small.txt"]);
});

// layer-waste-analysis.md — efficiencyScore is 1 when totalBytesWritten is 0 (nothing was ever
// written with a known size, e.g. an image whose only changeset entries are deletions).
test("analyzeLayerWaste reports an efficiencyScore of 1 when no bytes were ever written", () => {
  const result = analyzeLayerWaste(changesets([]));

  assert.equal(result.totalBytesWritten, 0);
  assert.equal(result.wastedFiles.length, 0);
  assert.equal(result.efficiencyScore, 1);
});
