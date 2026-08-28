import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DockerDaemonError } from "../../src/docker/errors.js";

// The service talks to the daemon only through the shared EngineClient: the
// mock stands in for it, so tag filtering, digest shortening and the
// per-image platform lookup are the only behaviours under test here.
let listBody = "[]";
let inspectBodies: Record<string, string> = {};
let historyBody = "[]";
let inspectFailureIds = new Set<string>();
let listFailure: Error | undefined;

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string) => {
        if (path.startsWith("/images/json")) {
          if (listFailure) throw listFailure;
          return { statusCode: 200, body: listBody };
        }
        const inspectMatch = path.match(/^\/images\/([^/]+)\/json$/);
        if (inspectMatch) {
          const id = inspectMatch[1];
          if (inspectFailureIds.has(id)) throw new Error("inspect failed for this image");
          return { statusCode: 200, body: inspectBodies[id] ?? "{}" };
        }
        const historyMatch = path.match(/^\/images\/([^/]+)\/history$/);
        if (historyMatch) {
          return { statusCode: 200, body: historyBody };
        }
        throw new Error(`unexpected path: ${path}`);
      },
    }),
  },
});

const { listImages, getImageInspect, resetImagePlatformCache } = await import("../../src/images/images-service.js");

beforeEach(() => {
  // A platform resolved here outlives the test that resolved it (REQ-2), and
  // several tests below share the id sha256:abc.
  resetImagePlatformCache();
  listBody = "[]";
  inspectBodies = {};
  historyBody = "[]";
  inspectFailureIds = new Set();
  listFailure = undefined;
});

// images-service.md — tags never contains the daemon's dangling-image placeholder
test("listImages filters out the daemon's <none>:<none> placeholder, keeping real tags", async () => {
  listBody = JSON.stringify([
    { Id: "sha256:abc", RepoTags: ["myrepo/app:1.0", "<none>:<none>"], Created: 1_700_000_000, Size: 1234 },
  ]);
  inspectBodies["sha256:abc"] = JSON.stringify({ Id: "sha256:abc", Os: "linux", Architecture: "amd64" });

  const images = await listImages();

  assert.deepEqual(images[0]!.tags, ["myrepo/app:1.0"]);
});

// images-service.md — dangling (untagged) image has an empty tags array
test("listImages reports an empty tags array for a dangling image", async () => {
  listBody = JSON.stringify([{ Id: "sha256:dangling", RepoTags: ["<none>:<none>"], Created: 1_700_000_000, Size: 10 }]);
  inspectBodies["sha256:dangling"] = "{}";

  const images = await listImages();

  assert.deepEqual(images[0]!.tags, []);
});

// images-service.md — digest is the first RepoDigest shortened to algorithm:first-12-hex-chars
test("listImages shortens the first RepoDigest to algorithm:12-hex-chars", async () => {
  listBody = JSON.stringify([
    {
      Id: "sha256:abc",
      RepoTags: ["myrepo/app:1.0"],
      RepoDigests: ["myrepo/app@sha256:0123456789abcdefabcdef0123456789abcdefabcdefabcdefabcdefabcdef01"],
      Created: 1_700_000_000,
      Size: 10,
    },
  ]);
  inspectBodies["sha256:abc"] = "{}";

  const images = await listImages();

  assert.equal(images[0]!.digest, "sha256:0123456789ab");
});

// images-service.md — digest is undefined when the image has no RepoDigest (never pulled from/pushed to a registry)
test("listImages leaves digest undefined when the image has no RepoDigests", async () => {
  listBody = JSON.stringify([{ Id: "sha256:local", RepoTags: ["local/app:dev"], Created: 1_700_000_000, Size: 10 }]);
  inspectBodies["sha256:local"] = "{}";

  const images = await listImages();

  assert.equal(images[0]!.digest, undefined);
});

// images-service.md — createdAt is an ISO-8601 instant derived from the daemon's Unix-seconds Created field
test("listImages converts the daemon's Unix-seconds Created field to an ISO-8601 instant", async () => {
  listBody = JSON.stringify([{ Id: "sha256:abc", RepoTags: ["a:b"], Created: 1_700_000_000, Size: 10 }]);
  inspectBodies["sha256:abc"] = "{}";

  const images = await listImages();

  assert.equal(images[0]!.createdAt, new Date(1_700_000_000 * 1000).toISOString());
});

