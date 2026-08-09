import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildersRouter } from "../../src/builders/builders-routes.js";
import type { BuilderSummary } from "../../src/builders/builders-service.js";
import type { BuildCacheRecord } from "../../src/builders/build-cache-service.js";
import { buildApp, startApp } from "../support/fixtures.js";
import { ALPINE_IMAGE, ensureImages } from "../support/base-images.js";

// A pruned daemon is a starting state like any other: the base images this
// file's fixtures are built on are ensured here, before the first test, so no
// test has to assume a warm daemon nor depend on another file having pulled
// them. They are shared infrastructure, not fixtures: nothing removes them.
await ensureImages([ALPINE_IMAGE]);

const execFileAsync = promisify(execFile);
const RUN_ID = `${process.pid}-${Date.now()}`;

// `docker buildx use` (builders-service.md, "sets `name` as the builder
// `docker buildx build` uses by default") writes the current-builder file of
// the operator's own Docker configuration: machine-wide state, visible to every
// process at once and scopable by no label. While it holds, `buildx du`,
// `buildx prune` and any `buildx build` without an explicit `--builder` answer
// for another builder than the one their caller means — which is precisely what
// made the parallel API pass flake. The two tests that need the active builder
// switched therefore live apart and run alone, like the prune tests in this
// same folder (CLAUDE.md, "Destructive-by-nature tests ... cannot be scoped, so
// they live apart"). The operator's own active builder is read at run time and
// restored whether the test passes or fails.

function fixtureName(caseName: string): string {
  return `vexel-test-builder-${caseName}-${RUN_ID}`;
}

async function fetchBuilders(url: string): Promise<BuilderSummary[]> {
  const response = await fetch(`${url}/api/builders`);
  return (await response.json()) as BuilderSummary[];
}

async function fetchCache(url: string): Promise<BuildCacheRecord[]> {
  const response = await fetch(`${url}/api/builders/cache`);
  return (await response.json()) as BuildCacheRecord[];
}

async function createBuilderQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["buildx", "create", "--name", name, "--driver", "docker-container"]);
}

async function removeBuilderQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["buildx", "rm", name]).catch(() => undefined);
}

/** The builder `docker buildx build` currently defaults to, so a test that switches it can restore it: the active builder is the operator's own global state, not a fixture of any one test. */
async function currentActiveBuilder(): Promise<string | undefined> {
  const { stdout } = await execFileAsync("docker", ["buildx", "ls", "--format", "json"]);
  const lines = stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  for (const line of lines) {
    const parsed = JSON.parse(line) as { Name: string; Current: boolean };
    if (parsed.Current) return parsed.Name;
  }
  return undefined;
}

async function useBuilderQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["buildx", "use", name]).catch(() => undefined);
}

/** A minimal, offline build against a given builder, so it accumulates a build-cache record of its own without touching any other builder's cache. */
async function buildWithBuilder(builderName: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "vexel-test-builder-"));
  try {
    await writeFile(join(dir, "Dockerfile"), "FROM alpine:3.20\nRUN echo vexel-test-marker > /tmp/marker\n", "utf8");
    await execFileAsync("docker", ["buildx", "build", "--builder", builderName, dir]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The fixture builder's own build-cache record ids, queried directly and scoped with `--builder` — the one way to attribute a cache record to a specific builder. */
async function ownCacheRecordIds(builderName: string): Promise<Set<string>> {
  const { stdout } = await execFileAsync("docker", ["buildx", "du", "--builder", builderName, "--format", "json"]);
  const lines = stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return new Set(lines.map((line) => (JSON.parse(line) as { ID: string }).ID));
}

// plan-docker_management_app/REQ-88 — another builder can be selected as the active one;
// builders-endpoints.md — "POST /api/builders/:name/use ... 200 -> the resulting builder (now
// active)"
test("POST /api/builders/:name/use switches the active builder, restored afterwards", async () => {
  const name = fixtureName("use");
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  let originalActive: string | undefined;
  try {
    await createBuilderQuietly(name);
    originalActive = await currentActiveBuilder();
    const response = await fetch(`${url}/api/builders/${name}/use`, { method: "POST" });
    assert.equal(response.status, 200);
    const used = (await response.json()) as BuilderSummary;
    assert.equal(used.name, name);
    assert.equal(used.active, true);

    const builders = await fetchBuilders(url);
    const found = builders.find((builder) => builder.name === name);
    assert.equal(found!.active, true);
  } finally {
    if (originalActive) await useBuilderQuietly(originalActive);
    await removeBuilderQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-91 — the build cache is listed record by record with id, type,
// size and usage state. Read-only (no prune involved). The assertion is on this test's own
// fixture: the builder it created is made active, a build is run on it, and the records that
// build left behind — identified by their own ids, read straight from buildx — must appear in
// the endpoint's answer, each carrying the four contracted fields. Never a total, never a count
// of the host's cache.
test("GET /api/builders/cache lists a build-cache record with its id, type, size and usage state", async () => {
  const name = fixtureName("cache-list");
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  let originalActive: string | undefined;
  try {
    await createBuilderQuietly(name);
    originalActive = await currentActiveBuilder();
    await fetch(`${url}/api/builders/${name}/use`, { method: "POST" });
    await buildWithBuilder(name);
    const ownIds = await ownCacheRecordIds(name);
    assert.ok(ownIds.size > 0, "expected the fixture build to leave at least one cache record");

    const records = await fetchCache(url);
    const own = records.filter((record) => ownIds.has(record.id));
    assert.ok(own.length > 0, "expected the fixture builder's own cache records in the endpoint's answer");
    for (const record of own) {
      assert.ok(record.id.length > 0);
      assert.ok(record.type.length > 0);
      assert.ok(typeof record.sizeBytes === "number" && record.sizeBytes >= 0);
      assert.ok(["shared", "in-use", "reclaimable"].includes(record.usageState));
    }

    // plan-docker_management_app/REQ-88 — a builder is listed with its cache size; now that this
    // builder is running and has built something, its own cache size must be readable (and
    // therefore present, per builders-service.md, which only omits it when it cannot be read).
    const builders = await fetchBuilders(url);
    const fixtureBuilder = builders.find((builder) => builder.name === name);
    assert.ok(fixtureBuilder, "created builder not found in the list");
    assert.ok(
      typeof fixtureBuilder!.cacheBytes === "number" && fixtureBuilder!.cacheBytes > 0,
      `expected a readable cache size for the fixture builder, got ${String(fixtureBuilder!.cacheBytes)}`,
    );
  } finally {
    if (originalActive) await useBuilderQuietly(originalActive);
    // Removing the builder removes the container it ran in, and with it the
    // build cache this test filled: nothing of the host's cache is touched.
    await removeBuilderQuietly(name);
    await close();
  }
});
