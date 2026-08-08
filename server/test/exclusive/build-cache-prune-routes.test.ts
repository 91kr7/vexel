import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildersRouter } from "../../src/builders/builders-routes.js";
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

// `docker buildx prune` (build-cache-service.md) reclaims whichever builder is
// currently active, host-wide and unscopable by any filter this app exposes —
// exactly like the container/image/volume/network prune tests in this same
// folder. It lives apart and runs alone. See batch-test-isolation.md, INT-4.
//
// It carries one extra hazard the other prune tests do not: what gets reclaimed
// depends on which builder is active. The test therefore creates a builder of
// its own, makes it active through the app, and checks — before ever calling
// prune — that every record the app is about to reclaim is genuinely that
// builder's own (its ids read straight from `buildx du --builder <name>`). That
// check is an assertion, not a skip: if the app's own select-active did not
// take effect, that is a defect to surface, and no prune is issued.

function fixtureName(caseName: string): string {
  return `vexel-test-builder-${caseName}-${RUN_ID}`;
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

/** The fixture builder's own build-cache record ids, queried directly and scoped with `--builder` — the one reliable way to attribute cache to a specific builder on this host. */
async function ownCacheRecordIds(builderName: string): Promise<Set<string>> {
  const { stdout } = await execFileAsync("docker", ["buildx", "du", "--builder", builderName, "--format", "json"]);
  const lines = stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return new Set(lines.map((line) => (JSON.parse(line) as { ID: string }).ID));
}

async function buildWithBuilder(builderName: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "vexel-test-builder-prune-"));
  try {
    await writeFile(join(dir, "Dockerfile"), "FROM alpine:3.20\nRUN echo vexel-test-prune-marker > /tmp/marker\n", "utf8");
    await execFileAsync("docker", ["buildx", "build", "--builder", builderName, dir]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// plan-docker_management_app/REQ-91 — the build cache can be pruned, reporting the space reclaimed
test("POST /api/builders/cache/prune reclaims the active builder's reclaimable cache and reports the space reclaimed", async () => {
  const name = fixtureName("prune");
  const { url, close } = await startApp(buildApp("/api/builders", buildersRouter));
  let originalActive: string | undefined;
  try {
    await createBuilderQuietly(name);
    await buildWithBuilder(name);
    originalActive = await currentActiveBuilder();
    const ownIds = await ownCacheRecordIds(name);
    assert.ok(ownIds.size > 0, "expected the fixture build to leave at least one cache record");

    await fetch(`${url}/api/builders/${name}/use`, { method: "POST" });
    const beforePrune = await fetchCache(url);
    assert.ok(beforePrune.length > 0, "expected the app to see the fixture builder's cache once it is the active one");
    assert.ok(
      beforePrune.every((record) => ownIds.has(record.id)),
      "the app's cache inventory holds records that are not the fixture builder's own: the select-active did not take effect, so pruning would reclaim another builder's cache",
    );

    const response = await fetch(`${url}/api/builders/cache/prune`, { method: "POST" });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { reclaimedBytes: number };
    assert.ok(typeof body.reclaimedBytes === "number" && body.reclaimedBytes > 0);

    const afterPrune = await fetchCache(url);
    assert.ok(
      afterPrune.every((record) => record.usageState !== "reclaimable"),
      "expected no reclaimable record left after pruning",
    );
  } finally {
    if (originalActive) await useBuilderQuietly(originalActive);
    await removeBuilderQuietly(name);
    await close();
  }
});
