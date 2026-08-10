import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
import { ALPINE_IMAGE, REGISTRY_IMAGE, ensureImages } from "../support/base-images.js";
import { execFileAsync } from "../support/docker-cli.js";

// A pruned daemon is a starting state like any other: the base images this
// file's fixtures are built on are ensured here, before the first test, so no
// test has to assume a warm daemon nor depend on another file having pulled
// them. They are shared infrastructure, not fixtures: nothing removes them.
await ensureImages([ALPINE_IMAGE, REGISTRY_IMAGE]);

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

/**
 * The intermediate extraction containers created from one given image — the one
 * this file just had extracted, always.
 *
 * The extraction label is host-wide, and it is not this file's alone: other
 * files of the parallel API pass carry it legitimately, both through the
 * application (`image-filesystem-file-operations.test.ts` extracts a fixture
 * image of its own, and its intermediate container lives for as long as that
 * export takes) and by hand (`containers-routes.test.ts` labels a container to
 * check the inventory hides it). Reading every container that carries the label
 * is reading somebody else's fixture — it is what made this file fail for a
 * container it had never created (CLAUDE.md: "Assert on the fixtures you
 * created ... never on totals").
 *
 * The image is matched by its own id, exactly: `--filter ancestor=` would not
 * do, since it also matches containers of images *descended* from the given one
 * — and the other extraction fixtures on this host descend from `alpine:3.20`,
 * the very image one of the cases below extracts.
 */
async function listInternalContainerIds(imageReference: string): Promise<string[]> {
  const imageId = await dockerInspect("{{.Id}}", imageReference).catch(() => imageReference);
  const { stdout } = await execFileAsync("docker", [
    "ps",
    "-a",
    "--filter",
    `label=${INTERNAL_CONTAINER_LABEL}=true`,
    "--format",
    "{{.ID}}",
  ]).catch(() => ({ stdout: "" }));
  const candidates = stdout.split("\n").filter((id) => id.length > 0);
  const own: string[] = [];
  for (const candidate of candidates) {
    // A container removed between the listing and this reading is simply gone.
    const containerImageId = await dockerInspect("{{.Image}}", candidate).catch(() => "");
    if (containerImageId === imageId) own.push(candidate);
  }
  return own;
}

/** The volumes attached to a container, anonymous ones included — the daemon names them and nothing else does. */
async function volumeNamesOf(containerId: string): Promise<string[]> {
  const names = await dockerInspect('{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}', containerId).catch(() => "");
  return names.split(/\s+/).filter((name) => name.length > 0);
}

async function volumeExists(name: string): Promise<boolean> {
  return await execFileAsync("docker", ["volume", "inspect", name]).then(
    () => true,
    () => false,
  );
}

