import { test } from "node:test";
import assert from "node:assert/strict";
import { volumesRouter } from "../../src/volumes/volumes-routes.js";
import { volumeSizeCache, type VolumeSummary } from "../../src/volumes/volumes-service.js";
import { EVENT_GROUPING_WINDOW_MS, resetRefreshCache } from "../../src/refresh-cache/refresh-cache.js";
import { eventStreamService } from "../../src/events/event-stream-service.js";
import { TINY_IMAGE, ensureImage } from "../support/base-images.js";
import {
  buildApp,
  fixtureName,
  ownershipArgs,
  removeContainerQuietly,
  removeVolumeQuietly,
  startApp,
} from "../support/fixtures.js";
import { execFileAsync } from "../support/docker-cli.js";

// The measurement the report of plan-docker_management_app-refresh_cache/REQ-52
// was written from, against the real daemon: a volume and four containers
// mounting it, on a server that has been running for a while. `GET /api/volumes`
// reported `mountedBy` 0, then 1, and reached 4 after 27.9 s — the volume list's
// own period.
//
// The server is warm on purpose (REQ-56): it holds a container listing before
// the fixtures exist, which is the only state the defect has. On a server that
// holds nothing the derived read joins the read in flight and answers correctly
// without the correction.

/** Four, as the report measured it and as the end-to-end spec that surfaced the defect creates them. */
const MOUNTING_CONTAINERS = 4;

/** volumes-service.md — the volume list's own period, and what the answer must not wait for. */
const VOLUME_LIST_PERIOD_MS = 30_000;

async function fetchList(url: string): Promise<VolumeSummary[]> {
  const response = await fetch(`${url}/api/volumes`);
  const text = await response.text();
  assert.equal(response.status, 200, `expected the volume listing, got ${response.status}: ${text}`);
  return JSON.parse(text) as VolumeSummary[];
}

function ofVolume(volumes: VolumeSummary[], name: string): VolumeSummary {
  const found = volumes.find((volume) => volume.name === name);
  assert.ok(found, `the fixture volume ${name} is not in the listing at all`);
  return found;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// REQ-52 — "A volume's mounting containers … are complete within a fraction of a second of the
// daemon holding them, on a server that already holds a listing as much as on one just started."
test("GET /api/volumes names every container mounting the volume on a server that already held a listing", async () => {
  const volumeName = fixtureName("derived-mounted-volume");
  const containerNames = Array.from({ length: MOUNTING_CONTAINERS }, (_unused, index) =>
    fixtureName(`derived-mounting-${index}`),
  );
  const { url, close } = await startApp(buildApp("/api/volumes", volumesRouter));
  try {
    await ensureImage(TINY_IMAGE);
    resetRefreshCache();

    // The per-volume sizes are read on their own, are not waited for by a
    // listing, and the **first** ones to arrive say the volume list has changed
    // — which reads it again at a moment nothing here controls, on /system/df's
    // own timing. A server "running for a while" holds them already, so they are
    // held before the fixtures exist rather than landing in the middle of the
    // case and correcting it by accident.
    await volumeSizeCache.read();

    // Warm: the server now holds a volume list and, under it, the container
    // listing that list is built on — neither of which knows the fixtures below.
    const warm = await fetchList(url);
    assert.equal(
      warm.some((volume) => volume.name === volumeName),
      false,
      "the fixture volume existed before this case created it",
    );

    await execFileAsync("docker", ["volume", "create", ...ownershipArgs(volumeName), volumeName]);
    for (const name of containerNames) {
      // Created, never started: the daemon reports a volume's mounts from every
      // container it holds, running or not, so nothing here needs a process.
      await execFileAsync("docker", [
        "create",
        "--name",
        name,
        ...ownershipArgs(name),
        "-v",
        `${volumeName}:/data`,
        TINY_IMAGE,
      ]);
    }

    // The daemon's own container event, as the server's event stream republishes
    // it: it marks the container listing due and the volume list beside it.
    const changedAt = Date.now();
    eventStreamService.emit("event", {
      id: `container-create-${changedAt}`,
      timestamp: new Date(changedAt).toISOString(),
      type: "container",
      action: "create",
    });

    // The contract bounds the derived re-read by one grouping window, so this
    // lets that window pass **once** and then asks **once** (REQ-57): nothing
    // retries, nothing polls, and nothing here grows to accommodate a slow
    // answer. The budget is an order of magnitude under the volume list's own
    // 30 s period, which is what a product without the correction waits out.
    const budgetMs = EVENT_GROUPING_WINDOW_MS * 2 + 500;
    assert.ok(budgetMs * 10 < VOLUME_LIST_PERIOD_MS, "the budget is not clear of the volume list's own period");
    await delay(budgetMs);

    const volume = ofVolume(await fetchList(url), volumeName);
    assert.deepEqual(
      [...volume.mountedBy].sort(),
      [...containerNames].sort(),
      `${Date.now() - changedAt} ms after the change the volume is reported as mounted by ${volume.mountedBy.length} of ${MOUNTING_CONTAINERS} containers: ${JSON.stringify(volume.mountedBy)}`,
    );
  } finally {
    for (const name of containerNames) await removeContainerQuietly(name);
    await removeVolumeQuietly(volumeName);
    await close();
  }
});
