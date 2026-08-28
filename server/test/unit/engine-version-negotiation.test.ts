import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";
import { EngineClient, getEngineClient, resetConnectionPools } from "../../src/docker/engine-client.js";
import { setActiveEndpoint } from "../../src/docker/endpoint.js";
import { DockerDaemonError } from "../../src/docker/errors.js";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

interface DaemonStub {
  socketPath: string;
  /** Every request path served, `/version` included, in the order they arrived. */
  requests: string[];
  close: () => Promise<void>;
}

function socketPathForStub(): string {
  return join(tmpdir(), `vexel-version-test-${randomUUID()}.sock`);
}

/** A daemon on a unix socket that records every path it is dialled with. */
function startDaemonStub(handler: Handler, socketPath = socketPathForStub()): Promise<DaemonStub> {
  const server = createServer();
  const open = new Set<Socket>();
  const stub: DaemonStub = {
    socketPath,
    requests: [],
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

  server.on("connection", (socket) => {
    open.add(socket);
    socket.on("close", () => open.delete(socket));
  });

  server.on("request", (req, res) => {
    stub.requests.push(req.url ?? "");
    handler(req, res);
  });

  // Without an upgrade listener node closes such a request instead of serving it, and a hijack
  // would go unrecorded; this answers it the way a daemon refusing the upgrade does.
  server.on("upgrade", (req, socket) => {
    stub.requests.push(req.url ?? "");
    const body = JSON.stringify({ message: "no such exec instance" });
    socket.end(
      [
        "HTTP/1.1 409 Conflict",
        "content-type: application/json",
        `content-length: ${Buffer.byteLength(body)}`,
        "connection: close",
        "",
        body,
      ].join("\r\n"),
    );
  });

  return new Promise((resolve) => {
    server.listen(socketPath, () => resolve(stub));
  });
}

function jsonResponse(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Answers `/version`, refuses a hijack with a normal response, echoes the path dialled otherwise. */
function echoDaemon(options: { apiVersion?: () => string; versionDelayMs?: number } = {}): Handler {
  return (req, res) => {
    const path = req.url ?? "";
    if (path === "/version") {
      const answer = (): void =>
        jsonResponse(res, 200, { ApiVersion: options.apiVersion?.() ?? "1.41", Version: "24.0.0" });
      if (options.versionDelayMs === undefined) answer();
      else setTimeout(answer, options.versionDelayMs);
      return;
    }
    if (path.endsWith("/start")) {
      jsonResponse(res, 409, { message: "no such exec instance" });
      return;
    }
    jsonResponse(res, 200, { path });
  };
}

function versionRequests(stub: DaemonStub): number {
  return stub.requests.filter((path) => path === "/version").length;
}

function composedPaths(stub: DaemonStub): string[] {
  return stub.requests.filter((path) => path !== "/version");
}

function assertComposedWith(stub: DaemonStub, prefix: string): void {
  for (const path of composedPaths(stub)) {
    assert.ok(path.startsWith(prefix), `${path} was not composed with ${prefix}`);
  }
}

function isRejectedByDaemon(statusCode: number): (error: unknown) => true {
  return (error: unknown) => {
    assert.ok(error instanceof DockerDaemonError, `expected a DockerDaemonError, got ${String(error)}`);
    assert.equal(error.code, "DaemonRejected");
    assert.equal(error.statusCode, statusCode);
    return true;
  };
}

// plan-docker_management_app-refresh_cache/REQ-31 — a run of calls through every entry point negotiates once.
test("a run of calls through request, requestRaw, requestStream and hijack negotiates the version once", async () => {
  const daemon = await startDaemonStub(echoDaemon());
  resetConnectionPools();
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });

    const first = await client.request("/containers/json");
    assert.equal(JSON.parse(first.body).path, "/v1.41/containers/json");
    const raw = await client.requestRaw("/volumes");
    assert.equal(raw.path, "/v1.41/volumes");
    const stream = await client.requestStream("/events?since=1");
    stream.destroy();
    await assert.rejects(
      () => client.hijack("/exec/abcdef/start", { method: "POST", body: "{}" }),
      isRejectedByDaemon(409),
    );
    const last = await client.request("/networks");
    assert.equal(JSON.parse(last.body).path, "/v1.41/networks");

    assert.equal(versionRequests(daemon), 1, `the daemon was asked for its version ${versionRequests(daemon)} times`);
    assert.equal(composedPaths(daemon).length, 5, "not every entry point reached the daemon");
    assertComposedWith(daemon, "/v1.41/");
  } finally {
    resetConnectionPools();
    await daemon.close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-31 — calls issued while a negotiation is in flight wait on that one.
test("a burst of calls leaving in a single tick negotiates the version once, not once per call", async () => {
  const daemon = await startDaemonStub(echoDaemon({ versionDelayMs: 60 }));
  resetConnectionPools();
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });

    const [one, two, three, raw, stream] = await Promise.all([
      client.request("/containers/json?burst=0"),
      client.request("/containers/json?burst=1"),
      client.request("/containers/json?burst=2"),
      client.requestRaw("/images/json"),
      client.requestStream("/events?burst=1"),
    ]);
    stream.destroy();

    assert.equal(one.statusCode, 200);
    assert.equal(two.statusCode, 200);
    assert.equal(three.statusCode, 200);
    assert.equal(raw.path, "/v1.41/images/json");
    assert.equal(versionRequests(daemon), 1, `the daemon was asked for its version ${versionRequests(daemon)} times`);
    assert.equal(composedPaths(daemon).length, 5, "a call of the burst never reached the daemon");
    assertComposedWith(daemon, "/v1.41/");
  } finally {
    resetConnectionPools();
    await daemon.close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-31 — a requestRaw path carrying a version prefix negotiates nothing.
test("a requestRaw path that already carries a version prefix asks the daemon for no version at all", async () => {
  const daemon = await startDaemonStub(echoDaemon());
  resetConnectionPools();
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });

    const response = await client.requestRaw("/v1.24/info");

    assert.equal(response.path, "/v1.24/info");
    assert.equal(versionRequests(daemon), 0, "a path sent as typed still cost a negotiation");
  } finally {
    resetConnectionPools();
    await daemon.close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-32, REQ-33 — the probe is a real call every time, and it refreshes what the paths use.
test("getVersion reaches the daemon on every invocation, and the paths after it use the value it returned", async () => {
  const daemon = await startDaemonStub(echoDaemon());
  resetConnectionPools();
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });
    const probeCount = 4;

    for (let index = 0; index < probeCount; index += 1) {
      const version = await client.getVersion();
      assert.equal(version.apiVersion, "1.41");
      assert.equal(version.engineVersion, "24.0.0");
      assert.equal(versionRequests(daemon), index + 1, `probe ${index + 1} was answered without calling the daemon`);
    }

    const response = await client.request("/containers/json");
    assert.equal(JSON.parse(response.body).path, "/v1.41/containers/json");
    assert.equal(
      versionRequests(daemon),
      probeCount,
      "a call after a successful probe negotiated again instead of using what the probe established",
    );
  } finally {
    resetConnectionPools();
    await daemon.close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-32 — reachability is asked of the daemon every time it is asked for.
test("probes issued in a single tick each reach the daemon, rather than sharing one call", async () => {
  const daemon = await startDaemonStub(echoDaemon({ versionDelayMs: 60 }));
  resetConnectionPools();
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });

    const probes = await Promise.all([client.getVersion(), client.getVersion(), client.getVersion()]);

    for (const probe of probes) assert.equal(probe.apiVersion, "1.41");
    assert.equal(versionRequests(daemon), 3, `3 probes cost ${versionRequests(daemon)} calls to the daemon`);
  } finally {
    resetConnectionPools();
    await daemon.close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-33 — a daemon upgraded under a running server is composed against from the next successful probe on.
test("a daemon reporting a new API version is composed against from the probe that saw it, with no restart", async () => {
  let reportedApiVersion = "1.40";
  const daemon = await startDaemonStub(echoDaemon({ apiVersion: () => reportedApiVersion }));
  resetConnectionPools();
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });

    const before = await client.request("/containers/json");
    assert.equal(JSON.parse(before.body).path, "/v1.40/containers/json");

    reportedApiVersion = "1.41";
    const probed = await client.getVersion();
    assert.equal(probed.apiVersion, "1.41");

    const after = await client.request("/containers/json");
    assert.equal(JSON.parse(after.body).path, "/v1.41/containers/json");
  } finally {
    resetConnectionPools();
    await daemon.close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-34 — the held version belongs to the endpoint it was negotiated with.
test("after the active endpoint changes, no call is composed with the previous daemon's version", async () => {
  const previous = await startDaemonStub(echoDaemon({ apiVersion: () => "1.40" }));
  const next = await startDaemonStub(echoDaemon({ apiVersion: () => "1.41" }));
  const originalDockerHost = process.env.DOCKER_HOST;
  delete process.env.DOCKER_HOST;
  resetConnectionPools();
  try {
    setActiveEndpoint({ kind: "unix", socketPath: previous.socketPath });
    const before = await getEngineClient().request("/containers/json");
    assert.equal(JSON.parse(before.body).path, "/v1.40/containers/json");

    setActiveEndpoint({ kind: "unix", socketPath: next.socketPath });
    const after = await getEngineClient().request("/containers/json");

    assert.equal(JSON.parse(after.body).path, "/v1.41/containers/json");
    assert.equal(versionRequests(next), 1, "the new daemon was never asked for its own version");
    assertComposedWith(next, "/v1.41/");
  } finally {
    setActiveEndpoint(undefined);
    resetConnectionPools();
    if (originalDockerHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = originalDockerHost;
    await previous.close();
    await next.close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-35 — a failed negotiation is not held: the next call negotiates again.
test("a call after a failed negotiation negotiates again instead of inheriting the failure", async () => {
  let reportsItsApiVersion = false;
  const daemon = await startDaemonStub((req, res) => {
    if (req.url === "/version") {
      jsonResponse(res, 200, reportsItsApiVersion ? { ApiVersion: "1.41", Version: "24.0.0" } : { Version: "24.0.0" });
      return;
    }
    jsonResponse(res, 200, { path: req.url });
  });
  resetConnectionPools();
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });

    await assert.rejects(
      () => client.request("/containers/json"),
      (error: unknown) => {
        assert.ok(error instanceof DockerDaemonError, `expected a DockerDaemonError, got ${String(error)}`);
        assert.equal(error.code, "UnsupportedApiVersion");
        assert.ok(error.message.length > 0);
        return true;
      },
    );

    reportsItsApiVersion = true;
    const response = await client.request("/containers/json");

    assert.equal(JSON.parse(response.body).path, "/v1.41/containers/json");
    assert.equal(versionRequests(daemon), 2, "the call after the failure did not negotiate again");
  } finally {
    resetConnectionPools();
    await daemon.close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-35 — a daemon that was unreachable is talked to again once it answers.
test("a call reports an unreachable daemon's own message, and a later call succeeds once the daemon answers again", async () => {
  const socketPath = socketPathForStub();
  const client = new EngineClient({ kind: "unix", socketPath });
  await assert.rejects(
    () => client.request("/containers/json"),
    (error: unknown) => {
      assert.ok(error instanceof DockerDaemonError, `expected a DockerDaemonError, got ${String(error)}`);
      assert.equal(error.code, "DaemonUnreachable");
      assert.ok(error.message.length > 0, "the failure carried no message at all");
      return true;
    },
  );

  const daemon = await startDaemonStub(echoDaemon(), socketPath);
  try {
    const response = await client.request("/containers/json");

    assert.equal(JSON.parse(response.body).path, "/v1.41/containers/json");
    assert.equal(versionRequests(daemon), 1, "the client did not negotiate against the daemon that came back");
  } finally {
    resetConnectionPools();
    await daemon.close();
  }
});

// plan-docker_management_app-refresh_cache/REQ-33 — a probe that failed leaves the version the paths are composed with as it was.
test("a probe that failed leaves the held version standing: the call after it is composed with it, and negotiates nothing", async () => {
  let reportsItsApiVersion = true;
  const daemon = await startDaemonStub((req, res) => {
    if (req.url === "/version") {
      jsonResponse(res, 200, reportsItsApiVersion ? { ApiVersion: "1.41", Version: "24.0.0" } : { Version: "24.0.0" });
      return;
    }
    jsonResponse(res, 200, { path: req.url });
  });
  resetConnectionPools();
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });

    const before = await client.request("/containers/json");
    assert.equal(JSON.parse(before.body).path, "/v1.41/containers/json");

    reportsItsApiVersion = false;
    await assert.rejects(
      () => client.getVersion(),
      (error: unknown) => {
        assert.ok(error instanceof DockerDaemonError, `expected a DockerDaemonError, got ${String(error)}`);
        assert.equal(error.code, "UnsupportedApiVersion");
        return true;
      },
    );

    const after = await client.request("/containers/json");

    assert.equal(JSON.parse(after.body).path, "/v1.41/containers/json");
    assert.equal(versionRequests(daemon), 2, "the failed probe threw away the version the paths were composed with");
  } finally {
    resetConnectionPools();
    await daemon.close();
  }
});
