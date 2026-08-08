import { test } from "node:test";
import assert from "node:assert/strict";
import { scanForSecretPaths } from "../../src/image-analysis/secret-pattern-scan.js";
import type { ImageChangesets } from "../../src/image-analysis/changeset-service.js";

function changesets(layers: ImageChangesets["layers"]): ImageChangesets {
  return { imageId: "test-image", layers };
}

// plan-docker_management_app/REQ-67 — a credential/secret-looking path never deleted is reported
// once, naming the introducing layer, with no removedLayerIndex.
test("scanForSecretPaths flags a secret-looking path that is never deleted, with no removedLayerIndex", () => {
  const result = scanForSecretPaths(changesets([{ layerIndex: 2, paths: [{ path: ".env", status: "added" }] }]));

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]!.path, ".env");
  assert.equal(result.findings[0]!.introducedLayerIndex, 2);
  assert.equal(result.findings[0]!.removedLayerIndex, undefined);
  assert.equal(typeof result.findings[0]!.patternName, "string");
  assert.ok(result.findings[0]!.patternName.length > 0);
});

// plan-docker_management_app/REQ-67 — a secret-looking path deleted by a later layer is still
// flagged (present in the layer history though absent from the final filesystem), naming both the
// introducing and the removing layer.
test("scanForSecretPaths flags a secret-looking path deleted by a later layer, naming both layers", () => {
  const result = scanForSecretPaths(
    changesets([
      { layerIndex: 0, paths: [{ path: "root/.npmrc", status: "added" }] },
      { layerIndex: 3, paths: [{ path: "root/.npmrc", status: "deleted", sizeUnavailableReason: "deleted" }] },
    ]),
  );

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]!.path, "root/.npmrc");
  assert.equal(result.findings[0]!.introducedLayerIndex, 0);
  assert.equal(result.findings[0]!.removedLayerIndex, 3);
});

// secret-pattern-scan.md — matching is against the path only; an ordinary path matching no
// convention is never flagged.
test("scanForSecretPaths does not flag an ordinary path matching no secret/credential convention", () => {
  const result = scanForSecretPaths(changesets([{ layerIndex: 0, paths: [{ path: "app/index.js", status: "added" }] }]));

  assert.deepEqual(result.findings, []);
});

// secret-pattern-scan.md — a matching path added, then deleted, then re-added is flagged for its
// own occurrence: two distinct findings for the same path.
test("scanForSecretPaths reports a matching path added, deleted then re-added as two distinct findings", () => {
  const result = scanForSecretPaths(
    changesets([
      { layerIndex: 0, paths: [{ path: "config/id_rsa", status: "added" }] },
      { layerIndex: 1, paths: [{ path: "config/id_rsa", status: "deleted", sizeUnavailableReason: "deleted" }] },
      { layerIndex: 2, paths: [{ path: "config/id_rsa", status: "added" }] },
    ]),
  );

  assert.equal(result.findings.length, 2);
  const removed = result.findings.find((finding) => finding.removedLayerIndex !== undefined);
  const surviving = result.findings.find((finding) => finding.removedLayerIndex === undefined);
  assert.ok(removed, "expected one finding for the introduced-then-removed occurrence");
  assert.equal(removed!.introducedLayerIndex, 0);
  assert.equal(removed!.removedLayerIndex, 1);
  assert.ok(surviving, "expected one finding for the re-added occurrence");
  assert.equal(surviving!.introducedLayerIndex, 2);
});

// secret-pattern-scan.md — LayerSecretScan.findings is sorted by path.
test("scanForSecretPaths sorts findings by path", () => {
  const result = scanForSecretPaths(
    changesets([{ layerIndex: 0, paths: [{ path: "zzz/.env", status: "added" }, { path: "aaa/.npmrc", status: "added" }] }]),
  );

  assert.deepEqual(result.findings.map((finding) => finding.path), ["aaa/.npmrc", "zzz/.env"]);
});
