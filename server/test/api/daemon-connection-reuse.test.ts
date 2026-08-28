import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { connect, createServer, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { containersRouter } from "../../src/containers/containers-routes.js";
import { resolveActiveEndpoint, setActiveEndpoint } from "../../src/docker/endpoint.js";
import { resetConnectionPools } from "../../src/docker/engine-client.js";
import { startApp } from "../support/fixtures.js";

interface DaemonProxy {
  socketPath: string;
  /** Connections the application opened towards this endpoint. */
  connections: number;
  openConnections: number;
  /** Engine API requests written over those connections. */
  daemonRequests: number;
  close: () => Promise<void>;
}

const REQUEST_LINE = /^(GET|POST|PUT|DELETE|HEAD) \S+ HTTP\/1\.1/gm;

/**
 * A unix socket in front of the daemon's own, so a REST-level run can be told
 * how many connections it cost and how many Engine API calls travelled over
 * them. It forwards bytes and alters nothing.
 */
function startDaemonProxy(targetSocketPath: string): Promise<DaemonProxy> {
  const socketPath = join(tmpdir(), `vexel-proxy-${randomUUID()}.sock`);
  const open = new Set<Socket>();
  const proxy: DaemonProxy = {
    socketPath,
    connections: 0,
    openConnections: 0,
    daemonRequests: 0,
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
    proxy.connections += 1;
    open.add(incoming);
    proxy.openConnections = open.size;
    const upstream = connect(targetSocketPath);
    incoming.on("data", (chunk: Buffer) => {
      proxy.daemonRequests += String(chunk).match(REQUEST_LINE)?.length ?? 0;
    });
    incoming.on("close", () => {
      open.delete(incoming);
      proxy.openConnections = open.size;
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

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/containers", containersRouter);
  return app;
}

// plan-docker_management_app-refresh_cache/REQ-4 — calls to the daemon reuse an open connection
// instead of opening one per call, and the endpoint answers what it answers today.
test("a run of REST calls costs the daemon fewer connections than the Engine API calls it makes", async () => {
  const realEndpoint = resolveActiveEndpoint();
  assert.equal(realEndpoint.kind, "unix", "this check needs a local socket daemon to sit in front of");
  const proxy = await startDaemonProxy(realEndpoint.kind === "unix" ? realEndpoint.socketPath : "");
  const originalDockerHost = process.env.DOCKER_HOST;
  const { url, close } = await startApp(buildApp());
  try {
    delete process.env.DOCKER_HOST;
    setActiveEndpoint({ kind: "unix", socketPath: proxy.socketPath });
    resetConnectionPools();

    const listing = await fetch(`${url}/api/containers`);
    assert.equal(listing.status, 200);
    assert.ok(Array.isArray(await listing.json()), "the containers endpoint answers a list, as it does today");

    // Detail reads, because a run of *list* calls no longer reaches the daemon at all: a listing is
    // answered from a value the server holds (plan-docker_management_app-refresh_cache/REQ-9) while
    // an inspect stays a direct read of the daemon (REQ-22). It is the direct reads that put a run
    // of Engine API calls over the connection this check is about.
    for (let index = 0; index < 5; index += 1) {
      const response = await fetch(`${url}/api/containers/vexel-no-such-container/inspect`);
      assert.equal(response.status, 404, "an unknown container still answers with the daemon's own 404");
    }

    assert.ok(proxy.daemonRequests >= 5, `only ${proxy.daemonRequests} Engine API calls reached the daemon`);
    assert.ok(
      proxy.connections < proxy.daemonRequests,
      `${proxy.connections} connections for ${proxy.daemonRequests} Engine API calls`,
    );
  } finally {
    setActiveEndpoint(undefined);
    resetConnectionPools();
    if (originalDockerHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = originalDockerHost;
    await close();
    await proxy.close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-5 — after the active endpoint changes, no call
// reaches the previous daemon, and the connections opened for it are closed.
test("after the active endpoint changes, no REST call is served over a connection of the previous endpoint", async () => {
  const realEndpoint = resolveActiveEndpoint();
  assert.equal(realEndpoint.kind, "unix", "this check needs a local socket daemon to sit in front of");
  const targetSocketPath = realEndpoint.kind === "unix" ? realEndpoint.socketPath : "";
  const previous = await startDaemonProxy(targetSocketPath);
  const next = await startDaemonProxy(targetSocketPath);
  const originalDockerHost = process.env.DOCKER_HOST;
  const { url, close } = await startApp(buildApp());
  try {
    delete process.env.DOCKER_HOST;
    setActiveEndpoint({ kind: "unix", socketPath: previous.socketPath });
    resetConnectionPools();

    for (let index = 0; index < 3; index += 1) {
      assert.equal((await fetch(`${url}/api/containers/vexel-no-such-container/inspect`)).status, 404);
    }
    assert.ok(previous.openConnections >= 1, "no connection was held open for the first endpoint");
    const servedByPrevious = previous.daemonRequests;

    setActiveEndpoint({ kind: "unix", socketPath: next.socketPath });
    await delay(100);
    assert.equal(previous.openConnections, 0, "a connection to the previous endpoint stayed open after the change");

    // Direct reads again, for the reason above: a listing would be answered without the daemon
    // being called at all, which proves nothing about which endpoint a call reaches.
    for (let index = 0; index < 3; index += 1) {
      const response = await fetch(`${url}/api/containers/vexel-no-such-container/inspect`);
      assert.equal(response.status, 404);
    }

    assert.equal(previous.daemonRequests, servedByPrevious, "a call reached the previous endpoint after the change");
    assert.ok(next.daemonRequests >= 3, `only ${next.daemonRequests} Engine API calls reached the new endpoint`);
  } finally {
    setActiveEndpoint(undefined);
    resetConnectionPools();
    if (originalDockerHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = originalDockerHost;
    await close();
    await previous.close();
    await next.close();
  }
});
