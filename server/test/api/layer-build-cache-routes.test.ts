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
import { ALPINE_IMAGE, ensureImages } from "../support/base-images.js";

// A pruned daemon is a starting state like any other: the base images this
// file's fixtures are built on are ensured here, before the first test, so no
// test has to assume a warm daemon nor depend on another file having pulled
// them. They are shared infrastructure, not fixtures: nothing removes them.
await ensureImages([ALPINE_IMAGE]);

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
  // The build cache is host-wide and survives the image: every record this run
  // was ever seen to own is removed by its own id, so nothing of the operator's
  // is touched — and a record that has since stopped being listed is removed
  // all the same, from the id remembered when it was.
  for (const id of await cacheRecordIdsCarryingMarker()) ownedCacheRecordIds.add(id);
  for (const id of ownedCacheRecordIds) {
    await execFileAsync("docker", ["buildx", "prune", "--force", "--all", "--filter", `id=${id}`]).catch(() => undefined);
  }
});

// plan-docker_management_app/REQ-68 — from a layer of an image, the build step
// and the build-cache entry responsible for it can be reached: for a locally
// built image the association exists, so the layer that this run's RUN step
// produced answers with its own cache record and no reason.
test("GET /api/images/:id/layers/build-cache reaches the build step and the cache record behind a locally built layer", async () => {
  const { url, close } = await startApp(buildApp());
  try {
    const ownCacheRecordIds = await cacheRecordIdsCarryingMarker();
    const response = await fetch(`${url}/api/images/${encodeURIComponent(BUILT_TAG)}/layers/build-cache`);
    assert.equal(response.status, 200);
    const trace = (await response.json()) as ImageBuildCacheTrace;
    const builtLayer = trace.layers.find((link) => (link.command ?? "").includes(BUILD_MARKER));
    assert.ok(builtLayer, `expected a layer for the fixture's own RUN step, got: ${JSON.stringify(trace.layers.map((link) => link.command))}`);

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
    const response = await fetch(`${url}/api/images/registry%3A2/layers/build-cache`);
    assert.equal(response.status, 200);
    const trace = (await response.json()) as ImageBuildCacheTrace;

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
