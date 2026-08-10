import { test } from "node:test";
import assert from "node:assert/strict";
import { systemRouter } from "../../src/system/system-routes.js";
import type { DiskUsageBreakdown } from "../../src/system/disk-usage-service.js";
import { BASE_IMAGE, buildApp, fixtureName, ownershipArgs, removeContainerQuietly, startApp } from "../support/fixtures.js";
import { ensureImage } from "../support/base-images.js";
import { execFileAsync } from "../support/docker-cli.js";

// Everything the system area can be established on without touching the host
// lives here: the shape and canonical order of the breakdown, the reading being
// read-only, and the requests the prune endpoint refuses outright. The prunes
// themselves act on the whole host and cannot be scoped, so they live in
// test/exclusive/ (system-prune-routes.test.ts).
//
// No assertion is made on host totals or on a category being empty: the
// operator's own containers, images, volumes and networks are on this daemon
// and other API files run in parallel. Only the fixtures this file creates are
// asserted upon.

const CANONICAL_ORDER = ["stopped-containers", "dangling-images", "unused-volumes", "unused-networks", "build-cache"];

/** A container in the `created` state — one of the states a prune of stopped containers acts on — that never runs. */
async function createStoppedContainer(caseName: string): Promise<string> {
  const name = fixtureName(caseName);
  await ensureImage(BASE_IMAGE);
  await execFileAsync("docker", [
    "create",
    "--name",
    name,
    ...ownershipArgs(caseName),
    "--entrypoint",
    "sleep",
    BASE_IMAGE,
    "300",
  ]);
  return name;
}

async function containerExists(name: string): Promise<boolean> {
  const { stdout } = await execFileAsync("docker", ["ps", "-aq", "--filter", `name=^${name}$`]).catch(() => ({ stdout: "" }));
  return stdout.trim().length > 0;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The breakdown, re-read until the daemon's own accounting has caught up with a
 * container created a moment earlier.
 *
 * The reading is built on `/system/df`, and the daemon answers a call that
 * arrives while another one is being computed with that other call's result —
 * a snapshot that can predate the fixture. On an idle host the computation is
 * too short for that to be observable; during the parallel API pass it is not
 * (measured: 2 readings out of 40 missed a container created before the request
 * was issued). The delay belongs to the daemon's accounting, not to REQ-95, so
 * it is waited out rather than asserted upon — while a non-200 is never
 * retried and still fails immediately, carrying the body the endpoint sent.
 */
async function breakdownAccountingFor(url: string, name: string): Promise<DiskUsageBreakdown> {
  let body: DiskUsageBreakdown | undefined;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(`${url}/api/system/disk-usage`);
    // The answer's own text goes into the failure message: a reading that did
    // not come back names the reason in its body, and reporting the status alone
    // loses it.
    const text = await response.text();
    assert.equal(response.status, 200, `expected the breakdown, got ${response.status}: ${text}`);
    body = JSON.parse(text) as DiskUsageBreakdown;
    const stopped = body.categories.find((category) => category.id === "stopped-containers")!;
    // Past twenty the names are capped, so the fixture cannot be required among
    // them and there is nothing left to wait for.
    if (stopped.itemCount > 20 || stopped.items.includes(name)) break;
    await delay(300);
  }
  return body!;
}

// plan-docker_management_app/REQ-95 — reclaimable disk space is broken down by the five categories,
// each with its size and what it contains
test("GET /api/system/disk-usage answers the five categories, once each, in the canonical order", async () => {
  const { url, close } = await startApp(buildApp("/api/system", systemRouter));
  try {
    const response = await fetch(`${url}/api/system/disk-usage`);
    // The answer's own text goes into the failure message: a reading that did
    // not come back names the reason in its body, and reporting the status alone
    // loses it.
    const text = await response.text();
    assert.equal(response.status, 200, `expected the breakdown, got ${response.status}: ${text}`);
    const body = JSON.parse(text) as DiskUsageBreakdown;

    assert.deepEqual(
      body.categories.map((category) => category.id),
      CANONICAL_ORDER,
    );
    for (const category of body.categories) {
      assert.equal(typeof category.sizeBytes, "number", `${category.id} must carry a size`);
      assert.equal(typeof category.itemCount, "number", `${category.id} must carry a count`);
      assert.ok(Array.isArray(category.items), `${category.id} must name what it holds`);
      // system/specs/disk-usage-service.md — items are capped at 20 while itemCount stays true.
      assert.ok(category.items.length <= 20, `${category.id} names more than twenty items`);
      assert.ok(category.items.length <= category.itemCount, `${category.id} names more items than it counts`);
      if (category.unavailableDetail !== undefined) {
        assert.equal(category.sizeBytes, 0);
        assert.equal(category.itemCount, 0);
        assert.deepEqual(category.items, []);
      }
    }
    assert.equal(
      body.totalReclaimableBytes,
      body.categories.reduce((total, category) => total + category.sizeBytes, 0),
    );
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-95 — the breakdown says what each category contains: a container
// this test stopped is part of what a prune of stopped containers would take
test("GET /api/system/disk-usage counts a container of this test's own among the stopped ones", async () => {
  const { url, close } = await startApp(buildApp("/api/system", systemRouter));
  let name = "";
  try {
    name = await createStoppedContainer("disk-usage-stopped");

    const body = await breakdownAccountingFor(url, name);
    const stopped = body.categories.find((category) => category.id === "stopped-containers")!;

    assert.equal(stopped.unavailableDetail, undefined);
    assert.ok(stopped.itemCount >= 1, "the container created here must be counted");
    // The names are capped at twenty: only when the host holds no more than that can this
    // fixture be required among them.
    if (stopped.itemCount <= 20) {
      assert.ok(stopped.items.includes(name), `expected ${name} among ${stopped.items.join(", ")}`);
    }

    // system-endpoints.md — "Nothing is pruned by a GET".
    assert.equal(await containerExists(name), true);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// system/specs/system-endpoints.md — "400 -> scope missing, empty, not an array, or naming a
// category that does not exist; nothing is pruned"
test("POST /api/system/prune refuses a request whose scope is missing, empty, not an array or unknown", async () => {
  const { url, close } = await startApp(buildApp("/api/system", systemRouter));
  let name = "";
  try {
    name = await createStoppedContainer("prune-rejected");
    const rejected: unknown[] = [{}, { scope: [] }, { scope: "stopped-containers" }, { scope: ["everything"] }, { scope: ["stopped-containers", "everything"] }];

    for (const payload of rejected) {
      const response = await fetch(`${url}/api/system/prune`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      assert.equal(response.status, 400, `expected ${JSON.stringify(payload)} to be refused`);
      const body = (await response.json()) as { error?: string };
      assert.equal(typeof body.error, "string");
    }

    // "nothing is pruned": the stopped container this test created is still there.
    assert.equal(await containerExists(name), true);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});
