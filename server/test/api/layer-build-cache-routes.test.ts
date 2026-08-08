import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import express, { type Express } from "express";
import { imageAnalysisRouter } from "../../src/image-analysis/image-analysis-routes.js";
import type { ImageBuildCacheTrace } from "../../src/image-analysis/layer-build-cache-service.js";
import type { ImageLayerStack } from "../../src/image-analysis/layer-metadata-service.js";
import { ownershipArgs, removeImageQuietly, startApp } from "../support/fixtures.js";

const execFileAsync = promisify(execFile);

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/images", imageAnalysisRouter);
  return app;
}

// A locally built image is the only thing that can have a build-cache record
// behind one of its layers, so REQ-68's forward path needs one: a single RUN
// step carrying a marker unique to this run, so the record it leaves in the
// host-wide build cache is identifiable as this test's own — and removable
// afterwards by its own id, without touching anybody else's.
const RUN_ID = `${process.pid}-${Date.now()}`;
const BUILD_MARKER = `vexel-test-trace-${RUN_ID}`;
const BUILT_TAG = `${BUILD_MARKER}:1`;
const BUILT_STEP_COMMAND = `mkdir -p /${BUILD_MARKER}`;
/** Every cache-record id this run has been seen to own, so the teardown removes them all. */
const ownedCacheRecordIds = new Set<string>();

interface RawCacheRecord {
  ID: string;
  Description?: string;
}

/** The build-cache records whose recorded step carries this run's marker: this test's own, and nobody else's. */
async function cacheRecordIdsCarryingMarker(): Promise<string[]> {
  const { stdout } = await execFileAsync("docker", ["buildx", "du", "--format", "json"]).catch(() => ({ stdout: "" }));
  const ids = stdout
    .trim()
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as RawCacheRecord)
    .filter((raw) => (raw.Description ?? "").includes(BUILD_MARKER))
    .map((raw) => raw.ID);
  for (const id of ids) ownedCacheRecordIds.add(id);
  return ids;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits for a moment when the host's build cache is readable and still holds
 * this run's own records.
 *
 * `buildx du` answers for whichever builder is currently active, and another
 * file of the parallel API pass switches that builder for a few seconds
 * (builders-routes.test.ts, REQ-88). During that window the cache is another
 * builder's — transiently unreadable, or simply not the one this fixture built
 * into. The contract under test is unaffected: its precondition is just not met
 * yet.
 */
async function whenOwnCacheRecordsAreVisible(): Promise<string[]> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ids = await cacheRecordIdsCarryingMarker();
    if (ids.length > 0) return ids;
    await delay(500);
  }
  return [];
}

before(async () => {
  const contextDir = await mkdtemp(join(tmpdir(), "vexel-trace-fixture-"));
  try {
    await writeFile(join(contextDir, "Dockerfile"), ["FROM alpine:3.20", `RUN ${BUILT_STEP_COMMAND}`, ""].join("\n"));
    await execFileAsync("docker", ["build", ...ownershipArgs(BUILT_TAG), "-t", BUILT_TAG, contextDir]);
  } finally {
    await rm(contextDir, { recursive: true, force: true });
  }
  await cacheRecordIdsCarryingMarker();
});

after(async () => {
  await removeImageQuietly(BUILT_TAG);
  // The build cache is host-wide and survives the image: each record this run
  // created is removed by its own id, so nothing of the operator's is touched.
  // `buildx prune` acts on whichever builder is active, so the removal is
  // verified and retried — another file of the parallel pass may hold the active
  // builder at this instant (see whenOwnCacheRecordsAreVisible).
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const remaining = await cacheRecordIdsCarryingMarker();
    if (remaining.length === 0) break;
    for (const id of remaining) {
      await execFileAsync("docker", ["buildx", "prune", "--force", "--all", "--filter", `id=${id}`]).catch(() => undefined);
    }
    await delay(500);
  }
});

