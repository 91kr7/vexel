import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DockerDaemonError } from "../../src/docker/errors.js";

// The service talks to the daemon only through the shared EngineClient: the
// mock stands in for it, so manifest/history assembly is the only behaviour
// under test here. The fixtures below reproduce the shape the real Engine
// API returns (verified against a running daemon): `RootFS.Layers` lists
// diff ids oldest/base layer first, while `/history` lists build steps
// newest layer first (the opposite order).
let inspectBody = "{}";
let historyBody = "[]";
let requestFailure: Error | undefined;

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string) => {
        if (requestFailure) throw requestFailure;
        if (/^\/images\/[^/]+\/json$/.test(path)) return { statusCode: 200, body: inspectBody };
        if (/^\/images\/[^/]+\/history$/.test(path)) return { statusCode: 200, body: historyBody };
        throw new Error(`unexpected path: ${path}`);
      },
    }),
  },
});

const { getImageLayerStack } = await import("../../src/image-analysis/layer-metadata-service.js");

beforeEach(() => {
  inspectBody = "{}";
  historyBody = "[]";
  requestFailure = undefined;
});

// layer-metadata-service.md — RootFS.Layers is oldest/base layer first, but the daemon's own
// /history is newest layer first: a real running image (verified independently against a live
// daemon) confirms this. index — position in build order (oldest/base first).
test("getImageLayerStack returns the stack oldest/base layer first, matching each step to its own diff id in build order", async () => {
  inspectBody = JSON.stringify({
    RootFS: { Layers: ["sha256:base-layer", "sha256:mid-layer", "sha256:top-layer"] },
  });
  // The daemon's own history order: newest (top) layer first.
  historyBody = JSON.stringify([
    { CreatedBy: "/bin/sh -c #(nop)  CMD [\"app\"]", Size: 0 },
    { CreatedBy: "/bin/sh -c #(nop) COPY file:abc in /app", Size: 3000 },
    { CreatedBy: "/bin/sh -c apt-get install -y curl", Size: 2000 },
    { CreatedBy: "/bin/sh -c #(nop) ADD file:def in /", Size: 1000 },
  ]);

  const stack = await getImageLayerStack("image-1");

  assert.equal(stack.layers.length, 4);
  // Oldest/base step (ADD, the smallest/earliest build step) comes first.
  assert.equal(stack.layers[0]!.command, "/bin/sh -c #(nop) ADD file:def in /");
  assert.equal(stack.layers[0]!.diffId, "sha256:base-layer");
  assert.equal(stack.layers[0]!.uncompressedSizeBytes, 1000);
  assert.equal(stack.layers[1]!.command, "/bin/sh -c apt-get install -y curl");
  assert.equal(stack.layers[1]!.diffId, "sha256:mid-layer");
  assert.equal(stack.layers[2]!.command, "/bin/sh -c #(nop) COPY file:abc in /app");
  assert.equal(stack.layers[2]!.diffId, "sha256:top-layer");
  // Newest step (CMD, empty) comes last and carries no diff id — its command text is still
  // reported, though, since the daemon did record it (emptiness affects diffId, not command).
  assert.equal(stack.layers[3]!.command, "/bin/sh -c #(nop)  CMD [\"app\"]");
  assert.equal(stack.layers[3]!.diffId, undefined);
});

// layer-metadata-service.md — emptyLayer is true when the step's Size is 0
test("getImageLayerStack marks a zero-size history step as an empty layer", async () => {
  inspectBody = JSON.stringify({ RootFS: { Layers: ["sha256:only-layer"] } });
  historyBody = JSON.stringify([
    { CreatedBy: "/bin/sh -c #(nop)  ENV FOO=bar", Size: 0 },
    { CreatedBy: "/bin/sh -c #(nop) ADD file:abc in /", Size: 500 },
  ]);

  const stack = await getImageLayerStack("image-1");

  const empty = stack.layers.find((layer) => layer.command === "/bin/sh -c #(nop)  ENV FOO=bar");
  const nonEmpty = stack.layers.find((layer) => layer.command === "/bin/sh -c #(nop) ADD file:abc in /");
  assert.equal(empty!.emptyLayer, true);
  assert.equal(nonEmpty!.emptyLayer, false);
});

// layer-metadata-service.md — compressedSizeBytes is always undefined for a locally stored image,
// with compressedSizeUnavailableReason explaining why (REQ-48): the local Engine API's inspect and
// history responses carry only the uncompressed diff size, never a compressed one, for a pulled
// image as much as a locally built one.
test("getImageLayerStack always reports the compressed size as unavailable with a reason", async () => {
  inspectBody = JSON.stringify({ RootFS: { Layers: ["sha256:only-layer"] } });
  historyBody = JSON.stringify([{ CreatedBy: "/bin/sh -c #(nop) ADD file:abc in /", Size: 500 }]);

  const stack = await getImageLayerStack("image-1");

  assert.equal(stack.layers[0]!.compressedSizeBytes, undefined);
  assert.ok(stack.layers[0]!.compressedSizeUnavailableReason && stack.layers[0]!.compressedSizeUnavailableReason.length > 0);
});

// layer-metadata-service.md — an empty layer carries no diff id, with a reason explaining why
test("getImageLayerStack explains an empty layer's missing diff id", async () => {
  inspectBody = JSON.stringify({ RootFS: { Layers: [] } });
  historyBody = JSON.stringify([{ CreatedBy: "/bin/sh -c #(nop)  EXPOSE 80/tcp", Size: 0 }]);

  const stack = await getImageLayerStack("image-1");

  assert.equal(stack.layers[0]!.diffId, undefined);
  assert.match(stack.layers[0]!.diffIdUnavailableReason ?? "", /empty/i);
});

// layer-metadata-service.md — the manifest reporting fewer diff ids than non-empty steps is explained too
test("getImageLayerStack explains a missing diff id when the manifest reports fewer layers than non-empty steps", async () => {
  inspectBody = JSON.stringify({ RootFS: { Layers: [] } });
  historyBody = JSON.stringify([{ CreatedBy: "/bin/sh -c #(nop) ADD file:abc in /", Size: 500 }]);

  const stack = await getImageLayerStack("image-1");

  assert.equal(stack.layers[0]!.diffId, undefined);
  assert.match(stack.layers[0]!.diffIdUnavailableReason ?? "", /fewer/i);
});

// layer-metadata-service.md — a step with no recorded command text is UNKNOWN, with a reason
test("getImageLayerStack reports UNKNOWN with a reason when the daemon recorded no command text", async () => {
  inspectBody = JSON.stringify({ RootFS: { Layers: [] } });
  historyBody = JSON.stringify([{ CreatedBy: "", Size: 0 }]);

  const stack = await getImageLayerStack("image-1");

  assert.equal(stack.layers[0]!.instruction, "UNKNOWN");
  assert.ok(stack.layers[0]!.commandUnavailableReason);
});

// layer-metadata-service.md — every call rejects with a DockerDaemonError carrying the daemon's own message on failure
test("getImageLayerStack rejects with the daemon's own error message on failure", async () => {
  requestFailure = new DockerDaemonError("DaemonRejected", "server error - please retry");

  await assert.rejects(() => getImageLayerStack("image-1"), /server error - please retry/);
});
