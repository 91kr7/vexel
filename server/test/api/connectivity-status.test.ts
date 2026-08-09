import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { connectivityRouter } from "../../src/connectivity/connectivity-routes.js";
import type { ConnectionStatus } from "../../src/connectivity/connection-status-service.js";
import { setActiveEndpoint } from "../../src/docker/endpoint.js";

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

// plan-docker_management_app/REQ-9, plan-docker_management_app/REQ-10 — an unreachable daemon is
// explained, not opaque.
//
// The daemon is made unreachable through the access layer's own published
// endpoint (docker-access/specs/active-endpoint.md), pointed at a socket path
// that exists on no machine. That is what a context switch does at run time, and
// it is what connection-status-service.md means by "the status is read fresh on
// every call ... so it describes the currently active context": the shared
// engine client is discarded when the active endpoint changes, so the route
// under test really dials the unreachable endpoint.
//
// Swapping `DOCKER_HOST` and re-importing the service under a cache-busting
// query does not achieve that: the re-imported copy still resolves
// `engine-client.js` by its plain specifier, so it keeps the client the earlier
// tests in this file already built against the real daemon, and the route
// answers `reachable: true`. `DOCKER_HOST` is nonetheless stepped aside here for
// the duration, because it outranks the published endpoint when the operator
// has one set.
test("GET /api/connectivity/status explains the cause instead of failing when the daemon is unreachable", async () => {
  const previousDockerHost = process.env.DOCKER_HOST;
  const app = express();
  app.use("/api/connectivity", connectivityRouter);
  const { url, close } = await startApp(app);
  try {
    delete process.env.DOCKER_HOST;
    setActiveEndpoint({ kind: "unix", socketPath: `/tmp/vexel-unreachable-${Date.now()}.sock` });

    const response = await fetch(`${url}/api/connectivity/status`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as ConnectionStatus;
    assert.equal(body.daemon.reachable, false);
    // connection-status-service.md — the cause is the daemon's own message, and
    // apiVersion/engineVersion are only set when reachable.
    assert.ok(typeof body.daemon.cause === "string" && body.daemon.cause.length > 0);
    assert.equal(body.apiVersion, undefined);
    assert.equal(body.engineVersion, undefined);
  } finally {
    // The published endpoint is process-wide state: the access layer is handed
    // back the daemon it was talking to, `DOCKER_HOST` included.
    setActiveEndpoint(undefined);
    if (previousDockerHost !== undefined) process.env.DOCKER_HOST = previousDockerHost;
    await close();
  }
});

// The status is read fresh on every call (connection-status-service.md), so the
// daemon the previous test made unreachable is reachable again as soon as the
// access layer is pointed back at it: the file leaves the process as it found it.
test("GET /api/connectivity/status reports the daemon reachable again once the access layer is pointed back at it", async () => {
  const app = express();
  app.use("/api/connectivity", connectivityRouter);
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/connectivity/status`);
    const body = (await response.json()) as ConnectionStatus;
    assert.equal(body.daemon.reachable, true);
  } finally {
    await close();
  }
});
