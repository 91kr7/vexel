import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { imageAnalysisRouter } from "../../src/image-analysis/image-analysis-routes.js";
import type { ImageLayerStack, LayerMetadata } from "../../src/image-analysis/layer-metadata-service.js";
import type { ImageChangesets } from "../../src/image-analysis/changeset-service.js";

const execFileAsync = promisify(execFile);

function startApp(app: Express): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((closeResolve) => server.close(() => closeResolve())),
      });
    });
  });
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/images", imageAnalysisRouter);
  return app;
}

interface SseEvent {
  event: string;
  data: unknown;
}

/** Reads an SSE response body until `end` or `error` is seen, or a hard timeout is hit. */
async function readSseUntilDone(response: Response, timeoutMs = 90_000): Promise<SseEvent[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let buffer = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const eventLine = frame.split("\n").find((line) => line.startsWith("event: "));
      const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
      if (!eventLine || !dataLine) continue;
      const event = eventLine.slice("event: ".length);
      const data = JSON.parse(dataLine.slice("data: ".length)) as unknown;
      events.push({ event, data });
      if (event === "end" || event === "error") {
        await reader.cancel().catch(() => undefined);
        return events;
      }
    }
  }
  await reader.cancel().catch(() => undefined);
  return events;
}

// A small, disposable multi-layer image built on top of the already-local `registry:2` image (no
// network pull needed): one layer adds `wh-data/keep.txt` and `wh-data/remove.txt`, the next
// deletes `wh-data/remove.txt` (an OCI `.wh.remove.txt` whiteout marker) — verified independently
// against this real daemon by exporting and un-gzipping the built image's layer blobs by hand.
// Reused across the ordering (REQ-47), shared-layer (REQ-50) and whiteout (REQ-49) tests below so
// the (~seconds-long) build only runs once for the whole file.
const RUN_TAG = `vexel-test-layers-${process.pid}-${Date.now()}:1`;
// A single-file image built `FROM scratch` (no network pull needed, unlike `hello-world`, which
// this sandbox cannot always reach): its one layer adds exactly one file of known, controlled
// content, so the expected changeset is exhaustively known rather than inspected by hand.
const TINY_TAG = `vexel-test-tiny-${process.pid}-${Date.now()}:1`;
const TINY_FILE_CONTENT = "vexel single-file fixture\n";
let contextDir = "";
// The client always requests analysis by the image's own id (a content digest, images-client.md),
// never by a human reference — the analysis cache is keyed on whatever string is passed as
// `imageId`, so the id (not the tag) is used here too, matching real usage.
let tinyImageId = "";

