import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { imageAnalysisRouter } from "../../src/image-analysis/image-analysis-routes.js";
import { persistenceRouter } from "../../src/persistence/persistence-routes.js";
import { INTERNAL_CONTAINER_LABEL, sweepAbandonedExtractionContainers } from "../../src/image-analysis/filesystem-extraction-service.js";
import type { FilesystemExtractionResult } from "../../src/image-analysis/filesystem-extraction-service.js";
import type { ImageChangesets } from "../../src/image-analysis/changeset-service.js";
import { BASE_IMAGE, ownershipArgs } from "../support/fixtures.js";

const execFileAsync = promisify(execFile);

function startApp(app: Express): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((closeResolve) => {
            server.closeAllConnections();
            server.close(() => closeResolve());
          }),
      });
    });
  });
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/images", imageAnalysisRouter);
  app.use("/api/persistence", persistenceRouter);
  return app;
}

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
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
      const data = JSON.parse(dataLine.slice("data: ".length)) as Record<string, unknown>;
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

async function dockerInspect(format: string, reference: string): Promise<string> {
  const { stdout } = await execFileAsync("docker", ["inspect", reference, "--format", format]);
  return stdout.trim();
}

async function listInternalContainerIds(): Promise<string[]> {
  const { stdout } = await execFileAsync("docker", ["ps", "-aq", "--filter", `label=${INTERNAL_CONTAINER_LABEL}=true`]).catch(() => ({
    stdout: "",
  }));
  return stdout.split("\n").filter((id) => id.length > 0);
}

/** Polls until no container carries the intermediate-extraction label, or gives up. */
async function assertNoLeftoverInternalContainer(timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let remaining = await listInternalContainerIds();
  while (remaining.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    remaining = await listInternalContainerIds();
  }
  assert.deepEqual(remaining, [], `expected no leftover intermediate extraction container, found: ${remaining.join(", ")}`);
}

/** Collects every daemon event for objects carrying the intermediate-extraction label, until stopped. */
function captureInternalContainerEvents(): { ready: () => Promise<void>; stop: () => Promise<{ action: string }[]> } {
  const lines: string[] = [];
  const child = spawn("docker", ["events", "--format", "{{json .}}", "--filter", `label=${INTERNAL_CONTAINER_LABEL}=true`]);
  child.stdout.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) if (line.trim().length > 0) lines.push(line);
  });
  return {
    /**
     * Resolves once the subscription is demonstrably live, by creating a probe
     * container carrying the same label and waiting to see its own event.
     *
     * Waiting a fixed moment instead was the flake this replaces: `docker
     * events` is a process that has to start and connect, and on a busy daemon
     * that outran the delay — the extraction's `create` event then landed
     * before anything was listening, and the test failed reporting that no
     * container had been created when one had.
     */
    ready: async () => {
      const probeName = `vexel-test-events-probe-${process.pid}-${lines.length}`;
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        await execFileAsync("docker", [
          "create",
          "--name",
          probeName,
          "--label",
          `${INTERNAL_CONTAINER_LABEL}=true`,
          ...ownershipArgs(probeName),
          "alpine:3.20",
        ]).catch(() => undefined);
        await execFileAsync("docker", ["rm", "-fv", probeName]).catch(() => undefined);
        const seen = await new Promise<boolean>((resolve) => setTimeout(() => resolve(lines.length > 0), 500));
        if (seen) {
          lines.length = 0;
          return;
        }
      }
      throw new Error("the docker events subscription never delivered the probe container's own event");
    },
    stop: async () => {
      // Gives the daemon's own event bus a moment to deliver the removal event that follows the
      // extraction's own cleanup (which runs just after the SSE response has already ended).
      await new Promise((resolve) => setTimeout(resolve, 800));
      child.kill();
      return lines.map((line) => JSON.parse(line) as { Action: string }).map((event) => ({ action: event.Action }));
    },
  };
}

async function buildImage(tag: string, dockerfile: string): Promise<void> {
  const contextDir = await mkdtemp(join(tmpdir(), "vexel-fs-fixture-"));
  await writeFile(join(contextDir, "Dockerfile"), dockerfile);
  await execFileAsync("docker", ["build", ...ownershipArgs(tag), "-t", tag, contextDir]);
}

async function removeImageQuietly(tag: string): Promise<void> {
  await execFileAsync("docker", ["rmi", "-f", tag]).catch(() => undefined);
}

