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

const { listImages, getImageInspect } = await import("../../src/images/images-service.js");

beforeEach(() => {
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
