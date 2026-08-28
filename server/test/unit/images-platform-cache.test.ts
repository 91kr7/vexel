import { test, mock } from "node:test";
import assert from "node:assert/strict";

// The daemon stands in for itself here: what is under test is how many inspect
// calls a listing costs, so every call is counted per image id. Each test uses
// ids of its own, since what the service remembers about an id is meant to
// outlive the listing that established it.
let listBody = "[]";
const inspectBodies: Record<string, string> = {};
const inspectFailureIds = new Set<string>();
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
          if (inspectFailureIds.has(id)) throw new Error("inspect failed for this image");
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

function platformsOf(images: { id: string; platforms: string[] }[], id: string): string[] {
  const image = images.find((candidate) => candidate.id === id);
  assert.ok(image, `${id} is expected in the listing`);
  return image!.platforms;
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

// plan-docker_management_app-refresh_cache/REQ-3 — the variant is part of the value, and it survives being remembered
test("listImages keeps the variant in a remembered platform", async () => {
  const id = "sha256:variant";
  inspectBodies[id] = JSON.stringify({ Id: id, Os: "linux", Architecture: "arm64", Variant: "v8" });
  listBody = listing([id]);

  const first = await listImages();
  const second = await listImages();

  assert.deepEqual(first[0]!.platforms, ["linux/arm64/v8"]);
  assert.deepEqual(second[0]!.platforms, ["linux/arm64/v8"]);
  assert.equal(inspectCounts.get(id), 1);
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

// plan-docker_management_app-refresh_cache/REQ-2, plan-docker_management_app-refresh_cache/REQ-3 —
// an inspect that fails outright degrades to an empty platform list for that
// image, and is retried rather than remembered as blank.
test("listImages inspects again an image whose inspect call failed, without failing the listing", async () => {
  const id = "sha256:inspect-failure";
  inspectFailureIds.add(id);
  listBody = listing([id]);

  try {
    const first = await listImages();
    const second = await listImages();

    assert.deepEqual(first[0]!.platforms, []);
    assert.deepEqual(second[0]!.platforms, []);
    assert.equal(inspectCounts.get(id), 2, "a failed inspect is expected to be attempted again on the next listing");
  } finally {
    inspectFailureIds.delete(id);
  }
});

// plan-docker_management_app-refresh_cache/REQ-2 — what is remembered belongs to
// one image identity: a listing inspects the ids it does not know yet, and only
// those.
test("listImages inspects only the image it does not know yet when the list holds both", async () => {
  const known = "sha256:mixed-known";
  const added = "sha256:mixed-added";
  inspectBodies[known] = JSON.stringify({ Id: known, Os: "linux", Architecture: "amd64" });
  inspectBodies[added] = JSON.stringify({ Id: added, Os: "linux", Architecture: "arm64" });

  listBody = listing([known]);
  await listImages();

  listBody = listing([known, added]);
  const second = await listImages();

  assert.equal(inspectCounts.get(known), 1, "the image already known is expected to cost no second inspect call");
  assert.equal(inspectCounts.get(added), 1, "the image seen for the first time is expected to be inspected");
  assert.deepEqual(platformsOf(second, known), ["linux/amd64"]);
  assert.deepEqual(platformsOf(second, added), ["linux/arm64"]);
});

// plan-docker_management_app-refresh_cache/REQ-2, plan-docker_management_app-refresh_cache/REQ-3 —
// images-service.md: the platform is empty when the daemon does not report an
// OS/architecture, so a half-reported one is not a resolved value and must not
// be remembered as one.
test("listImages leaves the platform empty and looks it up again when the daemon reports only half of it", async () => {
  const id = "sha256:half-reported";
  inspectBodies[id] = JSON.stringify({ Id: id, Os: "linux" });
  listBody = listing([id]);

  const first = await listImages();
  const second = await listImages();

  assert.deepEqual(first[0]!.platforms, []);
  assert.deepEqual(second[0]!.platforms, []);
  assert.equal(inspectCounts.get(id), 2, "a platform that could not be formed is expected to be looked up again");
});
