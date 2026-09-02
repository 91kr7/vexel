import { test } from "node:test";
import assert from "node:assert/strict";
import { volumesRouter } from "../../src/volumes/volumes-routes.js";
import type { VolumePruneResult, VolumeSummary } from "../../src/volumes/volumes-service.js";
import { buildApp, ownershipArgs, removeVolumeQuietly, startApp } from "../support/fixtures.js";
import { execFileAsync } from "../support/docker-cli.js";

// Volume prune exercises the daemon's own prune semantics (`filters={"all":
// ["true"]}`, volumes-service.md), which act on every unused volume on the
// host, named or anonymous — not only the fixture set up here. No labelling
// can scope it, and it costs the file after this one nothing: the pass runs one
// file at a time and every file empties the daemon before it runs. Acceptance
// is established on the fixture created here, never on host totals.

async function createNamedVolume(name: string): Promise<void> {
  await execFileAsync("docker", ["volume", "create", ...ownershipArgs(name), name]);
}

async function fetchList(url: string): Promise<VolumeSummary[]> {
  const response = await fetch(`${url}/api/volumes`);
  return (await response.json()) as VolumeSummary[];
}

// plan-docker_management_app/REQ-71 — unused volumes can be pruned with the reclaimed space reported
test("POST /api/volumes/prune removes an unused named volume and reports it among the removed names", async () => {
  const name = `vexel-test-prune-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/volumes", volumesRouter));
  try {
    await createNamedVolume(name);
    const response = await fetch(`${url}/api/volumes/prune`, { method: "POST" });
    assert.equal(response.status, 200);
    const body = (await response.json()) as VolumePruneResult;
    assert.ok(body.removedNames.includes(name), `expected ${name} among the pruned volumes`);
    assert.ok(typeof body.reclaimedBytes === "number" && body.reclaimedBytes >= 0);

    const volumes = await fetchList(url);
    assert.ok(!volumes.some((volume) => volume.name === name));
  } finally {
    await removeVolumeQuietly(name);
    await close();
  }
});
