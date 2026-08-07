import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";

// The service talks to the daemon only through the shared EngineClient: the
// mock records every request path/headers and hands out a controllable
// stream for the transfer endpoints, which is the only place the service's
// own behaviour (reference parsing, NDJSON decoding, cancellation) is
// observable.
interface RecordedRequest {
  path: string;
  method?: string;
}
interface RecordedStreamRequest {
  path: string;
  method?: string;
  headers?: Record<string, string>;
}
let requests: RecordedRequest[] = [];
let streamRequests: RecordedStreamRequest[] = [];
let currentStream: PassThrough | undefined;
let requestBody = "{}";

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string, options: { method?: string } = {}) => {
        requests.push({ path, method: options.method });
        return { statusCode: 200, body: requestBody };
      },
      requestStream: async (path: string, options: { method?: string; headers?: Record<string, string> } = {}) => {
        streamRequests.push({ path, method: options.method, headers: options.headers });
        currentStream = new PassThrough();
        return currentStream;
      },
    }),
  },
});

const { pullImage, pushImage, tagImage, untagImage, removeImage, pruneDanglingImages } = await import(
  "../../src/images/image-transfer-service.js"
);

beforeEach(() => {
  requests = [];
  streamRequests = [];
  currentStream = undefined;
  requestBody = "{}";
});

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function noopHandlers() {
  return { onStep: () => undefined, onError: () => undefined, onEnd: () => undefined };
}

// image-transfer-service.md — reference `repo:tag` maps to fromImage/tag query params
test("pullImage requests /images/create with fromImage and tag parsed from a repo:tag reference", async () => {
  await pullImage("myrepo/app:1.0", undefined, noopHandlers());

  const call = streamRequests[0]!;
  assert.match(call.path, /^\/images\/create\?/);
  const query = new URLSearchParams(call.path.split("?")[1]);
  assert.equal(query.get("fromImage"), "myrepo/app");
  assert.equal(query.get("tag"), "1.0");
});

// image-transfer-service.md — defaults to tag `latest` when the reference has neither a tag nor a digest
test("pullImage defaults the tag to latest when the reference has no tag or digest", async () => {
  await pullImage("myrepo/app", undefined, noopHandlers());

  const query = new URLSearchParams(streamRequests[0]!.path.split("?")[1]);
  assert.equal(query.get("fromImage"), "myrepo/app");
  assert.equal(query.get("tag"), "latest");
});

// image-transfer-service.md — platform is omitted from the request when blank
test("pullImage omits the platform query parameter when platform is blank", async () => {
  await pullImage("myrepo/app:1.0", "  ", noopHandlers());

  const query = new URLSearchParams(streamRequests[0]!.path.split("?")[1]);
  assert.equal(query.has("platform"), false);
});

// image-transfer-service.md — platform is included when given
test("pullImage includes the platform query parameter when given", async () => {
  await pullImage("myrepo/app:1.0", "linux/arm64", noopHandlers());

  const query = new URLSearchParams(streamRequests[0]!.path.split("?")[1]);
  assert.equal(query.get("platform"), "linux/arm64");
});

// image-transfer-service.md — push sends an anonymous X-Registry-Auth header (real per-registry credentials are a later batch)
test("pushImage requests the push endpoint with the reference's tag and an anonymous X-Registry-Auth header", async () => {
  await pushImage("myrepo/app:1.0", noopHandlers());

  const call = streamRequests[0]!;
  assert.match(call.path, /^\/images\/myrepo\/app\/push\?/);
  const query = new URLSearchParams(call.path.split("?")[1]);
  assert.equal(query.get("tag"), "1.0");
  assert.ok(call.headers?.["X-Registry-Auth"], "expected an X-Registry-Auth header");
});

// image-transfer-service.md — tagImage posts repo and tag query params derived from the new reference
test("tagImage requests POST /images/:id/tag with repo and tag derived from the new reference", async () => {
  await tagImage("image-1", "myrepo/app:2.0");

  const call = requests[0]!;
  assert.equal(call.method, "POST");
  assert.match(call.path, /^\/images\/image-1\/tag\?/);
  const query = new URLSearchParams(call.path.split("?")[1]);
  assert.equal(query.get("repo"), "myrepo/app");
  assert.equal(query.get("tag"), "2.0");
});

// image-transfer-service.md — untagImage removes just that tag reference via DELETE
test("untagImage requests DELETE on the tag reference itself", async () => {
  await untagImage("myrepo/app:2.0");

  const call = requests[0]!;
  assert.equal(call.method, "DELETE");
  assert.equal(call.path, "/images/myrepo/app:2.0");
});

