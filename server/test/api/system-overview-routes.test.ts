import { test } from "node:test";
import assert from "node:assert/strict";
import { systemRouter } from "../../src/system/system-routes.js";
import type { SystemOverview } from "../../src/system/overview-service.js";
import {
  buildApp,
  createSleepingContainer,
  fixtureName,
  ownershipArgs,
  removeContainerQuietly,
  removeVolumeQuietly,
  startApp,
} from "../support/fixtures.js";
import { execFileAsync } from "../support/docker-cli.js";

// The dashboard's overview endpoint, against the real daemon
// (system-endpoints.md, overview-service.md).
//
// The daemon is the operator's own and other API files run in parallel, so no
// assertion is made on a host total or on a section being empty: only the
// fixtures this file creates are required to be accounted for, and only as a
// lower bound.

const CANONICAL_TOTAL_ORDER = ["images", "containers", "volumes", "build-cache"];

async function createVolume(caseName: string): Promise<string> {
  const name = fixtureName(caseName);
  await execFileAsync("docker", ["volume", "create", ...ownershipArgs(caseName), name]);
  return name;
}

async function containerExists(name: string): Promise<boolean> {
  const { stdout } = await execFileAsync("docker", ["ps", "-aq", "--filter", `name=^${name}$`]).catch(() => ({ stdout: "" }));
  return stdout.trim().length > 0;
}

// plan-docker_management_app/REQ-14, plan-docker_management_app/REQ-16 — the whole reading the
// dashboard is built from comes back in one payload: container counts by state, images, volumes,
// stacks, build cache with its builder, and the occupied-space breakdown
test("GET /api/system/overview answers every section of the overview, with its figures consistent", async () => {
  const { url, close } = await startApp(buildApp("/api/system", systemRouter));
  try {
    const response = await fetch(`${url}/api/system/overview`);
    // The answer's own text goes into the failure message: an overview that did
    // not come back names the reason in its body, and reporting the status alone
    // loses it.
    const text = await response.text();
    assert.equal(response.status, 200, `expected the overview, got ${response.status}: ${text}`);
    const body = JSON.parse(text) as SystemOverview;

    // overview-service.md — "running + paused + stopped === total"
    const { containers } = body;
    for (const key of ["total", "running", "paused", "stopped"] as const) {
      assert.equal(typeof containers[key], "number", `containers.${key} must be a number`);
    }
    assert.equal(containers.running + containers.paused + containers.stopped, containers.total);

    for (const section of [body.images, body.volumes]) {
      assert.equal(typeof section.count, "number");
      assert.equal(typeof section.sizeBytes, "number");
      assert.ok(section.sizeBytes >= 0);
    }

    // overview-service.md — "stacks: { compose, total } … so the two figures are equal", and the
    // section says nothing else at all: no cluster count, no reason one could not be read
    // (plan-docker_management_app-swarm_removal/REQ-6).
    assert.equal(typeof body.stacks.compose, "number");
    assert.equal(body.stacks.total, body.stacks.compose);
    assert.deepEqual(Object.keys(body.stacks).sort(), ["compose", "total"]);

    // overview-service.md — buildCache: a size, or the reason buildx could not be read.
    if (body.buildCache.unavailableDetail !== undefined) {
      assert.equal(body.buildCache.sizeBytes, 0);
      assert.equal(body.buildCache.activeBuilder, undefined);
    } else {
      assert.ok(body.buildCache.sizeBytes >= 0);
    }

    // disk-usage-service.md — the four occupied-space categories, once each, in canonical order,
    // and totalBytes as their sum.
    assert.deepEqual(
      body.diskUsage.categories.map((category) => category.id),
      CANONICAL_TOTAL_ORDER,
    );
    for (const category of body.diskUsage.categories) {
      assert.equal(typeof category.sizeBytes, "number", `${category.id} must carry a size`);
      assert.equal(typeof category.itemCount, "number", `${category.id} must carry a count`);
      if (category.unavailableDetail !== undefined) {
        assert.equal(category.sizeBytes, 0);
        assert.equal(category.itemCount, 0);
      }
    }
    assert.equal(
      body.diskUsage.totalBytes,
      body.diskUsage.categories.reduce((total, category) => total + category.sizeBytes, 0),
    );
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-14 — the tiles carry the daemon's real objects: a container this
// test is running and a volume it created are part of what the overview accounts for
test("GET /api/system/overview accounts for a running container and a volume of this test's own", async () => {
  const { url, close } = await startApp(buildApp("/api/system", systemRouter));
  let containerName = "";
  let volumeName = "";
  try {
    containerName = (await createSleepingContainer("overview-running")).name;
    volumeName = await createVolume("overview-volume");

    const response = await fetch(`${url}/api/system/overview`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as SystemOverview;

    assert.ok(body.containers.running >= 1, "the container started here must be counted as running");
    assert.ok(body.containers.total >= 1);
    assert.ok(body.volumes.count >= 1, "the volume created here must be counted");
    // The image the fixture runs is on the daemon, so the image store is not empty.
    assert.ok(body.images.count >= 1, "the fixture's own image must be counted");
    assert.ok(body.images.sizeBytes > 0, "an image store holding an image occupies disk");

    const containerCategory = body.diskUsage.categories.find((category) => category.id === "containers")!;
    assert.ok(containerCategory.itemCount >= 1, "the container started here must be part of the occupied-space breakdown");

    // system-endpoints.md — "Nothing is pruned by a GET": the reading starts and removes nothing.
    assert.equal(await containerExists(containerName), true);
  } finally {
    await removeContainerQuietly(containerName);
    await removeVolumeQuietly(volumeName);
    await close();
  }
});
