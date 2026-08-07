import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";

// The service talks to the daemon only through the shared EngineClient; the
// mock records every stream request's path/body and hands out a controllable
// stream, which is the only place the service's own behaviour (query
// construction, filename derivation, NDJSON decoding, cancellation) is
// observable. `image-transfer-service`'s NdjsonDecoder/sanitizeTarFilename/
// splitReference are used for real: they are pure and already covered by
// their own unit tests.
interface RecordedStreamRequest {
  path: string;
  method?: string;
  body?: unknown;
}
let streamRequests: RecordedStreamRequest[] = [];
let currentStream: PassThrough | undefined;

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      requestStream: async (path: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) => {
        streamRequests.push({ path, method: options.method, body: options.body });
        currentStream = new PassThrough();
        return currentStream;
      },
    }),
  },
});

const { openContainerExportStream, importFilesystemImage } = await import("../../src/containers/container-transfer-service.js");

beforeEach(() => {
  streamRequests = [];
  currentStream = undefined;
});

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// container-transfer-service.md — GET /containers/{id}/export (REQ-43)
test("openContainerExportStream requests GET /containers/:id/export", async () => {
  await openContainerExportStream("container-1");

  assert.equal(streamRequests[0]!.path, "/containers/container-1/export");
});

// container-transfer-service.md — the caller pipes the Engine API's raw response straight through: never buffered whole (REQ-43)
test("openContainerExportStream hands back the Engine API's own response stream, unread and unbuffered", async () => {
  const { response } = await openContainerExportStream("container-1");

  assert.strictEqual(response, currentStream, "expected the raw daemon stream itself, not a copy or a buffered read of it");
});

// container-transfer-service.md — suggestedFilename defaults to "<id (12 chars)>-filesystem", or an explicit hint, always sanitized
test("openContainerExportStream derives the suggested filename from the container id, or from an explicit hint", async () => {
  const defaulted = await openContainerExportStream("abcdef0123456789fedcba");
  assert.equal(defaulted.suggestedFilename, "abcdef012345-filesystem.tar");

  const hinted = await openContainerExportStream("abcdef0123456789fedcba", "web app.tar");
  assert.equal(hinted.suggestedFilename, "web_app.tar");
});

// container-transfer-service.md — POST /images/create?fromSrc=- with no repo/tag when no target reference is given (REQ-43)
test("importFilesystemImage posts to /images/create with fromSrc=- and no repo/tag when no target reference is given", async () => {
  await importFilesystemImage(new PassThrough(), undefined, undefined, { onError: () => undefined, onEnd: () => undefined });

  const call = streamRequests[0]!;
  assert.match(call.path, /^\/images\/create\?/);
  const query = new URLSearchParams(call.path.split("?")[1]);
  assert.equal(query.get("fromSrc"), "-");
  assert.equal(query.has("repo"), false);
  assert.equal(query.has("tag"), false);
});

// container-transfer-service.md — repo/tag derived from the target reference, and every Dockerfile-style change instruction applied
test("importFilesystemImage adds repo and tag derived from the target reference, and every change instruction", async () => {
  await importFilesystemImage(new PassThrough(), "myrepo/app:2.0", ['CMD ["nginx"]', "ENV FOO=bar"], {
    onError: () => undefined,
    onEnd: () => undefined,
  });

  const call = streamRequests[0]!;
  const query = new URLSearchParams(call.path.split("?")[1]);
  assert.equal(query.get("repo"), "myrepo/app");
  assert.equal(query.get("tag"), "2.0");
  assert.deepEqual(query.getAll("changes"), ['CMD ["nginx"]', "ENV FOO=bar"]);
});

// container-transfer-service.md — the uploaded body is piped straight into the Engine API call, never buffered whole (REQ-43)
test("importFilesystemImage passes the uploaded body straight into the Engine API call, unread and unbuffered", async () => {
  const body = new PassThrough();
  await importFilesystemImage(body, undefined, undefined, { onError: () => undefined, onEnd: () => undefined });

  assert.strictEqual(streamRequests[0]!.body, body, "expected the raw upload stream itself, not a copy or a buffered read of it");
});

// container-transfer-service.md — result carries the daemon's own status line as the id and echoes the target reference
test("importFilesystemImage reports the daemon's own status line as the result id, echoing the target reference", async () => {
  const results: { id?: string; reference?: string }[] = [];
  await importFilesystemImage(new PassThrough(), "myrepo/app:2.0", undefined, {
    onError: () => undefined,
    onEnd: (result) => results.push(result),
  });

  currentStream!.write('{"status":"sha256:1234567890abcdef"}\n');
  currentStream!.end();
  await settle();

  assert.deepEqual(results[0], { id: "sha256:1234567890abcdef", reference: "myrepo/app:2.0" });
});

// container-transfer-service.md — the daemon's error line is reported via onError instead of onEnd
test("importFilesystemImage reports the daemon's error line via onError instead of onEnd", async () => {
  const errors: string[] = [];
  let ended = false;
  await importFilesystemImage(new PassThrough(), undefined, undefined, { onError: (message) => errors.push(message), onEnd: () => (ended = true) });

  currentStream!.write('{"error":"invalid tar header"}\n');
  await settle();

  assert.deepEqual(errors, ["invalid tar header"]);
  assert.equal(ended, false);
});

// container-transfer-service.md — the cancel function is idempotent and destroys both the request body and the response stream
test("importFilesystemImage's cancel function destroys the request body and the response stream, and is idempotent", async () => {
  const body = new PassThrough();
  let ended = false;
  const cancel = await importFilesystemImage(body, undefined, undefined, { onError: () => undefined, onEnd: () => (ended = true) });

  cancel();
  cancel(); // idempotent: calling twice must not throw or double-act
  currentStream!.write('{"status":"sha256:deadbeef"}\n');
  currentStream!.end();
  await settle();

  assert.equal(body.destroyed, true);
  assert.equal(currentStream!.destroyed, true);
  assert.equal(ended, false, "no onEnd call should follow a cancel");
});
