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
  body?: unknown;
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
      requestStream: async (path: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) => {
        streamRequests.push({ path, method: options.method, headers: options.headers, body: options.body });
        currentStream = new PassThrough();
        return currentStream;
      },
    }),
  },
});

const { pullImage, pushImage, tagImage, untagImage, removeImage, pruneDanglingImages, openImageSaveStream, loadImages, sanitizeTarFilename } =
  await import("../../src/images/image-transfer-service.js");

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

// The end of a stream travels through a data event and an end event, so the
// outcome is read after several turns rather than one.
async function settleUntilStreamEnd(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await settle();
}

// image-transfer-service.md — onEnd fires only once the daemon has stated a success and then closed the stream
// plan-docker_management_app-push_failure_reporting/REQ-5
test("onEnd fires when a push stream closes after the daemon has stated the digest and size it stored", async () => {
  let ended = false;
  const errors: string[] = [];
  await pushImage("localhost:5099/myrepo/app:v1", { onStep: () => undefined, onError: (message) => errors.push(message), onEnd: () => (ended = true) });

  currentStream!.write('{"id":"3f26bc2dec0b","status":"Pushed"}\n');
  currentStream!.write('{"status":"v1: digest: sha256:45e0d1e1f0b0c0d0e0f0011223344556677889900aabbccddeeff0011223399e1 size: 1026"}\n');
  currentStream!.end();
  await settleUntilStreamEnd();

  assert.deepEqual(errors, [], "a stated push success is not a failure");
  assert.equal(ended, true);
});

// image-transfer-service.md — a pull states its success with a status line opening "Status:"
// plan-docker_management_app-push_failure_reporting/REQ-5, REQ-6
test("onEnd fires when a pull stream closes after either of the daemon's own Status: lines", async () => {
  for (const statement of ["Status: Downloaded newer image for localhost:5099/myrepo/app:v1", "Status: Image is up to date for localhost:5099/myrepo/app:v1"]) {
    let ended = false;
    const errors: string[] = [];
    await pullImage("localhost:5099/myrepo/app:v1", undefined, { onStep: () => undefined, onError: (message) => errors.push(message), onEnd: () => (ended = true) });

    currentStream!.write(`${JSON.stringify({ status: statement })}\n`);
    currentStream!.end();
    await settleUntilStreamEnd();

    assert.deepEqual(errors, [], `"${statement}" is a success the daemon stated`);
    assert.equal(ended, true, `"${statement}" is a success the daemon stated`);
  }
});

// image-transfer-service.md — an end with no stated success is a failure carrying the last message the daemon gave
// plan-docker_management_app-push_failure_reporting/REQ-2
test("a push stream that ends without a stated success is reported as a failure, not as a completion", async () => {
  let ended = false;
  const errors: string[] = [];
  await pushImage("localhost:1/myrepo/app:v1", { onStep: () => undefined, onError: (message) => errors.push(message), onEnd: () => (ended = true) });

  currentStream!.write('{"status":"The push refers to repository [localhost:1/myrepo/app]"}\n');
  currentStream!.write('{"id":"3f26bc2dec0b","status":"Unavailable","progressDetail":{}}\n');
  currentStream!.end();
  await settleUntilStreamEnd();

  assert.equal(ended, false, "a push nobody declared successful must not be reported as one");
  assert.equal(errors.length, 1, "the end of an unstated push is reported as a failure");
  assert.match(errors[0]!, /Unavailable/, "the failure carries the last message the daemon gave");
});

// image-transfer-service.md — the same outcome rule holds for a pull, which shares the path
// plan-docker_management_app-push_failure_reporting/REQ-6
test("a pull stream that ends without a stated success is reported as a failure, not as a completion", async () => {
  let ended = false;
  const errors: string[] = [];
  await pullImage("localhost:1/myrepo/app:v1", undefined, { onStep: () => undefined, onError: (message) => errors.push(message), onEnd: () => (ended = true) });

  currentStream!.write('{"id":"3f26bc2dec0b","status":"Pulling fs layer"}\n');
  currentStream!.end();
  await settleUntilStreamEnd();

  assert.equal(ended, false, "a pull nobody declared successful must not be reported as one");
  assert.equal(errors.length, 1, "the end of an unstated pull is reported as a failure");
  assert.match(errors[0]!, /Pulling fs layer/, "the failure carries the last message the daemon gave");
});