// image-transfer-service.md — removeImage force-removes via DELETE ?force=true
test("removeImage requests DELETE /images/:id?force=true", async () => {
  await removeImage("image-1");

  const call = requests[0]!;
  assert.equal(call.method, "DELETE");
  assert.equal(call.path, "/images/image-1?force=true");
});

// image-transfer-service.md — prune filters to dangling images and maps the daemon's response to removedIds/reclaimedBytes
test("pruneDanglingImages requests the dangling filter and maps the daemon's response", async () => {
  requestBody = JSON.stringify({
    ImagesDeleted: [{ Deleted: "sha256:aaa" }, { Untagged: "myrepo/app:old" }],
    SpaceReclaimed: 4096,
  });

  const result = await pruneDanglingImages();

  const call = requests[0]!;
  assert.equal(call.method, "POST");
  assert.match(call.path, /^\/images\/prune\?filters=/);
  const filters = JSON.parse(decodeURIComponent(call.path.split("filters=")[1]!));
  assert.deepEqual(filters, { dangling: ["true"] });
  assert.deepEqual(result.removedIds, ["sha256:aaa", "myrepo/app:old"]);
  assert.equal(result.reclaimedBytes, 4096);
});

// image-transfer-service.md — one onStep call per NDJSON line; a malformed/partial line is skipped rather than failing the transfer
test("decodes one onStep call per NDJSON line and skips a malformed line without failing the transfer", async () => {
  const steps: unknown[] = [];
  await pullImage("myrepo/app:1.0", undefined, { onStep: (step) => steps.push(step), onError: () => undefined, onEnd: () => undefined });

  currentStream!.write('{"id":"layer1","status":"Downloading","progressDetail":{"current":50,"total":100}}\n');
  currentStream!.write("not valid json\n");
  currentStream!.write('{"id":"layer1","status":"Download complete"}\n');
  await settle();

  assert.deepEqual(steps, [
    { id: "layer1", status: "Downloading", currentBytes: 50, totalBytes: 100 },
    { id: "layer1", status: "Download complete", currentBytes: undefined, totalBytes: undefined },
  ]);
});

// image-transfer-service.md — a summary line with no id is reported under id "overall"
test("reports a summary line with no layer id under id 'overall'", async () => {
  const steps: { id: string }[] = [];
  await pullImage("myrepo/app:1.0", undefined, { onStep: (step) => steps.push(step), onError: () => undefined, onEnd: () => undefined });

  currentStream!.write('{"status":"Status: Downloaded newer image for myrepo/app:1.0"}\n');
  await settle();

  assert.equal(steps[0]!.id, "overall");
});

// image-transfer-service.md — onError fires and no further onStep call follows when the daemon reports an error line
test("onError fires and no further steps follow once the daemon reports an error line on the stream", async () => {
  const steps: unknown[] = [];
  const errors: string[] = [];
  await pullImage("myrepo/app:1.0", undefined, { onStep: (step) => steps.push(step), onError: (message) => errors.push(message), onEnd: () => undefined });

  currentStream!.write('{"id":"layer1","status":"Downloading"}\n');
  currentStream!.write('{"error":"pull access denied for myrepo/app"}\n');
  currentStream!.write('{"id":"layer2","status":"Downloading"}\n');
  await settle();

  assert.deepEqual(errors, ["pull access denied for myrepo/app"]);
  assert.equal(steps.length, 1, "no further onStep call should follow an error line");
});

// image-transfer-service.md — onEnd fires once the daemon closes the stream without an error
test("onEnd fires once the daemon closes the stream cleanly", async () => {
  let ended = false;
  let errored = false;
  await pullImage("myrepo/app:1.0", undefined, { onStep: () => undefined, onError: () => (errored = true), onEnd: () => (ended = true) });

  currentStream!.end();
  await settle();

  assert.equal(ended, true);
  assert.equal(errored, false);
});

// image-transfer-service.md — the cancel function is idempotent and no further onStep/onError/onEnd calls follow it
test("the cancel function stops further step/error/end callbacks and is idempotent", async () => {
  const steps: unknown[] = [];
  let ended = false;
  const cancel = await pullImage("myrepo/app:1.0", undefined, { onStep: (step) => steps.push(step), onError: () => undefined, onEnd: () => (ended = true) });

  cancel();
  cancel(); // idempotent: calling twice must not throw or double-act
  currentStream!.write('{"id":"layer1","status":"Downloading"}\n');
  currentStream!.end();
  await settle();

  assert.equal(steps.length, 0);
  assert.equal(ended, false);
});
