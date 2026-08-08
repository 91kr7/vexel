import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildersRouter } from "../../src/builders/builders-routes.js";
import type { BuildCacheRecord, BuilderSummary } from "../../src/builders/builders-service.js";
import { buildApp, startApp } from "../support/fixtures.js";
import { ALPINE_IMAGE, ensureImages } from "../support/base-images.js";

// A pruned daemon is a starting state like any other: the base images this
// file's fixtures are built on are ensured here, before the first test, so no
// test has to assume a warm daemon nor depend on another file having pulled
// them. They are shared infrastructure, not fixtures: nothing removes them.
await ensureImages([ALPINE_IMAGE]);

const execFileAsync = promisify(execFile);
const RUN_ID = `${process.pid}-${Date.now()}`;

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

async function createBuilderQuietly(name: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync("docker", ["buildx", "create", "--name", name, "--driver", "docker-container", ...extraArgs]);
}

async function removeBuilderQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["buildx", "rm", name]).catch(() => undefined);
}

/** The builder `docker buildx build` currently defaults to, so a test that switches it can restore it: the active builder is global daemon state, not a fixture of any one test. */
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

// plan-docker_management_app/REQ-88 — buildx builders are listed with name, driver, endpoint,
// supported platforms, status and cache size; the builder currently in use is identified
test("GET /api/builders lists a created builder with its driver, platforms and endpoint, not marked active", async () => {
  const name = fixtureName("list");
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  await createBuilderQuietly(name, ["--platform", "linux/amd64,linux/arm64"]);
  try {
    const builders = await fetchBuilders(url);
    const found = builders.find((builder) => builder.name === name);
    assert.ok(found, "created builder not found in the list");
    assert.equal(found!.driver, "docker-container");
    assert.deepEqual(found!.platforms.sort(), ["linux/amd64", "linux/arm64"]);
    assert.ok(found!.endpoint.length > 0);
    assert.equal(found!.active, false);
    // Never bootstrapped: its cache cannot be read, so cacheBytes stays omitted rather than 0.
    assert.equal(found!.cacheBytes, undefined);
  } finally {
    await removeBuilderQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-88 — another builder can be selected as the active one
test("POST /api/builders/:name/use switches the active builder, restored afterwards", async () => {
  const name = fixtureName("use");
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  await createBuilderQuietly(name);
  const originalActive = await currentActiveBuilder();
  try {
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

// plan-docker_management_app/REQ-89 — a builder can be created with a name, driver and platforms
test("POST /api/builders creates a builder with the given name, driver and platforms", async () => {
  const name = fixtureName("create");
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  try {
    const response = await fetch(`${url}/api/builders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, driver: "docker-container", platforms: ["linux/amd64"] }),
    });
    assert.equal(response.status, 201);
    const created = (await response.json()) as BuilderSummary;
    assert.equal(created.name, name);
    assert.equal(created.driver, "docker-container");
    assert.deepEqual(created.platforms, ["linux/amd64"]);
    assert.equal(created.active, false);

    const builders = await fetchBuilders(url);
    assert.ok(builders.some((builder) => builder.name === name));
  } finally {
    await removeBuilderQuietly(name);
    await close();
  }
});

// builders-endpoints.md — name/driver are required
test("POST /api/builders with a missing driver is rejected with 400, creating nothing", async () => {
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  try {
    const response = await fetch(`${url}/api/builders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: fixtureName("no-driver") }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// builders-service.md — createBuilder rejects with the daemon's own message on a name collision
test("POST /api/builders with a name colliding with an existing builder responds with the daemon's own rejection message", async () => {
  const name = fixtureName("dup");
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  await createBuilderQuietly(name);
  try {
    const response = await fetch(`${url}/api/builders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, driver: "docker-container" }),
    });
    assert.ok(response.status >= 400, `expected an error status, got ${response.status}`);
    const body = (await response.json()) as { error?: string };
    assert.match(body.error ?? "", /existing instance/i);
  } finally {
    await removeBuilderQuietly(name);
    await close();
  }
});

// builders-endpoints.md — "Any daemon/CLI-side failure on the above -> 502 (or the error's own
// status code)". Recorded explicitly rather than folded into the message-only assertion above.
test("a CLI-side failure on POST /api/builders defaults to 502 per the endpoint contract", async () => {
  const name = fixtureName("dup-status");
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  await createBuilderQuietly(name);
  try {
    const response = await fetch(`${url}/api/builders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, driver: "docker-container" }),
    });
    assert.equal(response.status, 502);
  } finally {
    await removeBuilderQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-89 — a builder can be removed
test("DELETE /api/builders/:name removes the builder so it no longer appears in the list", async () => {
  const name = fixtureName("remove");
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  await createBuilderQuietly(name);
  try {
    const response = await fetch(`${url}/api/builders/${name}`, { method: "DELETE" });
    assert.equal(response.status, 204);

    const builders = await fetchBuilders(url);
    assert.ok(!builders.some((builder) => builder.name === name));
  } finally {
    await removeBuilderQuietly(name);
    await close();
  }
});

// builders-service.md — removeBuilder rejects with the daemon's own message for an unknown name
test("DELETE /api/builders/:name for an unknown name responds with the daemon's own rejection message", async () => {
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  try {
    const response = await fetch(`${url}/api/builders/does-not-exist-${Date.now()}`, { method: "DELETE" });
    assert.ok(response.status >= 400, `expected an error status, got ${response.status}`);
    const body = (await response.json()) as { error?: string };
    assert.match(body.error ?? "", /no builder|not found/i);
  } finally {
    await close();
  }
});

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

// plan-docker_management_app/REQ-91 — the build cache is listed record by record with id, type,
// size and usage state. Read-only (no prune involved). The assertion is on this test's own
// fixture: the builder it created is made active, a build is run on it, and the records that
// build left behind — identified by their own ids, read straight from buildx — must appear in
// the endpoint's answer, each carrying the four contracted fields. Never a total, never a count
// of the host's cache.
test("GET /api/builders/cache lists a build-cache record with its id, type, size and usage state", async () => {
  const name = fixtureName("cache-list");
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  await createBuilderQuietly(name);
  const originalActive = await currentActiveBuilder();
  try {
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
    await removeBuilderQuietly(name);
    await close();
  }
});
