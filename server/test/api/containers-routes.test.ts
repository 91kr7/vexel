import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { containersRouter } from "../../src/containers/containers-routes.js";
import type { ContainerSummary } from "../../src/containers/containers-service.js";

const execFileAsync = promisify(execFile);

function startApp(app: Express): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((closeResolve) => server.close(() => closeResolve())),
      });
    });
  });
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/containers", containersRouter);
  return app;
}

// A tiny, already-cached image whose entrypoint is overridden to `sleep` so
// the container starts instantly and needs no network pull or app init.
async function createSleepingContainer(name: string, extraArgs: string[] = []): Promise<string> {
  const { stdout } = await execFileAsync("docker", [
    "run",
    "-d",
    "--name",
    name,
    ...extraArgs,
    "--entrypoint",
    "sleep",
    "postgres:16",
    "300",
  ]);
  return stdout.trim();
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["rm", "-f", name]).catch(() => undefined);
}

async function fetchList(url: string): Promise<ContainerSummary[]> {
  const response = await fetch(`${url}/api/containers`);
  return (await response.json()) as ContainerSummary[];
}

// plan-docker_management_app/REQ-19 — the list carries name, short id, state, image, published ports and uptime
test("GET /api/containers lists a running container with its name, short id, state, image, published ports and status", async () => {
  const name = `vessel-test-list-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  const id = await createSleepingContainer(name, ["-p", "0:5432"]);
  try {
    const containers = await fetchList(url);
    const found = containers.find((container) => container.name === name);
    assert.ok(found, "created container not found in the list");
    assert.equal(found!.shortId, id.slice(0, 12));
    assert.equal(found!.state, "running");
    assert.equal(found!.image, "postgres:16");
    assert.ok(found!.ports.some((port) => port.privatePort === 5432 && typeof port.publicPort === "number"));
    assert.ok(found!.status.length > 0);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-20 — stop applies to the daemon and the row reflects the resulting state
test("POST /api/containers/:id/stop stops a running container and the list reflects the exited state", async () => {
  const name = `vessel-test-stop-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  const id = await createSleepingContainer(name);
  try {
    const response = await fetch(`${url}/api/containers/${id}/stop`, { method: "POST" });
    assert.equal(response.status, 204);
    const containers = await fetchList(url);
    assert.equal(containers.find((container) => container.id === id)?.state, "exited");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-20 — pause and unpause apply to the daemon and the row reflects each resulting state
test("POST pause and unpause toggle a running container's reported state", async () => {
  const name = `vessel-test-pause-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  const id = await createSleepingContainer(name);
  try {
    const pauseResponse = await fetch(`${url}/api/containers/${id}/pause`, { method: "POST" });
    assert.equal(pauseResponse.status, 204);
    let containers = await fetchList(url);
    assert.equal(containers.find((container) => container.id === id)?.state, "paused");

    const unpauseResponse = await fetch(`${url}/api/containers/${id}/unpause`, { method: "POST" });
    assert.equal(unpauseResponse.status, 204);
    containers = await fetchList(url);
    assert.equal(containers.find((container) => container.id === id)?.state, "running");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-20 — kill applies to the daemon and the row reflects the resulting state
test("POST /api/containers/:id/kill kills a running container and the list reflects the exited state", async () => {
  const name = `vessel-test-kill-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  const id = await createSleepingContainer(name);
  try {
    const response = await fetch(`${url}/api/containers/${id}/kill`, { method: "POST" });
    assert.equal(response.status, 204);
    const containers = await fetchList(url);
    assert.equal(containers.find((container) => container.id === id)?.state, "exited");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-20 — restart applies to the daemon and the container is running again afterwards
test("POST /api/containers/:id/restart restarts a running container", async () => {
  const name = `vessel-test-restart-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  const id = await createSleepingContainer(name);
  try {
    const response = await fetch(`${url}/api/containers/${id}/restart`, { method: "POST" });
    assert.equal(response.status, 204);
    const containers = await fetchList(url);
    assert.equal(containers.find((container) => container.id === id)?.state, "running");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-20 — remove is offered regardless of state and applies to the daemon
test("DELETE /api/containers/:id removes the container so it no longer appears in the list", async () => {
  const name = `vessel-test-remove-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  const id = await createSleepingContainer(name);
  try {
    const response = await fetch(`${url}/api/containers/${id}`, { method: "DELETE" });
    assert.equal(response.status, 204);
    const containers = await fetchList(url);
    assert.ok(!containers.some((container) => container.id === id));
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// containers-endpoints.md — a daemon rejection (unknown id) surfaces the daemon's own message instead of succeeding silently
test("POST /api/containers/:id/stop with an unknown id responds with the daemon's own rejection message", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/containers/does-not-exist-${Date.now()}/stop`, { method: "POST" });
    assert.notEqual(response.status, 204);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-21 — a container can be renamed and the change is reflected in the list
test("POST /api/containers/:id/rename renames the container", async () => {
  const originalName = `vessel-test-rename-${Date.now()}`;
  const newName = `${originalName}-renamed`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  const id = await createSleepingContainer(originalName);
  try {
    const response = await fetch(`${url}/api/containers/${id}/rename`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    assert.equal(response.status, 204);
    const containers = await fetchList(url);
    const found = containers.find((container) => container.id === id);
    assert.equal(found?.name, newName);
  } finally {
    await removeContainerQuietly(newName);
    await removeContainerQuietly(originalName);
    await close();
  }
});

// containers-endpoints.md — a blank name is rejected with 400 before reaching the daemon (REQ-21)
test("POST /api/containers/:id/rename rejects a blank name with 400 and leaves the container untouched", async () => {
  const name = `vessel-test-rename-blank-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  const id = await createSleepingContainer(name);
  try {
    const response = await fetch(`${url}/api/containers/${id}/rename`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
    const containers = await fetchList(url);
    assert.equal(containers.find((container) => container.id === id)?.name, name);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-22 — stopped containers are pruned in bulk, reporting the removed count and reclaimed space.
// This exercises the daemon's own prune semantics, which remove every currently stopped container on the host, not only
// the one created by this test.
test("POST /api/containers/prune removes stopped containers and reports the removed count and reclaimed space", async () => {
  const name = `vessel-test-prune-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  const id = await createSleepingContainer(name);
  try {
    const stopResponse = await fetch(`${url}/api/containers/${id}/stop`, { method: "POST" });
    assert.equal(stopResponse.status, 204);

    const pruneResponse = await fetch(`${url}/api/containers/prune`, { method: "POST" });
    assert.equal(pruneResponse.status, 200);
    const body = (await pruneResponse.json()) as { removedCount: number; reclaimedBytes: number };
    assert.ok(body.removedCount >= 1);
    assert.ok(typeof body.reclaimedBytes === "number" && body.reclaimedBytes >= 0);

    const containers = await fetchList(url);
    assert.ok(!containers.some((container) => container.id === id));
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});
