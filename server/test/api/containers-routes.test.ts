import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { containersRouter } from "../../src/containers/containers-routes.js";
import { ownershipArgs } from "../support/fixtures.js";
import { INTERNAL_CONTAINER_LABEL } from "../../src/image-analysis/filesystem-extraction-service.js";
import { ALPINE_IMAGE, ensureImages } from "../support/base-images.js";

// A pruned daemon is a starting state like any other: the base images this
// file's fixtures are built on are ensured here, before the first test, so no
// test has to assume a warm daemon nor depend on another file having pulled
// them. They are shared infrastructure, not fixtures: nothing removes them.
await ensureImages([ALPINE_IMAGE]);
import type {
  ContainerConfigUpdateResult,
  ContainerInspect,
  ContainerSummary,
} from "../../src/containers/containers-service.js";

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

// A tiny image (ensured local above) whose entrypoint is overridden to `sleep`
// so the container starts instantly and needs no network pull or app init.
async function createSleepingContainer(name: string, extraArgs: string[] = []): Promise<string> {
  const { stdout } = await execFileAsync("docker", [
    "run",
    "-d",
    "--name",
    name,
    ...ownershipArgs(name),
    ...extraArgs,
    "--entrypoint",
    "sleep",
    "alpine:3.20",
    "300",
  ]);
  return stdout.trim();
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["rm", "-fv", name]).catch(() => undefined);
}

async function removeVolumeQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["volume", "rm", "-f", name]).catch(() => undefined);
}

async function fetchList(url: string): Promise<ContainerSummary[]> {
  const response = await fetch(`${url}/api/containers`);
  return (await response.json()) as ContainerSummary[];
}

