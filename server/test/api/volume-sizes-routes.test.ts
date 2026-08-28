/**
 * Volume sizes on a schedule of their own
 * (plan-docker_management_app-refresh_cache/REQ-18, REQ-19, REQ-22).
 *
 * What is under check is the daemon's own workload, so it is counted at the
 * daemon's own surface: every Engine API path this process requests is
 * recorded, and `/system/df` — the call that makes the daemon account for the
 * whole host's disk usage — is counted apart from the listings.
 *
 * The "never waits for it" half cannot be read from a call count, since a call
 * that is made and not awaited looks exactly like one that is awaited. It is
 * shown instead by making `/system/df` slow on purpose and asking for a listing:
 * an answer that arrives while that call is still outstanding is an answer that
 * did not wait for it.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { volumesRouter } from "../../src/volumes/volumes-routes.js";
import type { VolumeInspect, VolumeSummary } from "../../src/volumes/volumes-service.js";
import { EngineClient } from "../../src/docker/engine-client.js";
import { resetRefreshCache } from "../../src/refresh-cache/refresh-cache.js";
import { buildApp, ownershipArgs, removeContainerQuietly, removeVolumeQuietly, startApp } from "../support/fixtures.js";
import { ALPINE_IMAGE, ensureImage } from "../support/base-images.js";
import { execFileAsync } from "../support/docker-cli.js";

const RUN_ID = `${process.pid}-${Date.now()}`;

function fixtureName(caseName: string): string {
  return `vexel-test-volume-sizes-${caseName}-${RUN_ID}`;
}

/** Every Engine API path this process asks the daemon for, in order. */
const enginePaths: string[] = [];
/** While set, a request whose path matches is held back for this long before it is made. */
let heldPath: { pattern: RegExp; delayMs: number } | undefined;

const originalRequest = EngineClient.prototype.request;
EngineClient.prototype.request = async function (this: EngineClient, path: string, options = {}) {
  enginePaths.push(path);
  const held = heldPath;
  if (held !== undefined && held.pattern.test(path)) {
    await new Promise<void>((resolve) => {
      // Unreferenced: this delay exists to be outlived by the assertion, and must
      // never be a reason the process stays alive.
      setTimeout(resolve, held.delayMs).unref();
    });
  }
  return await originalRequest.call(this, path, options);
};

after(() => {
  EngineClient.prototype.request = originalRequest;
});

function countEngineCalls(pattern: RegExp): number {
  return enginePaths.filter((path) => pattern.test(path)).length;
}

const DISK_USAGE = /^\/system\/df/;
const VOLUME_LISTING = /^\/volumes(\?|$)/;

/** Puts every held value back to its registered state, so no case inherits what another read. */
function freshCache(): void {
  resetRefreshCache();
  enginePaths.length = 0;
  heldPath = undefined;
}

async function fetchList(url: string): Promise<VolumeSummary[]> {
  const response = await fetch(`${url}/api/volumes`);
  const text = await response.text();
  assert.equal(response.status, 200, `expected the volume listing, got ${response.status}: ${text}`);
  return JSON.parse(text) as VolumeSummary[];
}

