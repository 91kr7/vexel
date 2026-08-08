import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { ImageSummary } from "../../src/images/images-service.js";

// The service talks to the daemon only through the shared EngineClient, and
// to the rest of the local image list through ImagesService: both are
// mocked, so the diff-id matching/exclusion rules are the only behaviour
// under test here.
let listImagesResult: ImageSummary[] = [];
let listImagesFailure: Error | undefined;
let inspectBodies: Record<string, string> = {};
let inspectFailureIds = new Set<string>();
const inspectRequests: string[] = [];

function summary(id: string, tags: string[]): ImageSummary {
  return { id, shortId: id.slice(0, 12), tags, digest: undefined, platforms: [], sizeBytes: 0, createdAt: "2024-01-01T00:00:00.000Z" };
}

mock.module(new URL("../../src/images/images-service.ts", import.meta.url).href, {
  namedExports: {
    listImages: async () => {
      if (listImagesFailure) throw listImagesFailure;
      return listImagesResult;
    },
  },
});

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string) => {
        const match = path.match(/^\/images\/([^/]+)\/json$/);
        if (!match) throw new Error(`unexpected path: ${path}`);
        const id = match[1]!;
        inspectRequests.push(id);
        if (inspectFailureIds.has(id)) throw new Error("inspect failed for this image");
        return { statusCode: 200, body: inspectBodies[id] ?? "{}" };
      },
    }),
  },
});

const { getSharedLayerImages } = await import("../../src/image-analysis/shared-layer-service.js");

beforeEach(() => {
  listImagesResult = [];
  listImagesFailure = undefined;
  inspectBodies = {};
  inspectFailureIds = new Set();
  inspectRequests.length = 0;
});

// shared-layer-service.md — one entry per requested diff id, listing every other local image
// whose own RootFS.Layers contains it
test("getSharedLayerImages lists another local image that references the same diff id", async () => {
  listImagesResult = [summary("sha256:target", ["target:latest"]), summary("sha256:other", ["other:latest"])];
  inspectBodies["sha256:other"] = JSON.stringify({ RootFS: { Layers: ["sha256:shared-diff"] } });

  const result = await getSharedLayerImages("sha256:target", ["sha256:shared-diff"]);

  assert.deepEqual(result["sha256:shared-diff"], [{ id: "sha256:other", tags: ["other:latest"] }]);
});

// shared-layer-service.md — an empty array when no other image shares it
test("getSharedLayerImages reports an empty array for a diff id no other image references", async () => {
  listImagesResult = [summary("sha256:target", ["target:latest"]), summary("sha256:other", ["other:latest"])];
  inspectBodies["sha256:other"] = JSON.stringify({ RootFS: { Layers: ["sha256:unrelated-diff"] } });

  const result = await getSharedLayerImages("sha256:target", ["sha256:shared-diff"]);

  assert.deepEqual(result["sha256:shared-diff"], []);
});

// shared-layer-service.md — imageId itself is never listed as one of its own layers' sharing images
test("getSharedLayerImages never lists the requesting image itself as a sharer", async () => {
  listImagesResult = [summary("sha256:target", ["target:latest"])];
  inspectBodies["sha256:target"] = JSON.stringify({ RootFS: { Layers: ["sha256:own-diff"] } });

  const result = await getSharedLayerImages("sha256:target", ["sha256:own-diff"]);

  assert.deepEqual(result["sha256:own-diff"], []);
  assert.ok(!inspectRequests.includes("sha256:target"), "the requesting image's own inspect should never be queried");
});

// shared-layer-service.md — an image whose own inspect call fails is treated as sharing nothing rather than failing the whole lookup
test("getSharedLayerImages degrades one image's inspect failure to sharing nothing, without failing the whole lookup", async () => {
  listImagesResult = [
    summary("sha256:target", ["target:latest"]),
    summary("sha256:broken", ["broken:latest"]),
    summary("sha256:ok", ["ok:latest"]),
  ];
  inspectFailureIds = new Set(["sha256:broken"]);
  inspectBodies["sha256:ok"] = JSON.stringify({ RootFS: { Layers: ["sha256:shared-diff"] } });

  const result = await getSharedLayerImages("sha256:target", ["sha256:shared-diff"]);

  assert.deepEqual(result["sha256:shared-diff"], [{ id: "sha256:ok", tags: ["ok:latest"] }]);
});

// shared-layer-service.md — diffIds empty resolves immediately with an empty map, no daemon calls made
test("getSharedLayerImages makes no daemon calls and resolves an empty map when diffIds is empty", async () => {
  listImagesResult = [summary("sha256:other", ["other:latest"])];

  const result = await getSharedLayerImages("sha256:target", []);

  assert.deepEqual(result, {});
  assert.equal(inspectRequests.length, 0);
});