// images-service.md — platforms degrades to an empty list for one image's inspect failure rather than failing the whole listing
test("listImages degrades to an empty platform list when one image's own inspect call fails, without failing the listing", async () => {
  listBody = JSON.stringify([
    { Id: "sha256:ok", RepoTags: ["ok:latest"], Created: 1_700_000_000, Size: 10 },
    { Id: "sha256:broken", RepoTags: ["broken:latest"], Created: 1_700_000_000, Size: 10 },
  ]);
  inspectBodies["sha256:ok"] = JSON.stringify({ Os: "linux", Architecture: "arm64" });
  inspectFailureIds = new Set(["sha256:broken"]);

  const images = await listImages();

  assert.deepEqual(images.find((image) => image.id === "sha256:ok")!.platforms, ["linux/arm64"]);
  assert.deepEqual(images.find((image) => image.id === "sha256:broken")!.platforms, []);
});

// images-service.md — every call rejects with a DockerDaemonError carrying the daemon's own message on failure
test("listImages rejects with the daemon's own error message on failure", async () => {
  listFailure = new DockerDaemonError("DaemonRejected", "server error - please retry");

  await assert.rejects(() => listImages(), /server error - please retry/);
});

interface RawImageFixture {
  Id: string;
  RepoTags: string[];
  RepoDigests?: string[];
  Created: number;
  Size: number;
}

const DEFAULT_CREATED = 1_700_000_000;

function image(id: string, options: { tags?: string[]; digests?: string[]; created?: number } = {}): RawImageFixture {
  const fixture: RawImageFixture = {
    Id: id,
    // The daemon's own placeholder for a row carrying no tag.
    RepoTags: options.tags ?? ["<none>:<none>"],
    Created: options.created ?? DEFAULT_CREATED,
    Size: 10,
  };
  if (options.digests !== undefined) fixture.RepoDigests = options.digests;
  return fixture;
}

/** Tags and id together: the id is what the order of the dangling block falls back to, so an assertion that ignores it cannot see the tiebreak. */
function sequenceOf(images: { tags: string[]; id: string }[]): string[] {
  return images.map((entry) => `${entry.tags.join(",") || "<none>"}#${entry.id}`);
}

async function listFrom(payload: RawImageFixture[]): Promise<string[]> {
  listBody = JSON.stringify(payload);
  return sequenceOf(await listImages());
}

// images-service.md — "tags ... Ordered lowest first under the list-order rule, the repository
// compared before the tag ... and the order does not depend on the order the daemon returned
// RepoTags in" (REQ-18, REQ-19)
test("listImages orders a row's own tags lowest first, whichever order the daemon returned RepoTags in", async () => {
  const supplied = ["nginx:latest", "alpine:3.20", "nginx:1.25"];
  const expected = ["alpine:3.20", "nginx:1.25", "nginx:latest"];

  listBody = JSON.stringify([image("sha256:multi", { tags: supplied })]);
  const forwards = await listImages();
  listBody = JSON.stringify([image("sha256:multi", { tags: [...supplied].reverse() })]);
  const backwards = await listImages();

  assert.deepEqual(forwards[0]!.tags, expected);
  assert.deepEqual(backwards[0]!.tags, expected);
});

// images-service.md — "a tagged image sorts by its lowest tag ... repository compared before tag, so
// every tag of one repository stays together" (REQ-17)
test("listImages keeps every tag of one repository together and orders the tags within it", async () => {
  const sequence = await listFrom([
    image("sha256:a", { tags: ["nginx:latest"] }),
    image("sha256:b", { tags: ["alpine:3.20"] }),
    image("sha256:c", { tags: ["nginx:1.25"] }),
    image("sha256:d", { tags: ["alpine:3.9"] }),
  ]);

  assert.deepEqual(sequence, ["alpine:3.9#sha256:d", "alpine:3.20#sha256:b", "nginx:1.25#sha256:c", "nginx:latest#sha256:a"]);
});

