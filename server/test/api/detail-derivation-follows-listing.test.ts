import { test } from "node:test";
import assert from "node:assert/strict";
import { volumesRouter } from "../../src/volumes/volumes-routes.js";
import { type VolumeInspect, type VolumeSummary } from "../../src/volumes/volumes-service.js";
import { diskUsageCache } from "../../src/system/disk-usage-service.js";
import { containerListCache } from "../../src/containers/containers-service.js";
import { resetRefreshCache } from "../../src/refresh-cache/refresh-cache.js";
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

// The case the report of plan-docker_management_app-refresh_cache/REQ-58 was
// written from, against the real daemon: a volume, a container mounting it, the
// container removed from outside the application, and the detail asked once on
// the daemon's own announcement — which is exactly when the open panel asks,
// since it re-reads on events and on nothing else.
//
// The server is warm on purpose (REQ-62): it holds a container listing naming
// that container before it is removed, which is the only state the defect has.
// On a server that holds nothing the derived read joins the read in flight and
// answers correctly without the correction.

/** containers-service.md — the container listing's own period, which REQ-60 says this answer never waits out. */
const CONTAINER_LIST_PERIOD_MS = 20_000;

async function fetchList(url: string): Promise<VolumeSummary[]> {
  const response = await fetch(`${url}/api/volumes`);
  const text = await response.text();
  assert.equal(response.status, 200, `expected the volume listing, got ${response.status}: ${text}`);
  return JSON.parse(text) as VolumeSummary[];
}

async function fetchInspect(url: string, name: string): Promise<VolumeInspect> {
  // The signal is a guard against an answer that never comes, not a budget to
  // wait out: it is shorter than the container listing's own period, which
  // REQ-60 forbids this answer from reaching.
  const response = await fetch(`${url}/api/volumes/${name}/inspect`, {
    signal: AbortSignal.timeout(CONTAINER_LIST_PERIOD_MS / 2),
  });
  const text = await response.text();
  assert.equal(response.status, 200, `expected the volume detail, got ${response.status}: ${text}`);
  return JSON.parse(text) as VolumeInspect;
}

// REQ-58 — "an answer given after the daemon has announced a container's removal never names that
// container … on a server that already holds a container listing as much as on one just started."
test("GET /api/volumes/:name/inspect asked on the announcement no longer names the removed container", async () => {
  const volumeName = fixtureName("detail-mounted-volume");
  const containerName = fixtureName("detail-mounting-container");
  const { url, close } = await startApp(buildApp("/api/volumes", volumesRouter));
  try {
    await ensureImage(TINY_IMAGE);
    resetRefreshCache();

    // The held /system/df reading the sizes come from is read on its own and
    // the **first** sizes to
    // arrive say the volume list has changed, which would read it again at a
    // moment nothing here controls. A server "running for a while" holds them
    // already, so they are held before the fixtures exist.
    await diskUsageCache.read();

    // Warm: the server holds a volume list and, under it, the container listing
    // the detail derives from — neither of which knows the fixtures below.
    const warm = await fetchList(url);
    assert.equal(
      warm.some((volume) => volume.name === volumeName),
      false,
      "the fixture volume existed before this case created it",
    );

    await execFileAsync("docker", ["volume", "create", ...ownershipArgs(volumeName), volumeName]);
    // Created, never started: the daemon reports a volume's mounts from every
    // container it holds, running or not, so nothing here needs a process.
    await execFileAsync("docker", [
      "create",
      "--name",
      containerName,
      ...ownershipArgs(containerName),
      "-v",
      `${volumeName}:/data`,
      TINY_IMAGE,
    ]);

    // The state the defect needs: the listing the server holds names the
    // container that is about to go.
    containerListCache.markChanged();
    const before = await fetchInspect(url, volumeName);
    assert.deepEqual(
      before.mountedBy,
      [containerName],
      "the held listing never named the container mounting the volume, so this case starts from the wrong state",
    );

    await execFileAsync("docker", ["rm", "-fv", containerName]);
    // The daemon's own container event, as the server's event stream
    // republishes it: it marks the container listing due.
    const announcedAt = Date.now();
    eventStreamService.emit("event", {
      id: `container-destroy-${announcedAt}`,
      timestamp: new Date(announcedAt).toISOString(),
      type: "container",
      action: "destroy",
    });

    // Asked once, at once, and asserted once (REQ-63): nothing here retries,
    // polls or waits before asking. Waiting would replace the copy the
    // announcement is replacing and the old product would answer correctly too.
    const after = await fetchInspect(url, volumeName);
    const elapsed = Date.now() - announcedAt;
    assert.deepEqual(
      after.mountedBy,
      [],
      `${elapsed} ms after the announcement the detail still names ${JSON.stringify(after.mountedBy)}`,
    );
    assert.ok(
      elapsed < CONTAINER_LIST_PERIOD_MS,
      `the detail took ${elapsed} ms, which is the container listing's own period waited out`,
    );
  } finally {
    await removeContainerQuietly(containerName);
    await removeVolumeQuietly(volumeName);
    await close();
  }
});