// plan-docker_management_app/REQ-19 — the list carries name, short id, state, image, published ports and uptime
test("GET /api/containers lists a running container with its name, short id, state, image, published ports and status", async () => {
  const name = `vexel-test-list-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name, ["-p", "0:5432"]);
    const containers = await fetchList(url);
    const found = containers.find((container) => container.name === name);
    assert.ok(found, "created container not found in the list");
    assert.equal(found!.shortId, id.slice(0, 12));
    assert.equal(found!.state, "running");
    assert.equal(found!.image, "alpine:3.20");
    assert.ok(found!.ports.some((port) => port.privatePort === 5432 && typeof port.publicPort === "number"));
    assert.ok(found!.status.length > 0);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-20 — stop applies to the daemon and the row reflects the resulting state
test("POST /api/containers/:id/stop stops a running container and the list reflects the exited state", async () => {
  const name = `vexel-test-stop-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
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
  const name = `vexel-test-pause-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
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
  const name = `vexel-test-kill-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
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
  const name = `vexel-test-restart-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
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
  const name = `vexel-test-remove-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
    const response = await fetch(`${url}/api/containers/${id}`, { method: "DELETE" });
    assert.equal(response.status, 204);
    const containers = await fetchList(url);
    assert.ok(!containers.some((container) => container.id === id));
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-54 — an intermediate filesystem-extraction container is never
// shown as a container anywhere in the application: excluded from the list, and therefore from the
// count derived from it (app-shell/specs/shell.md — the Containers nav badge is the list's own length).
test("GET /api/containers excludes an intermediate filesystem-extraction container from the list, and so from its count", async () => {
  const ordinaryName = `vexel-test-int7-ordinary-${Date.now()}`;
  const internalName = `vexel-test-int7-internal-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const ordinaryId = await createSleepingContainer(ordinaryName);
    const { stdout } = await execFileAsync("docker", [
      "create",
      "--name",
      internalName,
      ...ownershipArgs(internalName),
      "--label",
      `${INTERNAL_CONTAINER_LABEL}=true`,
      "alpine:3.20",
    ]);
    const internalId = stdout.trim();
    const containers = await fetchList(url);

    assert.ok(containers.some((container) => container.id === ordinaryId), "expected the ordinary container to still be listed");
    assert.ok(!containers.some((container) => container.id === internalId), "expected the intermediate extraction container to be excluded from the list");
    assert.ok(
      !containers.some((container) => container.name === internalName),
      "expected the intermediate extraction container to be excluded by name too",
    );
  } finally {
    await removeContainerQuietly(ordinaryName);
    await removeContainerQuietly(internalName);
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
  const originalName = `vexel-test-rename-${Date.now()}`;
  const newName = `${originalName}-renamed`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(originalName);
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
  const name = `vexel-test-rename-blank-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
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


// plan-docker_management_app/REQ-24 — the detail view's inspect data carries identity, image, restart
// policy, resource limits, environment, ports, labels, networks and state
test("GET /api/containers/:id/inspect returns the full configuration of a container", async () => {
  const name = `vexel-test-inspect-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name, [
      "-p",
      "0:5432",
      "-e",
      "FOO=bar",
      "--label",
      "team=vexel",
      "--restart",
      "on-failure:3",
      "--cpus",
      "0.5",
      "--memory",
      "128m",
    ]);
    const response = await fetch(`${url}/api/containers/${id}/inspect`);
    assert.equal(response.status, 200);
    const inspect = (await response.json()) as ContainerInspect;

    assert.equal(inspect.name, name);
    assert.equal(inspect.image, "alpine:3.20");
    assert.ok(inspect.entrypoint.includes("sleep"));
    assert.deepEqual(inspect.restartPolicy, { name: "on-failure", maximumRetryCount: 3 });
    assert.ok(inspect.resourceLimits.cpus && Math.abs(inspect.resourceLimits.cpus - 0.5) < 0.01);
    assert.equal(inspect.resourceLimits.memoryBytes, 128 * 1024 * 1024);
    assert.ok(inspect.env.includes("FOO=bar"));
    assert.equal(inspect.labels.team, "vexel");
    assert.ok(inspect.ports.some((port) => port.containerPort === 5432 && typeof port.hostPort === "number"));
    assert.ok(inspect.networks.some((network) => network.name === "bridge"));
    assert.equal(inspect.state.status, "running");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// containers-endpoints.md — a daemon rejection (unknown id) surfaces the daemon's own message on inspect
test("GET /api/containers/:id/inspect with an unknown id responds with the daemon's own rejection message", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/containers/does-not-exist-${Date.now()}/inspect`);
    assert.notEqual(response.status, 200);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-26 — the raw inspect payload is exactly what the Engine API returned, unmodified
test("GET /api/containers/:id/inspect carries the raw payload exactly as received from the Engine API", async () => {
  const name = `vexel-test-inspect-raw-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
    const response = await fetch(`${url}/api/containers/${id}/inspect`);
    const inspect = (await response.json()) as ContainerInspect;
    const raw = inspect.raw as { Id: string; Name: string; Config: { Image: string } };

    const { stdout } = await execFileAsync("docker", ["inspect", id]);
    const [daemonRaw] = JSON.parse(stdout) as [{ Id: string; Name: string; Config: { Image: string } }];

    assert.equal(raw.Id, daemonRaw.Id);
    assert.equal(raw.Name, daemonRaw.Name);
    assert.equal(raw.Config.Image, daemonRaw.Config.Image);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-25 — restart policy alone is applied to the daemon in place, keeping the same container id
test("PATCH /api/containers/:id/config applies a restart-policy-only change in place", async () => {
  const name = `vexel-test-config-inplace-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name);
    const response = await fetch(`${url}/api/containers/${id}/config`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restartPolicy: { name: "always" } }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as ContainerConfigUpdateResult;
    assert.equal(body.path, "in-place");
    assert.equal(body.container.id, id);

    const { stdout } = await execFileAsync("docker", ["inspect", "--format", "{{.HostConfig.RestartPolicy.Name}}", id]);
    assert.equal(stdout.trim(), "always");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-25 — an environment change recreates the container, preserving its name, mounts and networks,
// and restarting it since it was running before
test("PATCH /api/containers/:id/config recreates the container for an environment change, preserving name, mounts and networks", async () => {
  const name = `vexel-test-config-recreate-${Date.now()}`;
  const volumeName = `vexel-test-config-recreate-vol-${Date.now()}`;
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const id = await createSleepingContainer(name, ["-v", `${volumeName}:/data`]);
    const response = await fetch(`${url}/api/containers/${id}/config`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ env: ["FOO=recreated"] }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as ContainerConfigUpdateResult;
    assert.equal(body.path, "recreate");
    assert.notEqual(body.container.id, id);
    assert.equal(body.container.name, name);
    assert.equal(body.container.state, "running");

    const inspectResponse = await fetch(`${url}/api/containers/${body.container.id}/inspect`);
    const inspect = (await inspectResponse.json()) as ContainerInspect;
    assert.ok(inspect.env.includes("FOO=recreated"));
    assert.ok(inspect.mounts.some((mount) => mount.destination === "/data"));
    assert.ok(inspect.networks.some((network) => network.name === "bridge"));
  } finally {
    await removeContainerQuietly(name);
    await removeVolumeQuietly(volumeName);
    await close();
  }
});

// containers-endpoints.md — a daemon rejection (unknown id) surfaces the daemon's own message on a configuration update
test("PATCH /api/containers/:id/config with an unknown id responds with the daemon's own rejection message", async () => {
  const app = buildApp();
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/containers/does-not-exist-${Date.now()}/config`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restartPolicy: { name: "always" } }),
    });
    assert.notEqual(response.status, 200);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});