// image-transfer-service.md — when the daemon gave no message at all, the failure still says the transfer ended without a result
// plan-docker_management_app-push_failure_reporting/REQ-2
test("a stream that ends having said nothing at all is reported as a failure with a message of its own", async () => {
  let ended = false;
  const errors: string[] = [];
  await pushImage("localhost:1/myrepo/app:v1", { onStep: () => undefined, onError: (message) => errors.push(message), onEnd: () => (ended = true) });

  currentStream!.end();
  await settleUntilStreamEnd();

  assert.equal(ended, false, "silence is not a success");
  assert.equal(errors.length, 1);
  assert.notEqual(errors[0]!.trim(), "", "the failure must carry a message the operator can read");
});

// image-transfer-service.md — a push also states its success with an `aux` carrying a Digest
// plan-docker_management_app-push_failure_reporting/REQ-2, REQ-5
test("onEnd fires when a push stream closes after an aux entry carrying the stored digest", async () => {
  let ended = false;
  const errors: string[] = [];
  await pushImage("localhost:5099/myrepo/app:v1", { onStep: () => undefined, onError: (message) => errors.push(message), onEnd: () => (ended = true) });

  currentStream!.write('{"id":"3f26bc2dec0b","status":"Pushed"}\n');
  currentStream!.write('{"progressDetail":{},"aux":{"Tag":"v1","Digest":"sha256:45e0d1e1f0b0c0d0e0f0011223344556677889900aabbccddeeff0011223399e1","Size":1026}}\n');
  currentStream!.end();
  await settleUntilStreamEnd();

  assert.deepEqual(errors, [], "an aux carrying a Digest is a success the daemon stated");
  assert.equal(ended, true);
});

