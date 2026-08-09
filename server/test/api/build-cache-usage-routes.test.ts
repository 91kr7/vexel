import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildersRouter } from "../../src/builders/builders-routes.js";
import type { BuildCacheUsage } from "../../src/builders/build-cache-usage-service.js";
import { buildApp, ownershipArgs, removeImageQuietly, startApp } from "../support/fixtures.js";
import { ALPINE_IMAGE, ensureImages } from "../support/base-images.js";

// A pruned daemon is a starting state like any other: the base images this
// file's fixtures are built on are ensured here, before the first test, so no
// test has to assume a warm daemon nor depend on another file having pulled
// them. They are shared infrastructure, not fixtures: nothing removes them.
await ensureImages([ALPINE_IMAGE]);

const execFileAsync = promisify(execFile);

// The reverse direction needs a build-cache record that genuinely stands for a
// layer of a local image, so this file builds one: a single RUN step carrying a
// marker unique to this run, which makes the record it leaves in the host-wide
// build cache identifiable as this test's own — and removable by its own id,
// without touching anybody else's.
const RUN_ID = `${process.pid}-${Date.now()}`;
const BUILD_MARKER = `vexel-test-usage-${RUN_ID}`;
const BUILT_TAG = `${BUILD_MARKER}:1`;
const BUILT_STEP_COMMAND = `mkdir -p /${BUILD_MARKER}`;
/** Every cache-record id this run has been seen to own, so the teardown removes them all. */
const ownedCacheRecordIds = new Set<string>();
let builtImageId = "";

interface RawCacheRecord {
  ID: string;
  Type: string;
  Description?: string;
}

/** The build-cache records whose recorded step carries this run's marker: this test's own, and nobody else's. */
async function ownCacheRecords(): Promise<RawCacheRecord[]> {
  const { stdout } = await execFileAsync("docker", ["buildx", "du", "--format", "json"]).catch(() => ({ stdout: "" }));
  const records = stdout
    .trim()
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as RawCacheRecord)
    .filter((raw) => (raw.Description ?? "").includes(BUILD_MARKER));
  for (const raw of records) ownedCacheRecordIds.add(raw.ID);
  return records;
}

before(async () => {
  const contextDir = await mkdtemp(join(tmpdir(), "vexel-usage-fixture-"));
  try {
    await writeFile(join(contextDir, "Dockerfile"), ["FROM alpine:3.20", `RUN ${BUILT_STEP_COMMAND}`, ""].join("\n"));
    await execFileAsync("docker", ["build", ...ownershipArgs(BUILT_TAG), "-t", BUILT_TAG, contextDir]);
  } finally {
    await rm(contextDir, { recursive: true, force: true });
  }
  await ownCacheRecords();
  const { stdout } = await execFileAsync("docker", ["inspect", BUILT_TAG, "--format", "{{.Id}}"]);
  builtImageId = stdout.trim();
});

after(async () => {
  await removeImageQuietly(BUILT_TAG);
  // The build cache is host-wide and survives the image: every record this run
  // was ever seen to own is removed by its own id, so nothing of the operator's
  // is touched — and a record that has since stopped being listed is removed
  // all the same, from the id remembered when it was.
  for (const raw of await ownCacheRecords()) ownedCacheRecordIds.add(raw.ID);
  for (const id of ownedCacheRecordIds) {
    await execFileAsync("docker", ["buildx", "prune", "--force", "--all", "--filter", `id=${id}`]).catch(() => undefined);
  }
});

// plan-docker_management_app/REQ-69 — from a build-cache entry, the images and
// layers it is associated with can be reached.
test("GET /api/builders/cache/:id/usage names the image and layer the record relates to", async () => {
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  try {
    const ownLayerRecordId = (await ownCacheRecords()).find((raw) => raw.Type === "regular")?.ID ?? "";
    assert.ok(ownLayerRecordId !== "", "expected the fixture build to leave a regular build-cache record of its own");

    const response = await fetch(`${url}/api/builders/cache/${encodeURIComponent(ownLayerRecordId)}/usage`);
    assert.equal(response.status, 200);
    const usage = (await response.json()) as BuildCacheUsage;

    assert.equal(usage.record.id, ownLayerRecordId);
    assert.equal(usage.unavailableReason, undefined, `expected an association, got the reason: ${usage.unavailableDetail}`);
    const reference = usage.references.find((candidate) => candidate.imageId === builtImageId);
    assert.ok(reference, `expected the fixture image among the references, got: ${JSON.stringify(usage.references)}`);
    assert.ok(reference!.tags.includes(BUILT_TAG), `expected the fixture image's own tag, got: ${JSON.stringify(reference!.tags)}`);
    assert.ok(reference!.command!.includes(BUILD_MARKER), `expected the fixture's own build step, got: ${reference!.command}`);
    assert.ok(typeof reference!.layerIndex === "number" && reference!.layerIndex >= 0);
    assert.ok(reference!.imageShortId.length > 0);
  } finally {
    await close();
  }
});

// build-cache-usage-service.md — a record standing for build input rather than a
// layer answers with NonLayerCacheRecord, naming the type, instead of an empty
// list and no explanation.
test("GET /api/builders/cache/:id/usage states NonLayerCacheRecord for a record holding build input", async (t) => {
  const records = await ownCacheRecords();
  const nonLayer = records.find((raw) => raw.Type !== "regular");
  if (!nonLayer) {
    // This run's own build left no non-layer record carrying its marker, and a
    // record somebody else created is not this test's to assert on. The reason
    // itself is covered exhaustively by build-cache-usage-service.test.ts.
    t.skip("this run's build left no non-layer cache record of its own");
    return;
  }

  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  try {
    const response = await fetch(`${url}/api/builders/cache/${encodeURIComponent(nonLayer.ID)}/usage`);
    assert.equal(response.status, 200);
    const usage = (await response.json()) as BuildCacheUsage;

    assert.deepEqual(usage.references, []);
    assert.equal(usage.unavailableReason, "NonLayerCacheRecord");
    assert.ok(usage.unavailableDetail!.includes(nonLayer.Type), `expected the record's type in the detail, got: ${usage.unavailableDetail}`);
  } finally {
    await close();
  }
});

// builders-endpoints.md — "404 -> no build-cache record carries that id."
test("GET /api/builders/cache/:id/usage answers 404 for an id no build-cache record carries", async () => {
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  try {
    const response = await fetch(`${url}/api/builders/cache/does-not-exist-${Date.now()}/usage`);

    assert.equal(response.status, 404);
  } finally {
    await close();
  }
});