async function createVolumeThroughTheApplication(url: string, name: string): Promise<void> {
  const response = await fetch(`${url}/api/volumes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, labels: { "vexel.test.run": RUN_ID } }),
  });
  const text = await response.text();
  assert.equal(response.status, 201, `expected the volume to be created, got ${response.status}: ${text}`);
}

/** Writes `megabytes` of content into a volume, so the daemon has a size to report for it. */
async function fillVolume(caseName: string, volumeName: string, megabytes: number): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync("docker", [
    "run", "--rm", "-v", `${volumeName}:/data`, ...ownershipArgs(caseName),
    "--entrypoint", "sh", ALPINE_IMAGE,
    "-c", `dd if=/dev/zero of=/data/blob bs=1048576 count=${megabytes}`,
  ]);
}

// plan-docker_management_app-refresh_cache/REQ-18, REQ-19 — listing volumes no longer makes the
// daemon compute its whole disk usage, and a volume created a moment ago is listed at once, with or
// without a size.
test("GET /api/volumes answers a volume just created without waiting for the daemon's disk usage", async () => {
  const name = fixtureName("immediate");
  const { url, close } = await startApp(buildApp("/api/volumes", volumesRouter));
  try {
    freshCache();
    // The whole-disk-usage read is made to take far longer than the listing may:
    // an answer that arrives meanwhile is an answer that did not wait for it.
    heldPath = { pattern: DISK_USAGE, delayMs: 20_000 };

    await createVolumeThroughTheApplication(url, name);
    assert.equal(countEngineCalls(DISK_USAGE), 0, "creating a volume asked the daemon for its disk usage");

    const startedAt = Date.now();
    const volumes = await fetchList(url);
    const elapsed = Date.now() - startedAt;

    const found = volumes.find((volume) => volume.name === name);
    assert.ok(found, "the volume created a moment ago is not in the listing");
    assert.ok(
      elapsed < 10_000,
      `the listing waited ${elapsed}ms, which is the whole-disk-usage read it must not wait for`,
    );
    assert.equal(
      found!.sizeBytes,
      undefined,
      "a size no read has produced yet must be absent, not awaited and not a zero",
    );
    assert.equal(found!.mountedBy.length, 0, "an unattached volume is listed with no mounting container");
  } finally {
    heldPath = undefined;
    await removeVolumeQuietly(name);
    await close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-18 — the size is read on its own schedule, far less
// frequently than the listing.
//
// Each round creates a volume through the application, which says the listing has changed, so the
// answer that follows is a listing genuinely read again rather than the one held. Five listings of
// the daemon must therefore cost the daemon no more than one whole-disk-usage read: a size read per
// listing is exactly what this batch removed, and `createVolume` deliberately marks no size due.
test("five volume listings read again cost the daemon at most one whole-disk-usage read", async () => {
  const names = [1, 2, 3, 4, 5].map((round) => fixtureName(`repeated-${round}`));
  const { url, close } = await startApp(buildApp("/api/volumes", volumesRouter));
  try {
    freshCache();

    for (const name of names) {
      await createVolumeThroughTheApplication(url, name);
      const volumes = await fetchList(url);
      assert.ok(
        volumes.some((volume) => volume.name === name),
        `the volume just created is missing from the listing that followed it`,
      );
    }

    assert.ok(
      countEngineCalls(VOLUME_LISTING) >= 5,
      `the five listings read the daemon's volume list ${countEngineCalls(VOLUME_LISTING)} times: they were not read again`,
    );
    assert.ok(
      countEngineCalls(DISK_USAGE) <= 1,
      `five listings cost ${countEngineCalls(DISK_USAGE)} whole-disk-usage reads: the size is not on a schedule of its own`,
    );
  } finally {
    for (const name of names) await removeVolumeQuietly(name);
    await close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-19 — volumes are still listed with their size and
// with the containers mounting them.
test("GET /api/volumes lists a volume with the size it holds and the container mounting it", async () => {
  const caseName = "sized";
  const volumeName = fixtureName(caseName);
  const containerName = `${volumeName}-holder`;
  const { url, close } = await startApp(buildApp("/api/volumes", volumesRouter));
  try {
    freshCache();
    await execFileAsync("docker", ["volume", "create", ...ownershipArgs(caseName), volumeName]);
    await fillVolume(caseName, volumeName, 2);
    await ensureImage(ALPINE_IMAGE);
    await execFileAsync("docker", [
      "run", "-d", "--name", containerName, ...ownershipArgs(caseName),
      "-v", `${volumeName}:/data`, "--entrypoint", "sleep", ALPINE_IMAGE, "300",
    ]);

    // The size is joined in from a value read on its own schedule, so the first
    // listing kicks that read off and a later one carries what it produced.
    let sized: VolumeSummary | undefined;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const volumes = await fetchList(url);
      const found = volumes.find((volume) => volume.name === volumeName);
      assert.ok(found, "the fixture volume is not in the listing");
      assert.deepEqual(found!.mountedBy, [containerName], "the container mounting the volume is not reported");
      if (found!.sizeBytes !== undefined) {
        sized = found;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    assert.ok(sized, "no size ever reached the volume listing");
    assert.ok(
      sized!.sizeBytes! >= 2 * 1024 * 1024,
      `the volume holds 2 MiB but is listed at ${sized!.sizeBytes} bytes`,
    );
  } finally {
    await removeContainerQuietly(containerName);
    await removeVolumeQuietly(volumeName);
    await close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-18, REQ-22 — a single volume's inspect stays a direct
// read of the daemon, and makes it compute no whole-host disk usage either.
test("GET /api/volumes/:name/inspect reads the daemon directly and waits for no disk-usage read", async () => {
  const name = fixtureName("inspect");
  const { url, close } = await startApp(buildApp("/api/volumes", volumesRouter));
  try {
    freshCache();
    await execFileAsync("docker", ["volume", "create", ...ownershipArgs("inspect"), name]);
    heldPath = { pattern: DISK_USAGE, delayMs: 20_000 };

    const startedAt = Date.now();
    const response = await fetch(`${url}/api/volumes/${name}/inspect`);
    const text = await response.text();
    const elapsed = Date.now() - startedAt;
    assert.equal(response.status, 200, `expected the inspect data, got ${response.status}: ${text}`);
    const inspect = JSON.parse(text) as VolumeInspect;

    assert.equal(inspect.name, name);
    assert.ok(inspect.raw && typeof inspect.raw === "object", "the inspect answer carries no raw payload");
    assert.ok(
      elapsed < 10_000,
      `the inspect waited ${elapsed}ms, which is the whole-disk-usage read it must not wait for`,
    );
    assert.equal(inspect.sizeBytes, undefined, "a size no read has produced yet must be absent from the inspect answer");

    // A detail read holds nothing: the second one reads the daemon again.
    const readsAfterFirst = countEngineCalls(new RegExp(`^/volumes/${name}`));
    const second = await fetch(`${url}/api/volumes/${name}/inspect`);
    assert.equal(second.status, 200);
    await second.text();
    assert.equal(
      countEngineCalls(new RegExp(`^/volumes/${name}`)),
      readsAfterFirst + 1,
      "the second inspect was answered from a held value instead of reading the daemon",
    );
  } finally {
    heldPath = undefined;
    await removeVolumeQuietly(name);
    await close();
  }
});