before(async () => {
  const { mkdtemp, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  contextDir = await mkdtemp(join(tmpdir(), "vexel-layer-fixture-"));
  await writeFile(
    join(contextDir, "Dockerfile"),
    [
      "FROM registry:2",
      "RUN mkdir -p /wh-data && echo keep > /wh-data/keep.txt && echo remove-me > /wh-data/remove.txt",
      "RUN rm /wh-data/remove.txt",
      "",
    ].join("\n"),
  );
  await execFileAsync("docker", ["build", "-t", RUN_TAG, contextDir]);

  const tinyContextDir = await mkdtemp(join(tmpdir(), "vexel-tiny-fixture-"));
  await writeFile(join(tinyContextDir, "single-file.txt"), TINY_FILE_CONTENT);
  await writeFile(join(tinyContextDir, "Dockerfile"), ["FROM scratch", "COPY single-file.txt /single-file.txt", ""].join("\n"));
  await execFileAsync("docker", ["build", "-t", TINY_TAG, tinyContextDir]);
  const { stdout } = await execFileAsync("docker", ["inspect", TINY_TAG, "--format", "{{.Id}}"]);
  tinyImageId = stdout.trim();
});

after(async () => {
  await execFileAsync("docker", ["rmi", "-f", RUN_TAG]).catch(() => undefined);
  await execFileAsync("docker", ["rmi", "-f", TINY_TAG]).catch(() => undefined);
});

// plan-docker_management_app/REQ-48 — layers are shown completely for a registry-pulled image too:
// one entry per the daemon's own /history step, none dropped.
test("GET /api/images/:id/layers returns one entry per history step for a registry-pulled image never built locally", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const { stdout } = await execFileAsync("docker", ["history", "--no-trunc", "--format", "{{.ID}}", "postgres:16"]);
    const expectedStepCount = stdout.split("\n").filter((line) => line.length > 0).length;

    const response = await fetch(`${url}/api/images/postgres:16/layers`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as ImageLayerStack;

    assert.equal(body.layers.length, expectedStepCount);
    assert.ok(body.layers.every((layer) => typeof layer.uncompressedSizeBytes === "number"));
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-47 — the whole layer stack is shown in order (oldest/base layer
// first): each returned layer's diff id, in returned order, must match the daemon's own
// RootFS.Layers (independently read via `docker inspect`, oldest/base first per the OCI image spec
// and verified by hand against this real daemon), not the daemon's /history order (newest first).
test("GET /api/images/:id/layers orders the stack oldest/base layer first, matching the daemon's own RootFS.Layers", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const { stdout } = await execFileAsync("docker", ["inspect", RUN_TAG, "--format", "{{json .RootFS.Layers}}"]);
    const expectedDiffIds = JSON.parse(stdout.trim()) as string[];

    const response = await fetch(`${url}/api/images/${encodeURIComponent(RUN_TAG)}/layers`);
    const body = (await response.json()) as ImageLayerStack;
    const returnedDiffIds = body.layers.map((layer) => layer.diffId).filter((value): value is string => Boolean(value));

    assert.deepEqual(returnedDiffIds, expectedDiffIds);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-50 — a layer inherited from `registry:2` is marked as shared with
// that same local image.
test("GET /api/images/:id/layers marks an inherited layer as shared with the local image it came from", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const { stdout } = await execFileAsync("docker", ["inspect", "registry:2", "--format", "{{.Id}}"]);
    const registryImageId = stdout.trim();

    const response = await fetch(`${url}/api/images/${encodeURIComponent(RUN_TAG)}/layers`);
    const body = (await response.json()) as ImageLayerStack;

    const sharedLayer = body.layers.find((layer: LayerMetadata & { sharedWith: { id: string; tags: string[] }[] }) =>
      layer.sharedWith.some((sharer) => sharer.id === registryImageId),
    );
    assert.ok(sharedLayer, "expected at least one layer to be marked as shared with registry:2");
  } finally {
    await close();
  }
});

// images-endpoints.md — a daemon rejection (unknown id) surfaces the daemon's own message instead of succeeding silently
test("GET /api/images/:id/layers with an unknown id responds with the daemon's own rejection message", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/images/does-not-exist-${Date.now()}/layers`);
    assert.notEqual(response.status, 200);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-51 — cancelling stops the analysis and leaves nothing behind: the
// per-run temporary directory is removed even when the client disconnects mid-flight. Aborting the
// fetch immediately (rather than waiting) exercises the export phase's own cancellation point.
test("GET /api/images/:id/changesets/stream cleans up its temporary directory when the client disconnects mid-analysis", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  const before_ = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("vexel-layer-analysis-")));
  const controller = new AbortController();
  try {
    const responsePromise = fetch(`${url}/api/images/${encodeURIComponent(RUN_TAG)}/changesets/stream`, { signal: controller.signal }).catch(
      () => undefined,
    );
    controller.abort();
    await responsePromise;
    // Gives the server's `finally` cleanup a moment to run after the disconnect is observed.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const after_ = readdirSync(tmpdir()).filter((name) => name.startsWith("vexel-layer-analysis-") && !before_.has(name));
    assert.deepEqual(after_, [], `expected no leftover analysis temp directory, found: ${after_.join(", ")}`);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-49, REQ-51 — selecting a layer shows the paths that layer alone
// added, with each path's size (a trivial single-file image, built `FROM scratch`, is exhaustively
// verifiable: its one layer adds exactly the one file the Dockerfile COPYs, of known content and
// size); re-analysing the same image then reuses the cache: no export step, no progress events
// beyond the immediate result.
test("GET /api/images/:id/changesets/stream reports the single file a trivial image's only layer adds, then reuses the cache on a second call", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const first = await fetch(`${url}/api/images/${encodeURIComponent(tinyImageId)}/changesets/stream`);
    const firstEvents = await readSseUntilDone(first);
    assert.ok(firstEvents.some((event) => event.event === "progress"), "expected progress events on the first (uncached) run");

    const resultEvent = firstEvents.find((event) => event.event === "result");
    assert.ok(resultEvent, "expected a result event");
    const result = resultEvent!.data as ImageChangesets;
    const allPaths = result.layers.flatMap((layer) => layer.paths);
    assert.deepEqual(
      allPaths.map((path) => ({ path: path.path, status: path.status, sizeBytes: path.sizeBytes })),
      [{ path: "single-file.txt", status: "added", sizeBytes: TINY_FILE_CONTENT.length }],
    );

    const second = await fetch(`${url}/api/images/${encodeURIComponent(tinyImageId)}/changesets/stream`);
    const secondEvents = await readSseUntilDone(second);
    assert.ok(!secondEvents.some((event) => event.event === "progress"), "expected no progress events once the result is cached");
    assert.ok(secondEvents.some((event) => event.event === "result"), "expected the cached result to still be delivered");
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-49 — a file deleted by a later layer (an OCI `.wh.<name>` whiteout
// marker) is reported as a deletion, not as a missing file.
test("GET /api/images/:id/changesets/stream reports a whiteout-deleted file as a deletion", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(RUN_TAG)}/changesets/stream`);
    const events = await readSseUntilDone(response);

    const resultEvent = events.find((event) => event.event === "result");
    assert.ok(resultEvent, "expected a result event");
    const result = resultEvent!.data as ImageChangesets;
    const allPaths = result.layers.flatMap((layer) => layer.paths);
    // The path appears twice across the whole changeset: "added" by the earlier layer that
    // creates it, "deleted" by the later layer that removes it — the deletion, specifically, is
    // what this test is about.
    const addition = allPaths.find((path) => path.path === "wh-data/remove.txt" && path.status === "added");
    const deletion = allPaths.find((path) => path.path === "wh-data/remove.txt" && path.status === "deleted");

    assert.ok(addition, `expected an added entry for wh-data/remove.txt, got paths: ${JSON.stringify(allPaths).slice(0, 500)}`);
    assert.ok(deletion, `expected a deletion entry for wh-data/remove.txt, got paths: ${JSON.stringify(allPaths).slice(0, 500)}`);
    assert.equal(deletion!.status, "deleted");
  } finally {
    await close();
  }
});
