import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { volumesRouter } from "../../src/volumes/volumes-routes.js";
import type { VolumeInspect, VolumeSummary } from "../../src/volumes/volumes-service.js";
import { buildApp, createSleepingContainer, ownershipArgs, removeContainerQuietly, removeVolumeQuietly, startApp } from "../support/fixtures.js";

const execFileAsync = promisify(execFile);

async function fetchList(url: string): Promise<VolumeSummary[]> {
  const response = await fetch(`${url}/api/volumes`);
  return (await response.json()) as VolumeSummary[];
}

async function createNamedVolume(name: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync("docker", ["volume", "create", ...ownershipArgs(name), ...extraArgs, name]);
}

// plan-docker_management_app/REQ-70 — volumes are listed with name, driver, mountpoint, size and the
// containers mounting them, with unattached volumes identifiable
test("GET /api/volumes lists an unattached volume with its name, driver and mountpoint, and marks it unattached", async () => {
  const name = `vexel-test-list-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/volumes", volumesRouter));
  await createNamedVolume(name);
  try {
    const volumes = await fetchList(url);
    const found = volumes.find((volume) => volume.name === name);
    assert.ok(found, "created volume not found in the list");
    assert.equal(found!.driver, "local");
    assert.ok(found!.mountpoint.length > 0);
    assert.deepEqual(found!.mountedBy, []);
  } finally {
    await removeVolumeQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-70 — the containers mounting a volume are listed by name
test("GET /api/volumes reports the container mounting a volume as its mountedBy entry", async () => {
  const volumeName = `vexel-test-mounted-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/volumes", volumesRouter));
  await createNamedVolume(volumeName);
  const { name: containerName } = await createSleepingContainer("volume-mounted-by", ["-v", `${volumeName}:/data`]);
  try {
    const volumes = await fetchList(url);
    const found = volumes.find((volume) => volume.name === volumeName);
    assert.ok(found, "mounted volume not found in the list");
    assert.deepEqual(found!.mountedBy, [containerName]);
  } finally {
    await removeContainerQuietly(containerName);
    await removeVolumeQuietly(volumeName);
    await close();
  }
});

// plan-docker_management_app/REQ-71 — a volume can be inspected in full
test("GET /api/volumes/:name/inspect returns the volume's full inspect data, raw payload included", async () => {
  const name = `vexel-test-inspect-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/volumes", volumesRouter));
  await createNamedVolume(name, ["--label", "team=vexel"]);
  try {
    const response = await fetch(`${url}/api/volumes/${name}/inspect`);
    assert.equal(response.status, 200);
    const inspect = (await response.json()) as VolumeInspect;

    assert.equal(inspect.name, name);
    assert.equal(inspect.driver, "local");
    assert.equal(inspect.labels.team, "vexel");
    assert.ok(inspect.raw && typeof inspect.raw === "object");
  } finally {
    await removeVolumeQuietly(name);
    await close();
  }
});

// volumes-endpoints.md — an unknown name responds with the daemon's own 404 rejection
test("GET /api/volumes/:name/inspect with an unknown name responds with the daemon's own rejection message", async () => {
  const { url, close } = await startApp(buildApp("/api/volumes", volumesRouter));
  try {
    const response = await fetch(`${url}/api/volumes/does-not-exist-${Date.now()}/inspect`);
    assert.equal(response.status, 404);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-71 — a volume can be created with a name, driver, driver options and labels
test("POST /api/volumes creates a named volume carrying the given labels", async () => {
  const name = `vexel-test-create-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/volumes", volumesRouter));
  try {
    const response = await fetch(`${url}/api/volumes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, driver: "local", labels: { team: "vexel" } }),
    });
    assert.equal(response.status, 201);
    const created = (await response.json()) as VolumeSummary;
    assert.equal(created.name, name);
    assert.equal(created.labels.team, "vexel");

    const volumes = await fetchList(url);
    assert.ok(volumes.some((volume) => volume.name === name));
  } finally {
    await removeVolumeQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-71 — an empty/blank name lets the daemon generate one
test("POST /api/volumes with no name lets the daemon generate one, and it is reflected in the list", async () => {
  const { url, close } = await startApp(buildApp("/api/volumes", volumesRouter));
  let generatedName: string | undefined;
  try {
    const response = await fetch(`${url}/api/volumes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 201);
    const created = (await response.json()) as VolumeSummary;
    generatedName = created.name;
    assert.ok(created.name.length > 0);

    const volumes = await fetchList(url);
    assert.ok(volumes.some((volume) => volume.name === created.name));
  } finally {
    if (generatedName) await removeVolumeQuietly(generatedName);
    await close();
  }
});

// plan-docker_management_app/REQ-71 — a volume can be removed
test("DELETE /api/volumes/:name removes the volume so it no longer appears in the list", async () => {
  const name = `vexel-test-remove-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/volumes", volumesRouter));
  await createNamedVolume(name);
  try {
    const response = await fetch(`${url}/api/volumes/${name}`, { method: "DELETE" });
    assert.equal(response.status, 204);

    const volumes = await fetchList(url);
    assert.ok(!volumes.some((volume) => volume.name === name));
  } finally {
    await removeVolumeQuietly(name);
    await close();
  }
});

// volumes-service.md — removeVolume force-removes (DELETE /volumes/{name}?force=true), which the
// Engine API itself treats as idempotent: removing an already-absent name still succeeds
test("DELETE /api/volumes/:name for an unknown name succeeds, the force removal being idempotent", async () => {
  const { url, close } = await startApp(buildApp("/api/volumes", volumesRouter));
  try {
    const response = await fetch(`${url}/api/volumes/does-not-exist-${Date.now()}`, { method: "DELETE" });
    assert.equal(response.status, 204);
  } finally {
    await close();
  }
});
