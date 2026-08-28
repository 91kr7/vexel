import { test, mock } from "node:test";
import assert from "node:assert/strict";

let listBody = "[]";
const inspectBodies: Record<string, string> = {};
const inspectCounts = new Map<string, number>();

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string) => {
        if (path.startsWith("/images/json")) return { statusCode: 200, body: listBody };
        const inspectMatch = path.match(/^\/images\/([^/]+)\/json$/);
        if (inspectMatch) {
          const id = inspectMatch[1]!;
          inspectCounts.set(id, (inspectCounts.get(id) ?? 0) + 1);
          return { statusCode: 200, body: inspectBodies[id] ?? "{}" };
        }
        throw new Error(`unexpected path: ${path}`);
      },
    }),
  },
});

const { listImages } = await import("../../src/images/images-service.js");

function listing(ids: string[]): string {
  return JSON.stringify(ids.map((id) => ({ Id: id, RepoTags: [`${id}:1`], Created: 1_700_000_000, Size: 10 })));
}

// plan-docker_management_app-refresh_cache/REQ-2, plan-docker_management_app-refresh_cache/REQ-3
test("listImages inspects an image whose platform it already knows only the first time, reporting the same platform", async () => {
  const id = "sha256:known";
  inspectBodies[id] = JSON.stringify({ Id: id, Os: "linux", Architecture: "amd64" });
  listBody = listing([id]);

  const first = await listImages();
  const second = await listImages();

  assert.deepEqual(first[0]!.platforms, ["linux/amd64"]);
  assert.deepEqual(second[0]!.platforms, ["linux/amd64"]);
  assert.equal(inspectCounts.get(id), 1, "a platform already known is expected to cost no further inspect call");
});

// plan-docker_management_app-refresh_cache/REQ-2, plan-docker_management_app-refresh_cache/REQ-3
test("listImages inspects again an image whose platform it could not determine, leaving its platform list empty", async () => {
  const id = "sha256:unresolved";
  inspectBodies[id] = "{}";
  listBody = listing([id]);

  const first = await listImages();
  const second = await listImages();

  assert.deepEqual(first[0]!.platforms, []);
  assert.deepEqual(second[0]!.platforms, []);
  assert.equal(inspectCounts.get(id), 2, "an unresolved platform is expected to be looked up again on the next listing");
});
