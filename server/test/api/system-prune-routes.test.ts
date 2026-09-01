import { test } from "node:test";
import assert from "node:assert/strict";
import { systemRouter } from "../../src/system/system-routes.js";
import type { PruneRunResult } from "../../src/system/prune-service.js";
import { BASE_IMAGE, buildApp, fixtureName, ownershipArgs, removeContainerQuietly, removeNetworkQuietly, removeVolumeQuietly, startApp } from "../support/fixtures.js";
import { ensureImage } from "../support/base-images.js";
import { execFileAsync } from "../support/docker-cli.js";

// The scoped prune reaches every stopped container / unused volume / unused
// network on the host, whoever created them: no labelling can scope the
// daemon's own prunes. The file therefore lives apart and runs alone, like the
// per-area prune tests beside it. Acceptance is established on the fixtures
// this file creates — they are gone, or they survived a scope that excluded
// them — never on host totals.

/** A container in the `created` state: one of the states a prune of stopped containers acts on. */
async function createStoppedContainer(caseName: string): Promise<string> {
  const name = fixtureName(caseName);
  await ensureImage(BASE_IMAGE);
  await execFileAsync("docker", ["create", "--name", name, ...ownershipArgs(caseName), "--entrypoint", "sleep", BASE_IMAGE, "300"]);
  return name;
}

async function createUnusedVolume(caseName: string): Promise<string> {
  const name = fixtureName(caseName);
  await execFileAsync("docker", ["volume", "create", ...ownershipArgs(caseName), name]);
  return name;
}

async function createUnusedNetwork(caseName: string): Promise<string> {
  const name = fixtureName(caseName);
  await execFileAsync("docker", ["network", "create", ...ownershipArgs(caseName), name]);
  return name;
}

async function containerExists(name: string): Promise<boolean> {
  const { stdout } = await execFileAsync("docker", ["ps", "-aq", "--filter", `name=^${name}$`]).catch(() => ({ stdout: "" }));
  return stdout.trim().length > 0;
}

async function volumeExists(name: string): Promise<boolean> {
  const { stdout } = await execFileAsync("docker", ["volume", "ls", "-q", "--filter", `name=^${name}$`]).catch(() => ({ stdout: "" }));
  return stdout.trim().length > 0;
}

async function networkExists(name: string): Promise<boolean> {
  const { stdout } = await execFileAsync("docker", ["network", "ls", "-q", "--filter", `name=^${name}$`]).catch(() => ({ stdout: "" }));
  return stdout.trim().length > 0;
}

async function postPrune(url: string, scope: string[]): Promise<{ status: number; body: PruneRunResult }> {
  const response = await fetch(`${url}/api/system/prune`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope }),
  });
  return { status: response.status, body: (await response.json()) as PruneRunResult };
}

// plan-docker_management_app/REQ-96 — a category can be pruned on its own, and the space actually
// reclaimed is reported
test("POST /api/system/prune with a scope of one removes that category and reports what went", async () => {
  const { url, close } = await startApp(buildApp("/api/system", systemRouter));
  let container = "";
  try {
    container = await createStoppedContainer("prune-one");

    const { status, body } = await postPrune(url, ["stopped-containers"]);

    assert.equal(status, 200);
    assert.deepEqual(
      body.categories.map((category) => category.categoryId),
      ["stopped-containers"],
    );
    const outcome = body.categories[0]!;
    assert.equal(outcome.error, undefined, `the prune failed: ${outcome.error}`);
    assert.ok(outcome.removedCount >= 1, "the container created here must be among what was removed");
    assert.equal(outcome.removed.length, outcome.removedCount);
    assert.ok(outcome.reclaimedBytes >= 0);
    assert.equal(body.reclaimedBytes, outcome.reclaimedBytes);
    assert.equal(await containerExists(container), false, "the stopped container should be gone");
  } finally {
    await removeContainerQuietly(container);
    await close();
  }
});

// plan-docker_management_app/REQ-96 / prune-service.md — "The scope is honored exactly: a category
// the caller did not name is never pruned"
test("POST /api/system/prune leaves untouched every category the scope did not name", async () => {
  const { url, close } = await startApp(buildApp("/api/system", systemRouter));
  let container = "";
  let volume = "";
  try {
    container = await createStoppedContainer("scope-honored");
    volume = await createUnusedVolume("scope-honored");

    const { status, body } = await postPrune(url, ["unused-volumes"]);

    assert.equal(status, 200);
    assert.deepEqual(
      body.categories.map((category) => category.categoryId),
      ["unused-volumes"],
    );
    assert.equal(body.categories[0]!.error, undefined);
    assert.ok(body.categories[0]!.removed.includes(volume), `expected ${volume} among the removed volumes`);
    assert.equal(await volumeExists(volume), false, "the unused volume should be gone");
    assert.equal(await containerExists(container), true, "a category outside the scope must not be pruned");
  } finally {
    await removeContainerQuietly(container);
    await removeVolumeQuietly(volume);
    await close();
  }
});

// plan-docker_management_app/REQ-96 / prune-service.md — a system-wide run reports one outcome per
// requested category, always in the canonical order, and totals what was actually reclaimed
test("POST /api/system/prune runs a multi-category scope in the canonical order and totals the run", async () => {
  const { url, close } = await startApp(buildApp("/api/system", systemRouter));
  let container = "";
  let network = "";
  try {
    container = await createStoppedContainer("multi-scope");
    network = await createUnusedNetwork("multi-scope");

    // Named back to front on purpose: the run's order is the canonical one, not the caller's.
    const { status, body } = await postPrune(url, ["unused-networks", "stopped-containers"]);

    assert.equal(status, 200);
    assert.deepEqual(
      body.categories.map((category) => category.categoryId),
      ["stopped-containers", "unused-networks"],
    );
    const networks = body.categories.find((category) => category.categoryId === "unused-networks")!;
    assert.equal(networks.error, undefined, `the network prune failed: ${networks.error}`);
    assert.ok(networks.removed.includes(network), `expected ${network} among the removed networks`);
    assert.equal(networks.reclaimedBytes, 0, "a network occupies no disk");
    assert.equal(await networkExists(network), false, "the unused network should be gone");
    assert.equal(await containerExists(container), false, "the stopped container should be gone");
    assert.equal(
      body.reclaimedBytes,
      body.categories.reduce((total, category) => total + category.reclaimedBytes, 0),
    );
  } finally {
    await removeContainerQuietly(container);
    await removeNetworkQuietly(network);
    await close();
  }
});
