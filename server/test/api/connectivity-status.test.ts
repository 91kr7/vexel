import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { connectivityRouter } from "../../src/connectivity/connectivity-routes.js";
import type { ConnectionStatus } from "../../src/connectivity/connection-status-service.js";

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

// plan-docker_management_app/REQ-9, plan-docker_management_app/REQ-13 — reachable daemon and negotiated API version
test("GET /api/connectivity/status reports the daemon reachable with the negotiated Engine API version", async () => {
  const app = express();
  app.use("/api/connectivity", connectivityRouter);
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/connectivity/status`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as ConnectionStatus;
    assert.equal(body.daemon.reachable, true);
    assert.ok(body.apiVersion);
    assert.match(body.apiVersion, /^\d+\.\d+$/);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-110 — local docker CLI reported available with its version
test("GET /api/connectivity/status reports the docker CLI available with its version", async () => {
  const app = express();
  app.use("/api/connectivity", connectivityRouter);
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/connectivity/status`);
    const body = (await response.json()) as ConnectionStatus;
    assert.equal(body.cli.docker.available, true);
    assert.ok(typeof body.cli.docker.version === "string" && body.cli.docker.version.length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-110 — missing CLI tools are reported explicitly, naming the unavailable capabilities
test("GET /api/connectivity/status names the unavailable capabilities when no CLI tool is on PATH", async () => {
  const app = express();
  app.use("/api/connectivity", connectivityRouter);
  const { url, close } = await startApp(app);
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = "";
    const response = await fetch(`${url}/api/connectivity/status`);
    const body = (await response.json()) as ConnectionStatus;
    assert.equal(body.cli.docker.available, false);
    assert.equal(body.cli.compose.available, false);
    assert.equal(body.cli.buildx.available, false);
    assert.equal(body.unavailableCapabilities.length, 3);
    const joined = (body.unavailableCapabilities as string[]).join(" ").toLowerCase();
    assert.match(joined, /raw console/);
    assert.match(joined, /compose projects/);
    assert.match(joined, /multi-platform builds/);
  } finally {
    process.env.PATH = originalPath;
    await close();
  }
});

// plan-docker_management_app/REQ-9, plan-docker_management_app/REQ-10 — an unreachable daemon is explained, not opaque
test("GET /api/connectivity/status explains the cause instead of failing when the daemon is unreachable", async () => {
  const previousDockerHost = process.env.DOCKER_HOST;
  process.env.DOCKER_HOST = `unix:///tmp/vexel-unreachable-${Date.now()}.sock`;
  const { getConnectionStatus: getStatusAgainstUnreachableDaemon } = await import(
    `../../src/connectivity/connection-status-service.js?unreachable=${Date.now()}`
  );
  if (previousDockerHost === undefined) delete process.env.DOCKER_HOST;
  else process.env.DOCKER_HOST = previousDockerHost;

  const app = express();
  app.get("/api/connectivity/status", async (_req, res) => {
    res.json(await getStatusAgainstUnreachableDaemon());
  });
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/connectivity/status`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as ConnectionStatus;
    assert.equal(body.daemon.reachable, false);
    assert.ok(typeof body.daemon.cause === "string" && body.daemon.cause.length > 0);
    assert.equal(body.apiVersion, undefined);
  } finally {
    await close();
  }
});