// A distroless-style single-layer image (built FROM scratch, no shell, no
// userland) — REQ-52's own "no userland at all" case. An ENTRYPOINT (never
// run) is set so a plain `docker create` accepts it; the no-ENTRYPOINT
// variant is exercised separately below, where the daemon's own container
// creation requirement surfaces a real gap in the service.
const SCRATCH_TAG = `vexel-test-fs-scratch-${process.pid}-${Date.now()}:1`;
const SCRATCH_NESTED_CONTENT = "scratch-nested-content";
// The most literal reading of "no userland at all": no CMD, no ENTRYPOINT,
// nothing the daemon could run even if it wanted to.
const SCRATCH_NO_CMD_TAG = `vexel-test-fs-scratch-no-cmd-${process.pid}-${Date.now()}:1`;
// A two-layer, shell-bearing image: each layer adds one file to the same
// directory, so the merged (post-union) tree must show both, not just the
// top layer's own diff.
const MERGE_TAG = `vexel-test-fs-merge-${process.pid}-${Date.now()}:1`;

let scratchImageId = "";
let scratchNoCmdImageId = "";
let mergeImageId = "";

before(async () => {
  await buildImage(
    SCRATCH_TAG,
    [
      "FROM registry:2 AS builder",
      `RUN mkdir -p /out/nested && echo -n '${SCRATCH_NESTED_CONTENT}' > /out/nested/file.txt && ln -s nested/file.txt /out/link.txt`,
      "FROM scratch",
      "COPY --from=builder /out/ /",
      'ENTRYPOINT ["/does-not-exist"]',
      "",
    ].join("\n"),
  );
  scratchImageId = await dockerInspect("{{.Id}}", SCRATCH_TAG);

  await buildImage(
    SCRATCH_NO_CMD_TAG,
    [
      "FROM registry:2 AS builder",
      `RUN mkdir -p /out/nested && echo -n '${SCRATCH_NESTED_CONTENT}' > /out/nested/file.txt`,
      "FROM scratch",
      "COPY --from=builder /out/ /",
      "",
    ].join("\n"),
  );
  scratchNoCmdImageId = await dockerInspect("{{.Id}}", SCRATCH_NO_CMD_TAG);

  await buildImage(
    MERGE_TAG,
    [
      "FROM registry:2",
      "RUN mkdir -p /vexel-merge-check && echo -n base-layer > /vexel-merge-check/from-base-layer.txt",
      "RUN echo -n second-layer > /vexel-merge-check/from-second-layer.txt",
      "",
    ].join("\n"),
  );
  mergeImageId = await dockerInspect("{{.Id}}", MERGE_TAG);
});

after(async () => {
  await removeImageQuietly(SCRATCH_TAG);
  await removeImageQuietly(SCRATCH_NO_CMD_TAG);
  await removeImageQuietly(MERGE_TAG);
});