// image-transfer-service.md — no deadline of the service's own: it waits exactly as long as the daemon does
// plan-docker_management_app-push_failure_reporting/REQ-3
test("a silent but open stream produces no outcome at all: the service imposes no deadline of its own", async () => {
  let ended = false;
  const errors: string[] = [];
  await pushImage("localhost:1/myrepo/app:v1", { onStep: () => undefined, onError: (message) => errors.push(message), onEnd: () => (ended = true) });

  currentStream!.write('{"id":"3f26bc2dec0b","status":"Preparing"}\n');
  await new Promise((resolve) => setTimeout(resolve, 1_200));

  assert.deepEqual(errors, [], "nothing arriving for a while is not a failure the service may declare");
  assert.equal(ended, false, "nothing arriving for a while is not a success either");

  currentStream!.write('{"status":"v1: digest: sha256:45e0d1e1f0b0c0d0e0f0011223344556677889900aabbccddeeff0011223399e1 size: 1026"}\n');
  currentStream!.end();
  await settleUntilStreamEnd();

  assert.equal(ended, true, "the outcome arrives when the daemon states it, not before");
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

// image-transfer-service.md — GET /images/get?names=... repeated once per reference (REQ-42)
test("openImageSaveStream requests /images/get with one 'names' query parameter per reference", async () => {
  await openImageSaveStream(["repo/a:1", "repo/b:2"]);

  const call = streamRequests[0]!;
  assert.match(call.path, /^\/images\/get\?/);
  const query = new URLSearchParams(call.path.split("?")[1]);
  assert.deepEqual(query.getAll("names"), ["repo/a:1", "repo/b:2"]);
});

// image-transfer-service.md — the caller pipes the Engine API's raw response straight through: never buffered whole (REQ-42)
test("openImageSaveStream hands back the Engine API's own response stream, unread and unbuffered", async () => {
  const { response } = await openImageSaveStream(["repo/a:1"]);

  assert.strictEqual(response, currentStream, "expected the raw daemon stream itself, not a copy or a buffered read of it");
});

// image-transfer-service.md — suggestedFilename: the sole reference, "<count>-images" for several, or an explicit hint, always sanitized (REQ-42)
test("openImageSaveStream derives the suggested filename from the reference, from the count, or from an explicit hint", async () => {
  const single = await openImageSaveStream(["repo/app:1.0"]);
  assert.equal(single.suggestedFilename, "repo_app_1.0.tar");

  const several = await openImageSaveStream(["repo/a:1", "repo/b:2"]);
  assert.equal(several.suggestedFilename, "2-images.tar");

  const hinted = await openImageSaveStream(["repo/a:1"], "my custom name.tar");
  assert.equal(hinted.suggestedFilename, "my_custom_name.tar");
});

// image-transfer-service.md — sanitizeTarFilename strips a trailing .tar, replaces unsafe characters with "_", and falls back to "download.tar" for an empty hint
test("sanitizeTarFilename strips a trailing .tar, replaces unsafe characters and falls back to download.tar for an empty hint", () => {
  assert.equal(sanitizeTarFilename("repo/app:1.0.tar"), "repo_app_1.0.tar");
  assert.equal(sanitizeTarFilename("repo/app:1.0"), "repo_app_1.0.tar");
  assert.equal(sanitizeTarFilename(""), "download.tar");
});

// image-transfer-service.md — POST /images/load with the raw upload request stream piped straight through, never buffered whole (REQ-42)
test("loadImages passes the upload request body straight into the /images/load call, unread and unbuffered", async () => {
  const body = new PassThrough();
  await loadImages(body, { onError: () => undefined, onEnd: () => undefined });

  const call = streamRequests[0]!;
  assert.equal(call.path, "/images/load");
  assert.equal(call.method, "POST");
  assert.strictEqual(call.body, body, "expected the raw upload stream itself, not a copy or a buffered read of it");
});

// image-transfer-service.md — result.references parsed from the daemon's own "Loaded image: …" status lines
test("loadImages parses the daemon's 'Loaded image: …' status lines into the resulting references", async () => {
  const results: { references: string[] }[] = [];
  await loadImages(new PassThrough(), { onError: () => undefined, onEnd: (result) => results.push(result) });

  currentStream!.write('{"stream":"Loaded image: myrepo/app:1.0\\n"}\n');
  currentStream!.write('{"stream":"Loaded image ID: sha256:abcdef123456\\n"}\n');
  currentStream!.end();
  await settle();

  assert.deepEqual(results[0]!.references, ["myrepo/app:1.0", "sha256:abcdef123456"]);
});

// image-transfer-service.md — onError fires on the daemon's own error line, and no onEnd follows
test("loadImages reports the daemon's error line via onError instead of onEnd", async () => {
  const errors: string[] = [];
  let ended = false;
  await loadImages(new PassThrough(), { onError: (message) => errors.push(message), onEnd: () => (ended = true) });

  currentStream!.write('{"error":"open /var/lib/docker: no space left on device"}\n');
  await settle();

  assert.deepEqual(errors, ["open /var/lib/docker: no space left on device"]);
  assert.equal(ended, false);
});

// image-transfer-service.md — the cancel function destroys the upload body and the response stream, and is idempotent
test("loadImages' cancel function destroys the upload body and the response stream, and is idempotent", async () => {
  const body = new PassThrough();
  let ended = false;
  const cancel = await loadImages(body, { onError: () => undefined, onEnd: () => (ended = true) });

  cancel();
  cancel(); // idempotent: calling twice must not throw or double-act
  currentStream!.write('{"stream":"Loaded image: myrepo/app:1.0\\n"}\n');
  currentStream!.end();
  await settle();

  assert.equal(body.destroyed, true);
  assert.equal(currentStream!.destroyed, true);
  assert.equal(ended, false, "no onEnd call should follow a cancel");
});