// images-service.md — "sorts by its lowest tag — the head of the ordered tags above, never the first
// tag the daemon returned" (REQ-18): keying on the daemon's first tag would move the row when the
// daemon returns the same tags the other way round.
test("listImages keys a multi-tag image on its lowest tag, whichever order the daemon returned RepoTags in", async () => {
  const supplied = ["zeta:1", "beta:1"];
  const expected = ["alpha:1#sha256:a", "beta:1,zeta:1#sha256:m", "gamma:1#sha256:g"];

  const forwards = await listFrom([
    image("sha256:a", { tags: ["alpha:1"] }),
    image("sha256:m", { tags: supplied }),
    image("sha256:g", { tags: ["gamma:1"] }),
  ]);
  const backwards = await listFrom([
    image("sha256:a", { tags: ["alpha:1"] }),
    image("sha256:m", { tags: [...supplied].reverse() }),
    image("sha256:g", { tags: ["gamma:1"] }),
  ]);

  assert.deepEqual(forwards, expected);
  assert.deepEqual(backwards, expected);
});

// images-service.md — "an image with no tag but a digest reference sorts among the named ones, under
// the repository of that reference ... taken as the lowest of them when there are several; it sorts
// before the tagged images of that same repository", "the emitted fields are unchanged by any of
// this: digest is still the first RepoDigest shortened" (REQ-20)
test("listImages sorts a digest-only image under the lowest repository of its RepoDigests, leaving the emitted digest untouched", async () => {
  const firstDigest = "a".repeat(64);
  const lowestRepositoryDigest = "b".repeat(64);
  listBody = JSON.stringify([
    image("sha256:alpine", { tags: ["alpine:3.20"] }),
    image("sha256:bydigest", {
      digests: [`zzz/app@sha256:${firstDigest}`, `nginx@sha256:${lowestRepositoryDigest}`],
    }),
    image("sha256:nginx", { tags: ["nginx:1.25"] }),
  ]);

  const images = await listImages();

  assert.deepEqual(sequenceOf(images), ["alpine:3.20#sha256:alpine", "<none>#sha256:bydigest", "nginx:1.25#sha256:nginx"]);
  assert.equal(images[1]!.digest, `sha256:${firstDigest.slice(0, 12)}`);
  assert.deepEqual(images[1]!.tags, []);
});

// images-service.md — the named block ends on "the image's id as the final comparison" (REQ-5): two
// tags the name comparison calls equal — it ignores case — are separated by the images' own ids.
test("listImages separates two images whose lowest tags differ only in case by their ids, both ways round", async () => {
  const upper = image("sha256:b", { tags: ["app:V1"] });
  const lower = image("sha256:a", { tags: ["app:v1"] });
  const expected = ["app:v1#sha256:a", "app:V1#sha256:b"];

  const forwards = await listFrom([upper, lower]);
  const backwards = await listFrom([lower, upper]);

  assert.deepEqual(forwards, expected);
  assert.deepEqual(backwards, expected);
});

// images-service.md — "a dangling image (no tag and no digest reference) joins one block after every
// named image, newest first by createdAt, with the image's id as the final comparison — so two
// dangling images sharing a creation instant ... are still ordered identically on every read"
// (REQ-21)
test("listImages groups dangling images after every named one, newest first, sharing instants separated by id", async () => {
  const payload = [
    image("sha256:d2", { created: 1_700_000_100 }),
    image("sha256:d3", { created: 1_700_000_200 }),
    image("sha256:alpine", { tags: ["alpine:3.20"], created: 1_600_000_000 }),
    image("sha256:d1", { created: 1_700_000_200 }),
  ];
  const expected = ["alpine:3.20#sha256:alpine", "<none>#sha256:d1", "<none>#sha256:d3", "<none>#sha256:d2"];

  const forwards = await listFrom(payload);
  const backwards = await listFrom([...payload].reverse());

  assert.deepEqual(forwards, expected);
  assert.deepEqual(backwards, expected);
});

