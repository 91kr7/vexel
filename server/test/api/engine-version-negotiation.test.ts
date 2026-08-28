import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { connect, createServer, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";
import { connectivityRouter } from "../../src/connectivity/connectivity-routes.js";
import type { ConnectionStatus } from "../../src/connectivity/connection-status-service.js";
import { containersRouter } from "../../src/containers/containers-routes.js";
import { imagesRouter } from "../../src/images/images-routes.js";
import { networksRouter } from "../../src/networks/networks-routes.js";
import { volumesRouter } from "../../src/volumes/volumes-routes.js";
import { resolveActiveEndpoint, setActiveEndpoint } from "../../src/docker/endpoint.js";
import { resetConnectionPools } from "../../src/docker/engine-client.js";
import { createSleepingContainer, removeContainerQuietly, startApp } from "../support/fixtures.js";

interface DaemonProxy {
  socketPath: string;
  /** Engine API requests written towards the daemon. */
  daemonRequests: number;
  /** Those of them that asked the daemon for its version. */
  versionRequests: number;
  close: () => Promise<void>;
}

const REQUEST_LINE = /^(?:GET|POST|PUT|DELETE|HEAD) (\S+) HTTP\/1\.1/gm;

/** A unix socket in front of the daemon's own, counting the calls that travel over it. */
function startDaemonProxy(targetSocketPath: string): Promise<DaemonProxy> {
  const socketPath = join(tmpdir(), `vexel-version-proxy-${randomUUID()}.sock`);
  const open = new Set<Socket>();
  const proxy: DaemonProxy = {
    socketPath,
    daemonRequests: 0,
    versionRequests: 0,
    close: () =>
      new Promise((resolve) => {
        for (const socket of open) socket.destroy();
        server.close(() => {
          try {
            unlinkSync(socketPath);
          } catch {
            // best-effort cleanup
          }
          resolve();
        });
      }),
  };

  const server = createServer((incoming) => {
    open.add(incoming);
    const upstream = connect(targetSocketPath);
    incoming.on("data", (chunk: Buffer) => {
      for (const [, path] of String(chunk).matchAll(REQUEST_LINE)) {
        proxy.daemonRequests += 1;
        if (path === "/version") proxy.versionRequests += 1;
      }
    });
    incoming.on("close", () => {
      open.delete(incoming);
      upstream.destroy();
    });
    incoming.on("error", () => incoming.destroy());
    upstream.on("error", () => incoming.destroy());
    incoming.pipe(upstream);
    upstream.pipe(incoming);
  });

  return new Promise((resolve) => {
    server.listen(socketPath, () => resolve(proxy));
  });
}

function buildListApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/containers", containersRouter);
  app.use("/api/images", imagesRouter);
  app.use("/api/volumes", volumesRouter);
  app.use("/api/networks", networksRouter);
  return app;
}

// plan-docker_management_app-refresh_cache/REQ-32, REQ-36 — the status still reports the negotiated Engine API version and the engine version.
test("GET /api/connectivity/status reports the negotiated Engine API version and the engine version", async () => {
  const app = express();
  app.use("/api/connectivity", connectivityRouter);
  const { url, close } = await startApp(app);
  try {
    const response = await fetch(`${url}/api/connectivity/status`);

    assert.equal(response.status, 200);
    const body = (await response.json()) as ConnectionStatus;
    assert.equal(body.daemon.reachable, true);
    assert.match(String(body.apiVersion), /^\d+\.\d+$/);
    assert.ok(
      typeof body.engineVersion === "string" && body.engineVersion.length > 0,
      `the status carried no engine version: ${JSON.stringify(body.engineVersion)}`,
    );
  } finally {
    await close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-31, REQ-36 — a run of REST reads costs one negotiation, and the endpoints answer what they answer today.
test("a run of REST reads negotiates the version once, and the list endpoints still answer their lists", async () => {
  const realEndpoint = resolveActiveEndpoint();
  assert.equal(realEndpoint.kind, "unix", "this check needs a local socket daemon to sit in front of");
  const proxy = await startDaemonProxy(realEndpoint.kind === "unix" ? realEndpoint.socketPath : "");
  const originalDockerHost = process.env.DOCKER_HOST;
  const { url, close } = await startApp(buildListApp());
  let fixtureName = "";
  try {
    const fixture = await createSleepingContainer("version-negotiation");
    fixtureName = fixture.name;

    delete process.env.DOCKER_HOST;
    setActiveEndpoint({ kind: "unix", socketPath: proxy.socketPath });
    resetConnectionPools();

    const readCount = 6;
    for (let index = 0; index < readCount; index += 1) {
      const inspect = await fetch(`${url}/api/containers/${fixture.name}/inspect`);
      assert.equal(inspect.status, 200);
      const inspected = (await inspect.json()) as { name: string };
      assert.match(inspected.name, new RegExp(fixture.name));
    }

    assert.ok(proxy.daemonRequests >= readCount, `only ${proxy.daemonRequests} Engine API calls reached the daemon`);
    assert.ok(
      proxy.versionRequests <= 1,
      `${proxy.versionRequests} negotiations for ${proxy.daemonRequests} Engine API calls`,
    );

    for (const path of ["/api/containers", "/api/images", "/api/volumes", "/api/networks"]) {
      const listing = await fetch(`${url}${path}`);
      assert.equal(listing.status, 200, `${path} did not answer`);
      assert.ok(Array.isArray(await listing.json()), `${path} no longer answers a list`);
    }
  } finally {
    setActiveEndpoint(undefined);
    resetConnectionPools();
    if (originalDockerHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = originalDockerHost;
    await close();
    await proxy.close();
    if (fixtureName) await removeContainerQuietly(fixtureName);
  }
});
