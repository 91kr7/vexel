import { test } from "node:test";
import assert from "node:assert/strict";
import { containersRouter } from "../../src/containers/containers-routes.js";
import { imagesRouter } from "../../src/images/images-routes.js";
import type { ContainerSummary } from "../../src/containers/containers-service.js";
import type { ImageSummary } from "../../src/images/images-service.js";
import { buildApp, createSleepingContainer, removeContainerQuietly, removeImageQuietly, startApp } from "../support/fixtures.js";
import { TINY_IMAGE, ensureImage, ensureImages } from "../support/base-images.js";
import { execFileAsync } from "../support/docker-cli.js";

// A pruned daemon is a starting state like any other: the base images this
// file's fixtures are built on are ensured here, before the first test, so no
// test has to assume a warm daemon nor depend on another file having pulled
// them. They are shared infrastructure, not fixtures.
await ensureImages([TINY_IMAGE]);

// The two prune endpoints exercise the daemon's own prune semantics, which act
// on every stopped container / every dangling image on the host — not only on
// the fixtures set up here. No labelling can scope them, and nothing has to:
// the pass runs one file at a time and every file empties the daemon before it
// runs, so what this one prunes costs the next a restore and nothing else.
// Acceptance is established on the fixtures created here, never on host totals.

async function fetchContainers(url: string): Promise<ContainerSummary[]> {
  const response = await fetch(`${url}/api/containers`);
  return (await response.json()) as ContainerSummary[];
}

async function fetchImages(url: string): Promise<ImageSummary[]> {
  const response = await fetch(`${url}/api/images`);
  return (await response.json()) as ImageSummary[];
}

// plan-docker_management_app/REQ-22 — stopped containers are pruned in bulk, reporting the removed count and reclaimed space.
test("POST /api/containers/prune removes stopped containers and reports the removed count and reclaimed space", async () => {
  const { url, close } = await startApp(buildApp("/api/containers", containersRouter));
  let name: string | undefined;
  try {
    const created = await createSleepingContainer("prune");
    name = created.name;
    const { id } = created;
    const stopResponse = await fetch(`${url}/api/containers/${id}/stop`, { method: "POST" });
    assert.equal(stopResponse.status, 204);

    const pruneResponse = await fetch(`${url}/api/containers/prune`, { method: "POST" });
    assert.equal(pruneResponse.status, 200);
    const body = (await pruneResponse.json()) as { removedCount: number; reclaimedBytes: number };
    assert.ok(body.removedCount >= 1);
    assert.ok(typeof body.reclaimedBytes === "number" && body.reclaimedBytes >= 0);

    const containers = await fetchContainers(url);
    assert.ok(!containers.some((container) => container.id === id));
  } finally {
    if (name) await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-39 — dangling images can be pruned, reporting the space reclaimed.
test("POST /api/images/prune removes dangling images and reports the reclaimed space", async () => {
  const { url, close } = await startApp(buildApp("/api/images", imagesRouter));
  const containerName = `vexel-test-prune-src-${Date.now()}`;
  const danglingTag = `vexel-test-prune-dangling-${Date.now()}:v1`;
  try {
    // Ensured here and not only at the top of the file: this pass prunes the
    // host, so an earlier test in it may already have removed the image. Locally
    // built, so putting it back costs a second and no network.
    await ensureImage(TINY_IMAGE);
    await execFileAsync("docker", ["create", "--name", containerName, TINY_IMAGE]);
    const { stdout: firstId } = await execFileAsync("docker", ["commit", "--change", "LABEL step=1", containerName, danglingTag]);
    await new Promise((resolve) => setTimeout(resolve, 1100)); // ensure a different image config timestamp
    await execFileAsync("docker", ["commit", "--change", "LABEL step=2", containerName, danglingTag]);
    const beforeImages = await fetchImages(url);
    assert.ok(
      beforeImages.some((image) => image.id === firstId.trim() && image.tags.length === 0),
      "the superseded image should be dangling before pruning",
    );

    const response = await fetch(`${url}/api/images/prune`, { method: "POST" });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { removedCount: number; reclaimedBytes: number };
    assert.ok(body.removedCount >= 1);
    assert.ok(typeof body.reclaimedBytes === "number" && body.reclaimedBytes >= 0);

    const afterImages = await fetchImages(url);
    assert.ok(!afterImages.some((image) => image.id === firstId.trim()), "the pruned dangling image should be gone");
  } finally {
    await removeContainerQuietly(containerName);
    await removeImageQuietly(danglingTag);
    await close();
  }
});