// images-service.md — "The same images produce the same sequence on every read, whatever order the
// daemon supplied them — or their RepoTags — in" (REQ-6, REQ-22): the only check that detects a
// missing tiebreak, since a sort that is stable keeps whatever the payload happened to say.
test("listImages produces one sequence whichever order the daemon supplied the images in", async () => {
  const payload = [
    image("sha256:dangling-b", { created: 1_700_000_300 }),
    image("sha256:nginx-latest", { tags: ["nginx:latest"] }),
    image("sha256:app-10", { tags: ["repo/app:10"] }),
    image("sha256:bydigest", { digests: [`nginx@sha256:${"c".repeat(64)}`] }),
    image("sha256:dangling-a", { created: 1_700_000_300 }),
    image("sha256:app-2", { tags: ["repo/app:2"] }),
    image("sha256:nginx-125", { tags: ["nginx:1.25"] }),
  ];
  const expected = [
    "<none>#sha256:bydigest",
    "nginx:1.25#sha256:nginx-125",
    "nginx:latest#sha256:nginx-latest",
    "repo/app:2#sha256:app-2",
    "repo/app:10#sha256:app-10",
    "<none>#sha256:dangling-a",
    "<none>#sha256:dangling-b",
  ];

  const forwards = await listFrom(payload);
  const backwards = await listFrom([...payload].reverse());

  assert.deepEqual(forwards, expected);
  assert.deepEqual(backwards, expected);
});

// images-service.md — entrypoint/command default to an empty array when unset
test("getImageInspect defaults entrypoint and command to an empty array when the image sets neither", async () => {
  inspectBodies["sha256:abc"] = JSON.stringify({ Id: "sha256:abc", Created: "2024-01-01T00:00:00Z", Size: 10, Config: {} });

  const inspect = await getImageInspect("sha256:abc");

  assert.deepEqual(inspect.entrypoint, []);
  assert.deepEqual(inspect.command, []);
});

// images-service.md — exposedPorts is the keys of Config.ExposedPorts
test("getImageInspect returns the exposed ports as the keys of Config.ExposedPorts", async () => {
  inspectBodies["sha256:abc"] = JSON.stringify({
    Id: "sha256:abc",
    Created: "2024-01-01T00:00:00Z",
    Size: 10,
    Config: { ExposedPorts: { "80/tcp": {}, "443/tcp": {} } },
  });

  const inspect = await getImageInspect("sha256:abc");

  assert.deepEqual(inspect.exposedPorts.sort(), ["443/tcp", "80/tcp"]);
});

// images-service.md — history is one entry per recorded build step, oldest first exactly as the daemon returns it,
// with emptyLayer true when the step added no data
test("getImageInspect maps history oldest-first, marking a zero-size step as an empty layer", async () => {
  inspectBodies["sha256:abc"] = JSON.stringify({ Id: "sha256:abc", Created: "2024-01-01T00:00:00Z", Size: 10, Config: {} });
  historyBody = JSON.stringify([
    { Created: 1_700_000_000, CreatedBy: "FROM scratch", Size: 0 },
    { Created: 1_700_000_100, CreatedBy: "COPY app /app", Size: 512 },
  ]);

  const inspect = await getImageInspect("sha256:abc");

  assert.equal(inspect.history.length, 2);
  assert.equal(inspect.history[0]!.createdBy, "FROM scratch");
  assert.equal(inspect.history[0]!.emptyLayer, true);
  assert.equal(inspect.history[1]!.createdBy, "COPY app /app");
  assert.equal(inspect.history[1]!.emptyLayer, false);
});

// images-service.md — the raw payload is exactly the inspect response as received, unmodified
test("getImageInspect carries the raw payload exactly as received", async () => {
  const raw = { Id: "sha256:abc", Created: "2024-01-01T00:00:00Z", Size: 10, Config: {}, SomeExtraDaemonField: "kept as-is" };
  inspectBodies["sha256:abc"] = JSON.stringify(raw);

  const inspect = await getImageInspect("sha256:abc");

  assert.deepEqual(inspect.raw, raw);
});

// images-service.md — every call rejects with a DockerDaemonError carrying the daemon's own message on failure
test("getImageInspect rejects with the daemon's own error message on failure", async () => {
  inspectFailureIds = new Set(["sha256:missing"]);

  await assert.rejects(() => getImageInspect("sha256:missing"), /inspect failed for this image/);
});