/** Polls until no intermediate container of `imageReference`'s extraction is left, or gives up. */
async function assertNoLeftoverInternalContainer(imageReference: string, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let remaining = await listInternalContainerIds(imageReference);
  while (remaining.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    remaining = await listInternalContainerIds(imageReference);
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

    await assertNoLeftoverInternalContainer(scratchImageId);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-54 — the intermediate container's removal "takes the container's
// anonymous volumes with it" (filesystem-extraction-service.md): the daemon attaches one to every
// `VOLUME` the image declares, and a removal that leaves it behind orphans one volume per
// extraction on the operator's own host, carrying no label, so nothing can identify it afterwards.
//
// The fixture is the registry:2-derived one this file already builds: `registry:2` declares
// `/var/lib/registry` and everything built from it inherits the declaration, so it is both the
// real-world case and an export long enough for the short-lived container to be caught while it
// still exists.
test("extracting an image that declares a VOLUME leaves no anonymous volume behind", async (t) => {
  assert.notEqual(
    await dockerInspect("{{.Config.Volumes}}", MERGE_TAG),
    "map[]",
    "this check needs a fixture that declares a VOLUME: without one the daemon attaches no anonymous volume to begin with",
  );

  const attached = new Set<string>();
  let watching = true;
  let watcher: Promise<void> = Promise.resolve();
  const { url, close } = await startApp(buildApp());

  try {
    // The volume's name can only be read off the intermediate container, which
    // exists for as long as the export does, so it is collected while the
    // extraction runs. The listing is filtered by this fixture's own image, so
    // a container another file's extraction has in flight is never mistaken for
    // this one's.
    watcher = (async () => {
      while (watching) {
        for (const containerId of await listInternalContainerIds(MERGE_TAG)) {
          for (const name of await volumeNamesOf(containerId)) attached.add(name);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    })();

    const response = await fetch(`${url}/api/images/${encodeURIComponent(mergeImageId)}/filesystem/stream?force=true`);
    const events = await readSseUntilDone(response);
    assert.ok(events.find((event) => event.event === "result"), `expected the extraction to succeed, got: ${JSON.stringify(events)}`);

    watching = false;
    await watcher;
    await assertNoLeftoverInternalContainer(MERGE_TAG);

    if (attached.size === 0) {
      // The container came and went between two readings: there is no volume
      // name to check, and asserting on nothing would pass for the wrong reason.
      t.skip("the intermediate container's own volume was never observed");
      return;
    }
    for (const name of attached) {
      assert.equal(await volumeExists(name), false, `the intermediate container's anonymous volume ${name} outlived the container`);
    }
  } finally {
    watching = false;
    await watcher.catch(() => undefined);
    // An orphan proves the defect; it must not also pile up on the host. This
    // test made the container that made it, so removing it is this test's own
    // business either way.
    for (const name of attached) await execFileAsync("docker", ["volume", "rm", "-f", name]).catch(() => undefined);
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

    await assertNoLeftoverInternalContainer(scratchNoCmdImageId);
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
  const before_ = await listInternalContainerIds(scratchImageId);

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

  const after_ = await listInternalContainerIds(scratchImageId);
  assert.deepEqual(after_.filter((id) => !before_.includes(id)), [], "a cache hit must create no new intermediate container");
});

// plan-docker_management_app/REQ-52, plan-docker_management_app/REQ-56 — content added across two
// separate layers is merged into one flat tree (not just the top layer's own diff); the source
// image and its tags are untouched, and the daemon's own event log shows the intermediate
// container was created and destroyed but never started.
test("GET /:id/filesystem/stream merges content across layers, never starts the container, and never touches the source image", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  let watcher: ReturnType<typeof captureInternalContainerEvents> | undefined;
  try {
    const digestBefore = await dockerInspect("{{.Id}}", MERGE_TAG);
    const tagsBefore = await dockerInspect("{{json .RepoTags}}", MERGE_TAG);
    watcher = captureInternalContainerEvents();
    await watcher.ready();
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
    // The `docker events` subscription is a child process this test started: stopping it here
    // (idempotent — the assertions above already stop it on the nominal path) means a failure in
    // between cannot leave it running.
    await watcher?.stop();
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
// call (not once at import), so redirecting it to a directory this test controls lets the export's
// own destination be taken away from under it.
//
// Two details are what make that sabotage land every time rather than most of the time.
//
// - **`export.tar` is pre-created as a directory, not made unwritable.** Stripping the write
//   permission off the work directory does fail the write — but only if it lands before the file is
//   created, and when it does not, it is the *service's own cleanup* that then fails, unable to
//   unlink a file it legitimately wrote (an EACCES surfacing as an unhandled rejection, which is
//   how this test failed intermittently). A directory in the file's place fails `createWriteStream`
//   with EISDIR and leaves the work directory perfectly removable either way.
// - **The sabotage is polled from the event loop, not from `fs.watch`.** The service creates the
//   work directory and then awaits the container-creation round trip to the daemon before it opens
//   `export.tar`; a timer in this same process is therefore guaranteed a turn in between, whereas a
//   filesystem watch is delivered whenever the platform gets round to it.
test("GET /:id/filesystem/stream removes the intermediate container even when the export is interrupted mid-run", async () => {
  const originalTmpDir = process.env.TMPDIR;
  const sandboxDir = await mkdtemp(join(tmpdir(), "vexel-fs-sabotage-"));
  process.env.TMPDIR = sandboxDir;
  const sabotage = setInterval(() => {
    for (const entry of readdirSync(sandboxDir)) {
      if (!entry.startsWith("vexel-fs-extraction-")) continue;
      try {
        mkdirSync(join(sandboxDir, entry, "export.tar"));
      } catch {
        // Already there — this interval fires more than once per work directory.
      }
    }
  }, 1);
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/images/${encodeURIComponent(BASE_IMAGE)}/filesystem/stream?force=true`);
    const events = await readSseUntilDone(response, 30_000);

    const errorEvent = events.find((event) => event.event === "error");
    assert.ok(errorEvent, `expected the interrupted export to surface as an error event, got: ${JSON.stringify(events)}`);
    assert.ok(events.some((event) => event.event === "progress" && event.data.phase === "copying"), "expected the container to have been created and export to have started");

    await assertNoLeftoverInternalContainer(BASE_IMAGE);
  } finally {
    clearInterval(sabotage);
    process.env.TMPDIR = originalTmpDir;
    await close();
    // The sandbox is this test's own: it goes with it, whether the test passed
    // or failed.
    await rm(sandboxDir, { recursive: true, force: true });
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

    await assertNoLeftoverInternalContainer(scratchImageId);
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