// plan-docker_management_app/REQ-68 — from a layer of an image, the build step
// and the build-cache entry responsible for it can be reached: for a locally
// built image the association exists, so the layer that this run's RUN step
// produced answers with its own cache record and no reason.
test("GET /api/images/:id/layers/build-cache reaches the build step and the cache record behind a locally built layer", async () => {
  const { url, close } = await startApp(buildApp());
  try {
    let ownCacheRecordIds: string[] = [];
    let builtLayer: ImageBuildCacheTrace["layers"][number] | undefined;
    // A cache that cannot be read at all carries its own reason and is not the
    // state under test; see whenOwnCacheRecordsAreVisible for why it may
    // transiently be unreadable in the parallel API pass.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      ownCacheRecordIds = await whenOwnCacheRecordsAreVisible();
      const response = await fetch(`${url}/api/images/${encodeURIComponent(BUILT_TAG)}/layers/build-cache`);
      assert.equal(response.status, 200);
      const trace = (await response.json()) as ImageBuildCacheTrace;
      builtLayer = trace.layers.find((link) => (link.command ?? "").includes(BUILD_MARKER));
      assert.ok(builtLayer, `expected a layer for the fixture's own RUN step, got: ${JSON.stringify(trace.layers.map((link) => link.command))}`);
      if (builtLayer!.unavailableReason !== "BuildCacheUnreadable") break;
      await delay(500);
    }

    assert.ok(ownCacheRecordIds.length > 0, "expected the fixture build to leave at least one identifiable build-cache record");
    assert.equal(builtLayer!.unavailableReason, undefined, `expected an association, got the reason: ${builtLayer!.unavailableDetail}`);
    assert.ok(builtLayer!.cacheRecord, "expected the cache record behind the built layer");
    assert.ok(ownCacheRecordIds.includes(builtLayer!.cacheRecord!.id), "expected the record named to be one this run's own build left behind");
    assert.equal(builtLayer!.cacheRecord!.type, "regular");
    assert.ok(builtLayer!.cacheRecord!.sizeBytes >= 0);
    assert.ok(["shared", "in-use", "reclaimable"].includes(builtLayer!.cacheRecord!.usageState));
  } finally {
    await close();
  }
});

// layer-build-cache-service.md — one entry per layer of the image's layer stack,
// in the same order and with the same layerIndex as that stack; none dropped for
// having no association.
test("GET /api/images/:id/layers/build-cache answers with one entry per layer of the layer stack, in the same order", async () => {
  const { url, close } = await startApp(buildApp());
  try {
    const stackResponse = await fetch(`${url}/api/images/${encodeURIComponent(BUILT_TAG)}/layers`);
    const stack = (await stackResponse.json()) as ImageLayerStack;

    const response = await fetch(`${url}/api/images/${encodeURIComponent(BUILT_TAG)}/layers/build-cache`);
    const trace = (await response.json()) as ImageBuildCacheTrace;

    assert.equal(trace.layers.length, stack.layers.length);
    assert.deepEqual(
      trace.layers.map((link) => link.layerIndex),
      stack.layers.map((layer) => layer.index),
    );
    assert.deepEqual(
      trace.layers.map((link) => link.diffId),
      stack.layers.map((layer) => layer.diffId),
    );
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-68 — "when it is not, the reason is stated
// rather than left blank": a registry-pulled image was never built on this host,
// so every one of its layers answers with a reason and an operator-facing
// sentence, never with an empty association and no explanation.
test("GET /api/images/:id/layers/build-cache states the reason for every layer of a registry-pulled image", async () => {
  const { url, close } = await startApp(buildApp());
  try {
    // A cache that cannot be read at all is its own reason (BuildCacheUnreadable),
    // and not the one under test here; see whenOwnCacheRecordsAreVisible for why
    // it may transiently be unreadable in the parallel API pass.
    let trace = { layers: [] } as unknown as ImageBuildCacheTrace;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await fetch(`${url}/api/images/registry%3A2/layers/build-cache`);
      assert.equal(response.status, 200);
      trace = (await response.json()) as ImageBuildCacheTrace;
      if (!trace.layers.some((link) => link.unavailableReason === "BuildCacheUnreadable")) break;
      await delay(500);
    }

    assert.ok(trace.layers.length > 0, "expected the registry-pulled image's layer stack");
    for (const link of trace.layers) {
      assert.equal(link.cacheRecord, undefined, "a registry-pulled image's layer can carry no local cache record");
      assert.ok(typeof link.unavailableReason === "string" && link.unavailableReason.length > 0, "expected a stated reason");
      assert.ok(
        typeof link.unavailableDetail === "string" && link.unavailableDetail.trim().split(/\s+/).length > 3,
        `expected a sentence explaining why, got: ${JSON.stringify(link.unavailableDetail)}`,
      );
    }

    // The build cache is non-empty (this file's own fixture build filled it), so
    // a layer carrying a real build step lands on NoMatchingCacheRecord, whose
    // detail names the registry-pulled case explicitly.
    const withCommand = trace.layers.filter((link) => link.unavailableReason === "NoMatchingCacheRecord");
    assert.ok(withCommand.length > 0, `expected at least one NoMatchingCacheRecord layer, got: ${JSON.stringify(trace.layers.map((l) => l.unavailableReason))}`);
    assert.match(withCommand[0]!.unavailableDetail!, /not built on this host/i);
  } finally {
    await close();
  }
});

// layer-build-cache-service.md — "rejects only when the image's own layer stack
// cannot be read -> the daemon's own error."
test("GET /api/images/:id/layers/build-cache with an unknown id responds with the daemon's own rejection message", async () => {
  const { url, close } = await startApp(buildApp());
  try {
    const response = await fetch(`${url}/api/images/does-not-exist-${Date.now()}/layers/build-cache`);

    assert.notEqual(response.status, 200);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});