// plan-docker_management_app/REQ-52, plan-docker_management_app/REQ-53, plan-docker_management_app/REQ-54
// — a distroless image (no shell) is extracted into a complete, non-empty merged tree, all three
// progress phases are reported, and the intermediate container is gone once it ends.
test("GET /:id/filesystem/stream extracts a distroless image's complete filesystem and leaves no intermediate container behind", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(scratchImageId)}/filesystem/stream?force=true`);
    const events = await readSseUntilDone(response);

    const phases = events.filter((event) => event.event === "progress").map((event) => event.data.phase);
    assert.deepEqual(phases, ["creating", "copying", "indexing"], `expected the three phases in order, got: ${JSON.stringify(phases)}`);

    const resultEvent = events.find((event) => event.event === "result");
    assert.ok(resultEvent, `expected a result event, got: ${JSON.stringify(events)}`);
    const result = resultEvent!.data as unknown as FilesystemExtractionResult;
    assert.equal(result.fromCache, false);
    assert.ok(result.entryCount > 0, "expected a non-empty, non-degraded tree for a distroless image");

    const rootResponse = await fetch(`${url}/api/images/${encodeURIComponent(scratchImageId)}/filesystem/entries`);
    assert.equal(rootResponse.status, 200);
    const root = (await rootResponse.json()) as { entries: { path: string; name: string; kind: string }[] };
    assert.ok(root.entries.some((entry) => entry.name === "link.txt" && entry.kind === "symlink"), "expected the symlink at the tree root");
    assert.ok(root.entries.some((entry) => entry.name === "nested" && entry.kind === "directory"), "expected the directory at the tree root");

    const nestedResponse = await fetch(`${url}/api/images/${encodeURIComponent(scratchImageId)}/filesystem/entries?path=nested`);
    const nested = (await nestedResponse.json()) as { entries: { path: string; name: string; kind: string; sizeBytes?: number }[] };
    assert.deepEqual(
      nested.entries.map((entry) => ({ path: entry.path, kind: entry.kind, sizeBytes: entry.sizeBytes })),
      [{ path: "nested/file.txt", kind: "file", sizeBytes: SCRATCH_NESTED_CONTENT.length }],
    );

    await assertNoLeftoverInternalContainer();
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-52 — the literal "distroless/scratch image with no userland at
// all" case: no CMD, no ENTRYPOINT, nothing the daemon could ever run. The service must still
// produce the same complete tree, since a container is only ever created, never started.
test("GET /:id/filesystem/stream extracts the same complete tree for a scratch image with no CMD or ENTRYPOINT at all", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(scratchNoCmdImageId)}/filesystem/stream?force=true`);
    const events = await readSseUntilDone(response);

    const resultEvent = events.find((event) => event.event === "result");
    assert.ok(
      resultEvent,
      `expected a result event with a complete tree per REQ-52/REQ-53, got: ${JSON.stringify(events)}`,
    );
    const result = resultEvent!.data as unknown as FilesystemExtractionResult;
    assert.ok(result.entryCount > 0, "expected a non-empty tree");

    await assertNoLeftoverInternalContainer();
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-113 — a second call for the same, already-extracted image reuses
// the analysis cache: no container is created again, no progress events are reported.
test("GET /:id/filesystem/stream reuses the cached extraction on a second call, with no progress events", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const first = await fetch(`${url}/api/images/${encodeURIComponent(scratchImageId)}/filesystem/stream?force=true`);
    const firstEvents = await readSseUntilDone(first);
    const firstResult = firstEvents.find((event) => event.event === "result")!.data as unknown as FilesystemExtractionResult;

    const second = await fetch(`${url}/api/images/${encodeURIComponent(scratchImageId)}/filesystem/stream`);
    const secondEvents = await readSseUntilDone(second);

    assert.ok(!secondEvents.some((event) => event.event === "progress"), "expected no progress events once the result is cached");
    const secondResultEvent = secondEvents.find((event) => event.event === "result");
    assert.ok(secondResultEvent, "expected the cached result to still be delivered");
    const secondResult = secondResultEvent!.data as unknown as FilesystemExtractionResult;
    assert.equal(secondResult.fromCache, true);
    assert.equal(secondResult.entryCount, firstResult.entryCount);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-113 — the cached extraction is kept across an application
// restart, not just in the process that computed it: a brand-new process, sharing only the same
// on-disk data directory, reads the same cached result and creates no new container.
test("the cached extraction is still reused by a completely fresh process afterwards", async () => {
  const before_ = await listInternalContainerIds();

  const script = `
    import { extractImageFilesystem } from ${JSON.stringify(new URL("../../src/image-analysis/filesystem-extraction-service.ts", import.meta.url).href)};
    const result = await new Promise((resolve, reject) => {
      extractImageFilesystem(process.argv[1], {}, {
        onProgress: () => {},
        onError: (message) => reject(new Error(message)),
        onEnd: (result) => resolve(result),
      });
    });
    process.stdout.write(JSON.stringify(result));
  `;
  const { stdout } = await execFileAsync("node", ["--import", "tsx", "--eval", script, scratchImageId]);
  const result = JSON.parse(stdout) as FilesystemExtractionResult;

  assert.equal(result.fromCache, true, "expected a fresh process to still see the cached extraction, not recompute it");

  const after_ = await listInternalContainerIds();
  assert.deepEqual(after_.filter((id) => !before_.includes(id)), [], "a cache hit must create no new intermediate container");
});

// plan-docker_management_app/REQ-52, plan-docker_management_app/REQ-56 — content added across two
// separate layers is merged into one flat tree (not just the top layer's own diff); the source
// image and its tags are untouched, and the daemon's own event log shows the intermediate
// container was created and destroyed but never started.
test("GET /:id/filesystem/stream merges content across layers, never starts the container, and never touches the source image", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  const digestBefore = await dockerInspect("{{.Id}}", MERGE_TAG);
  const tagsBefore = await dockerInspect("{{json .RepoTags}}", MERGE_TAG);
  const watcher = captureInternalContainerEvents();
  await watcher.ready();
  try {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(mergeImageId)}/filesystem/stream?force=true`);
    const events = await readSseUntilDone(response);
    const resultEvent = events.find((event) => event.event === "result");
    assert.ok(resultEvent, `expected a result event, got: ${JSON.stringify(events)}`);

    const entriesResponse = await fetch(`${url}/api/images/${encodeURIComponent(mergeImageId)}/filesystem/entries?path=vexel-merge-check`);
    const listing = (await entriesResponse.json()) as { entries: { name: string }[] };
    assert.deepEqual(
      listing.entries.map((entry) => entry.name).sort(),
      ["from-base-layer.txt", "from-second-layer.txt"],
      "expected the merged tree to carry content added by both layers, not just the top one",
    );

    const capturedEvents = await watcher.stop();
    assert.ok(capturedEvents.some((event) => event.action === "create"), "expected the intermediate container to have been created");
    assert.ok(
      !capturedEvents.some((event) => event.action === "start"),
      `expected the intermediate container to never be started, observed actions: ${capturedEvents.map((event) => event.action).join(", ")}`,
    );

    const digestAfter = await dockerInspect("{{.Id}}", MERGE_TAG);
    const tagsAfter = await dockerInspect("{{json .RepoTags}}", MERGE_TAG);
    assert.equal(digestAfter, digestBefore, "the source image's digest must be unchanged");
    assert.equal(tagsAfter, tagsBefore, "the source image's tags must be unchanged");
  } finally {
    await close();
  }
});

// image-analysis-endpoints.md, changeset-service.md, filesystem-extraction-service.md — the
// changeset cache (plain image id) and the filesystem cache ("filesystem:<id>") share the same
// content-addressed store; neither insert evicts the other's entry for the same image.
test("the changeset cache and the filesystem cache for the same image do not evict one another", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    // MERGE_TAG's filesystem was already cached by the previous test; the changeset cache for it
    // has never been touched, so this is genuinely its first (uncached) analysis.
    const firstChangesets = await fetch(`${url}/api/images/${encodeURIComponent(mergeImageId)}/changesets/stream`);
    const firstChangesetEvents = await readSseUntilDone(firstChangesets);
    assert.ok(firstChangesetEvents.some((event) => event.event === "progress"), "expected the first changeset analysis to be uncached");
    const firstChangesetResult = firstChangesetEvents.find((event) => event.event === "result")!.data as unknown as ImageChangesets;

    // The filesystem cache entry must have survived the changeset insert above.
    const secondFilesystem = await fetch(`${url}/api/images/${encodeURIComponent(mergeImageId)}/filesystem/stream`);
    const secondFilesystemEvents = await readSseUntilDone(secondFilesystem);
    assert.ok(!secondFilesystemEvents.some((event) => event.event === "progress"), "expected the filesystem cache entry to still be a cache hit");
    assert.equal((secondFilesystemEvents.find((event) => event.event === "result")!.data as unknown as FilesystemExtractionResult).fromCache, true);

    // And the changeset cache entry must survive being read again, unaffected by the filesystem read above.
    const secondChangesets = await fetch(`${url}/api/images/${encodeURIComponent(mergeImageId)}/changesets/stream`);
    const secondChangesetEvents = await readSseUntilDone(secondChangesets);
    assert.ok(!secondChangesetEvents.some((event) => event.event === "progress"), "expected the changeset cache entry to still be a cache hit");
    assert.deepEqual(secondChangesetEvents.find((event) => event.event === "result")!.data, firstChangesetResult);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-54 — the intermediate container is removed even when the export
// is interrupted by something outside the extraction's own control (here: forcibly removed the
// instant the daemon reports it was created, racing the export mid-flight on a sizeable image).
// A real daemon tolerates the intermediate container (or even its source image) being removed
// while its export is already streaming — verified by hand against this daemon: neither `docker rm
// -f` on the container nor `docker rmi -f` on its image interrupts an in-flight `export`. So the
// only own-process, still-unmocked way to force a genuine failure once the container already
// exists is to sabotage the per-run temporary directory the export is about to be written to: the
// service resolves it under `os.tmpdir()` at run time, which reads `process.env.TMPDIR` on every
// call (not once at import), so redirecting it to a directory this test controls, and stripping its
// write permission the instant the service creates its per-run subdirectory there (well before the
// container-creation round trip to the daemon even returns), reliably fails the write with EACCES.
test("GET /:id/filesystem/stream removes the intermediate container even when the export is interrupted mid-run", async () => {
  const originalTmpDir = process.env.TMPDIR;
  const sandboxDir = await mkdtemp(join(tmpdir(), "vexel-fs-sabotage-"));
  process.env.TMPDIR = sandboxDir;
  const { watch } = await import("node:fs");
  const watcher = watch(sandboxDir, (_eventType, filename) => {
    if (filename && filename.toString().startsWith("vexel-fs-extraction-")) {
      // Removes write access so the export's own `createWriteStream` fails once it tries to
      // create `export.tar` inside; read+execute are kept so the service's own recursive cleanup
      // can still list (and then remove) the now-empty directory afterwards.
      import("node:fs").then(({ chmodSync }) => chmodSync(join(sandboxDir, filename.toString()), 0o500)).catch(() => undefined);
    }
  });
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(BASE_IMAGE)}/filesystem/stream?force=true`);
    const events = await readSseUntilDone(response, 30_000);

    const errorEvent = events.find((event) => event.event === "error");
    assert.ok(errorEvent, `expected the interrupted export to surface as an error event, got: ${JSON.stringify(events)}`);
    assert.ok(events.some((event) => event.event === "progress" && event.data.phase === "copying"), "expected the container to have been created and export to have started");

    await assertNoLeftoverInternalContainer();
  } finally {
    watcher.close();
    process.env.TMPDIR = originalTmpDir;
    await close();
  }
});

// plan-docker_management_app/REQ-54, plan-docker_management_app/REQ-55 — cancelling mid-extraction
// (a disconnect) leaves no intermediate container behind either.
test("GET /:id/filesystem/stream removes the intermediate container when the client disconnects mid-extraction", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  const controller = new AbortController();
  try {
    const responsePromise = fetch(`${url}/api/images/${encodeURIComponent(scratchImageId)}/filesystem/stream?force=true`, {
      signal: controller.signal,
    }).catch(() => undefined);
    controller.abort();
    await responsePromise;

    await assertNoLeftoverInternalContainer();
  } finally {
    await close();
  }
});

// filesystem-extraction-service.md — the startup sweep removes a container left behind by an
// interrupted run (simulated here directly, without going through a real interrupted extraction).
test("sweepAbandonedExtractionContainers removes an intermediate container left behind by an interrupted run", async () => {
  const { stdout } = await execFileAsync("docker", [
    "create",
    ...ownershipArgs("filesystem-sweep"),
    "--label",
    `${INTERNAL_CONTAINER_LABEL}=true`,
    BASE_IMAGE,
  ]);
  const abandonedId = stdout.trim();

  await sweepAbandonedExtractionContainers();

  const { stdout: stillThere } = await execFileAsync("docker", ["ps", "-aq", "--filter", `id=${abandonedId}`]);
  assert.equal(stillThere.trim(), "", "expected the sweep to remove the abandoned intermediate container");
});

// plan-docker_management_app/REQ-113 — the image content digest is the cache key: rebuilding under
// the same tag with different content must not serve the previous, now-stale tree; retagging the
// very same content (no rebuild) must still be served from the cache, since nothing changed.
test("the cache is invalidated by a content change (new image id) and reused for a mere retag of unchanged content", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  const contentTag = `vexel-test-fs-content-${process.pid}-${Date.now()}:1`;
  const retag = `vexel-test-fs-retag-${process.pid}-${Date.now()}:1`;
  try {
    // A scratch image's COPY source must exist in the build context, so this fixture is built by
    // hand rather than through the `buildImage` helper (which only writes a Dockerfile).
    const contextDirV1 = await mkdtemp(join(tmpdir(), "vexel-fs-fixture-"));
    await writeFile(join(contextDirV1, "v1.txt"), "content-version-1");
    await writeFile(
      join(contextDirV1, "Dockerfile"),
      ["FROM scratch", "COPY v1.txt /v1.txt", 'ENTRYPOINT ["/none"]', ""].join("\n"),
    );
    await execFileAsync("docker", ["build", ...ownershipArgs(contentTag), "-t", contentTag, contextDirV1]);
    const idV1 = await dockerInspect("{{.Id}}", contentTag);

    const firstResponse = await fetch(`${url}/api/images/${encodeURIComponent(idV1)}/filesystem/stream`);
    const firstEvents = await readSseUntilDone(firstResponse);
    const firstResult = firstEvents.find((event) => event.event === "result")!.data as unknown as FilesystemExtractionResult;
    assert.equal(firstResult.fromCache, false, "expected the first extraction of a never-before-seen image content to be uncached");
    const firstEntries = await fetch(`${url}/api/images/${encodeURIComponent(idV1)}/filesystem/entries`);
    const firstListing = (await firstEntries.json()) as { entries: { name: string }[] };
    // Verified by hand against this real daemon: creating a container (even one never started)
    // also seeds Docker's own runtime scaffolding (.dockerenv, dev/, etc/, proc/, sys/) regardless
    // of the image's own content, so the assertion checks for v1.txt's presence, not an exact list.
    assert.ok(firstListing.entries.some((entry) => entry.name === "v1.txt"), "expected v1's own file in its tree");

    // Retagging the same content under a new name changes nothing about the content itself: the
    // image id (content digest) is unchanged, so the cache is correctly reused, not invalidated.
    await execFileAsync("docker", ["tag", contentTag, retag]);
    const retaggedId = await dockerInspect("{{.Id}}", retag);
    assert.equal(retaggedId, idV1, "a retag must not change the image id used to key the cache");
    const retagResponse = await fetch(`${url}/api/images/${encodeURIComponent(retaggedId)}/filesystem/stream`);
    const retagEvents = await readSseUntilDone(retagResponse);
    assert.ok(!retagEvents.some((event) => event.event === "progress"), "expected the mere retag to still be served from the cache");
    assert.equal((retagEvents.find((event) => event.event === "result")!.data as unknown as FilesystemExtractionResult).fromCache, true);

    // Rebuilding the same tag with genuinely different content produces a new image id: the cache
    // must not serve v1's stale tree for it.
    const contextDirV2 = await mkdtemp(join(tmpdir(), "vexel-fs-fixture-"));
    await writeFile(join(contextDirV2, "v2.txt"), "content-version-2, entirely different");
    await writeFile(
      join(contextDirV2, "Dockerfile"),
      ["FROM scratch", "COPY v2.txt /v2.txt", 'ENTRYPOINT ["/none"]', ""].join("\n"),
    );
    await execFileAsync("docker", ["build", ...ownershipArgs(contentTag), "-t", contentTag, contextDirV2]);
    const idV2 = await dockerInspect("{{.Id}}", contentTag);
    assert.notEqual(idV2, idV1, "rebuilding with different content must produce a different image id");

    const secondResponse = await fetch(`${url}/api/images/${encodeURIComponent(idV2)}/filesystem/stream`);
    const secondEvents = await readSseUntilDone(secondResponse);
    const secondResult = secondEvents.find((event) => event.event === "result")!.data as unknown as FilesystemExtractionResult;
    assert.equal(secondResult.fromCache, false, "expected the rebuilt content to be freshly extracted, not served from v1's cache entry");
    const secondEntries = await fetch(`${url}/api/images/${encodeURIComponent(idV2)}/filesystem/entries`);
    const secondListing = (await secondEntries.json()) as { entries: { name: string }[] };
    assert.ok(secondListing.entries.some((entry) => entry.name === "v2.txt"), "expected the rebuilt content's own file in its tree");
    assert.ok(!secondListing.entries.some((entry) => entry.name === "v1.txt"), "expected no trace of the stale v1 content in the rebuilt image's tree");
  } finally {
    await removeImageQuietly(retag);
    await removeImageQuietly(contentTag);
    await close();
  }
});

// local-persistence/specs/persistence-endpoints.md, plan-docker_management_app/REQ-113 — the
// filesystem extraction's stored artifact is reflected in the analysis-cache's reported total size.
test("the analysis-cache total size reflects a stored filesystem extraction artifact", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const usage = await fetch(`${url}/api/persistence/analysis-cache`);
    assert.equal(usage.status, 200);
    const body = (await usage.json()) as { totalSizeBytes: number };
    assert.ok(body.totalSizeBytes > 0, "expected the already-cached extractions from earlier tests to contribute to the reported size");
  } finally {
    await close();
  }
});
