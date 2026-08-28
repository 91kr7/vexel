import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chmodSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { EngineClient, getEngineClient, resetConnectionPools } from "../../src/docker/engine-client.js";
import { setActiveEndpoint } from "../../src/docker/endpoint.js";
import { DockerDaemonError } from "../../src/docker/errors.js";

interface ServedRequest {
  path: string;
  connectionId: number;
}

interface DaemonStub {
  socketPath: string;
  /** Connections accepted since the stub started. */
  connections: number;
  /** Connections currently open, pooled idle ones included. */
  openConnections: number;
  /** Highest number of connections open at the same instant. */
  maxOpenConnections: number;
  requests: ServedRequest[];
  close: () => Promise<void>;
}

const connectionIds = new WeakMap<Socket, number>();

function connectionIdOf(socket: Socket): number {
  return connectionIds.get(socket) ?? -1;
}

/** A daemon on a unix socket that counts the connections it is dialled over. */
function startDaemonStub(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<DaemonStub> {
  const socketPath = join(tmpdir(), `vexel-pool-test-${randomUUID()}.sock`);
  const server = createServer();
  const open = new Set<Socket>();
  const stub: DaemonStub = {
    socketPath,
    connections: 0,
    openConnections: 0,
    maxOpenConnections: 0,
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
    stub.connections += 1;
    connectionIds.set(socket, stub.connections);
    open.add(socket);
    stub.openConnections = open.size;
    stub.maxOpenConnections = Math.max(stub.maxOpenConnections, open.size);
    socket.on("close", () => {
      open.delete(socket);
      stub.openConnections = open.size;
    });
  });

  server.on("request", (req, res) => {
    stub.requests.push({ path: req.url ?? "", connectionId: connectionIdOf(req.socket) });
    handler(req, res);
  });

  return new Promise((resolve) => {
    server.listen(socketPath, () => resolve(stub));
  });
}

function jsonResponse(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Answers /version so the client can negotiate, and delegates everything else. */
function withVersion(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.url === "/version") {
      jsonResponse(res, 200, { ApiVersion: "1.41", Version: "24.0.0" });
      return;
    }
    handler(req, res);
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await delay(10);
  }
  return predicate();
}

function pooledConnectionIds(stub: DaemonStub, streamPathPrefix: string): Set<number> {
  const ids = new Set<number>();
  for (const served of stub.requests) {
    if (!served.path.startsWith(streamPathPrefix)) ids.add(served.connectionId);
  }
  return ids;
}

// engine-client.md — "A connection is opened once and reused by the calls that follow it
// (REQ-4): a run of calls over one endpoint therefore opens fewer connections than it makes
// calls. What the caller receives does not change: same answers."
test("a run of calls over one endpoint opens fewer connections than it makes calls, and answers what the daemon said", async () => {
  const daemon = await startDaemonStub(withVersion((req, res) => jsonResponse(res, 200, { path: req.url })));
  resetConnectionPools();
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });
    const callCount = 8;

    for (let index = 0; index < callCount; index += 1) {
      const response = await client.request(`/containers/json?n=${index}`);
      assert.equal(response.statusCode, 200);
      assert.equal(JSON.parse(response.body).path, `/v1.41/containers/json?n=${index}`);
    }

    assert.ok(daemon.requests.length >= callCount, `the daemon served ${daemon.requests.length} requests`);
    assert.ok(
      daemon.connections < daemon.requests.length,
      `${daemon.connections} connections for ${daemon.requests.length} calls`,
    );
  } finally {
    resetConnectionPools();
    await daemon.close();
  }
});

// engine-client.md — "same answers, same errors, same order": a daemon rejection over a reused
// connection is still a DaemonRejected carrying the daemon's own message, and it does not spoil
// the connection for the calls that follow.
test("a daemon rejection travels unchanged over a reused connection, and the calls after it still succeed", async () => {
  const daemon = await startDaemonStub(
    withVersion((req, res) => {
      if ((req.url ?? "").includes("missing-one")) {
        jsonResponse(res, 404, { message: "no such container: missing-one" });
        return;
      }
      jsonResponse(res, 200, { path: req.url });
    }),
  );
  resetConnectionPools();
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });

    const first = await client.request("/containers/json");
    assert.equal(first.statusCode, 200);

    await assert.rejects(
      () => client.request("/containers/missing-one/json"),
      (error: unknown) => {
        assert.ok(error instanceof DockerDaemonError, `expected a DockerDaemonError, got ${String(error)}`);
        assert.equal(error.code, "DaemonRejected");
        assert.equal(error.statusCode, 404);
        assert.equal(error.message, "no such container: missing-one");
        return true;
      },
    );

    const third = await client.request("/containers/json");
    assert.equal(third.statusCode, 200);
    assert.equal(JSON.parse(third.body).path, "/v1.41/containers/json");
    assert.ok(
      daemon.connections < daemon.requests.length,
      `${daemon.connections} connections for ${daemon.requests.length} calls`,
    );
  } finally {
    resetConnectionPools();
    await daemon.close();
  }
});

// engine-client.md — "Streams and hijacked connections are dialed outside the pool (REQ-4): a log
// follow, an event stream or an exec owns its connection for its whole life, so it never blocks a
// pooled one and is never handed to another call."
test("a stream owns its own connection: pooled calls run while it is open and are never served over it", async () => {
  const daemon = await startDaemonStub(
    withVersion((req, res) => {
      if ((req.url ?? "").includes("/events")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.write('{"Type":"network","Action":"create"}\n');
        return; // stays open, as a follow does
      }
      jsonResponse(res, 200, { path: req.url });
    }),
  );
  resetConnectionPools();
  const streams: Array<{ destroy: () => void }> = [];
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });

    await client.request("/containers/json?warm=1");

    const openStreams = await Promise.all([client.requestStream("/events?a=1"), client.requestStream("/events?a=2")]);
    for (const stream of openStreams) streams.push(stream);

    const streamConnectionIds = new Set(
      daemon.requests.filter((served) => served.path.includes("/events")).map((served) => served.connectionId),
    );
    assert.equal(streamConnectionIds.size, 2, "each open stream was dialled over a connection of its own");

    // The streams are still open: pooled calls must go through anyway, and over other connections.
    for (let index = 0; index < 3; index += 1) {
      const response = await client.request(`/containers/json?while=${index}`);
      assert.equal(response.statusCode, 200);
    }
    for (const id of pooledConnectionIds(daemon, "/v1.41/events")) {
      assert.ok(!streamConnectionIds.has(id), `a pooled call was served over the stream's connection ${id}`);
    }

    // The stream data is what the daemon wrote.
    const firstStream = openStreams[0];
    const chunk = await new Promise<string>((resolve) => firstStream.once("data", (data) => resolve(String(data))));
    assert.match(chunk, /"Type":"network","Action":"create"/);

    // Once a stream is over, its connection is not handed to a later call either.
    for (const stream of openStreams) stream.destroy();
    await delay(50);
    const afterStreams = await client.request("/containers/json?after=1");
    assert.equal(afterStreams.statusCode, 200);
    const lastServed = daemon.requests[daemon.requests.length - 1];
    assert.equal(lastServed.path, "/v1.41/containers/json?after=1");
    assert.ok(
      !streamConnectionIds.has(lastServed.connectionId),
      "a call after the stream ended was served over the stream's connection",
    );
  } finally {
    for (const stream of streams) stream.destroy();
    resetConnectionPools();
    await daemon.close();
  }
});

/** Answers slowly, so a burst of calls really is in flight at the same instant. */
function slowDaemon(): Promise<DaemonStub> {
  return startDaemonStub(
    withVersion((req, res) => {
      setTimeout(() => jsonResponse(res, 200, { path: req.url }), 120);
    }),
  );
}

async function runBurst(client: EngineClient, size: number): Promise<void> {
  const burst = await Promise.all(
    Array.from({ length: size }, (_unused, index) => client.request(`/containers/json?burst=${index}`)),
  );
  for (const response of burst) assert.equal(response.statusCode, 200);
}

// engine-client.md — "a burst of parallel calls is served by at most sixteen of them ... The bound
// holds however the burst is issued — the calls over it wait for a connection to come free instead
// of opening their own, including when the whole burst leaves in a single tick"; and "nothing is
// ever refused for being over the bound".
test("a burst issued in a single tick is served by at most sixteen connections, and none of it is refused", async () => {
  const daemon = await slowDaemon();
  resetConnectionPools();
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });
    await client.request("/containers/json?warm=1");

    const size = 40;
    const answers = await Promise.all(
      Array.from({ length: size }, (_unused, index) => client.request(`/containers/json?burst=${index}`)),
    );

    for (let index = 0; index < size; index += 1) {
      assert.equal(answers[index].statusCode, 200, `call ${index} of the burst was not answered`);
      assert.equal(JSON.parse(answers[index].body).path, `/v1.41/containers/json?burst=${index}`);
    }
    assert.ok(
      daemon.maxOpenConnections <= 16,
      `${daemon.maxOpenConnections} connections were open at once for a burst of ${size} calls`,
    );
  } finally {
    resetConnectionPools();
    await daemon.close();
  }
});

// engine-client.md — "at most four are kept once it is over"; resetConnectionPools() "closes every
// connection held for every endpoint".
test("at most four connections are kept once a burst is over, and a reset closes them all", async () => {
  const daemon = await slowDaemon();
  resetConnectionPools();
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });
    await client.request("/containers/json?warm=1");

    await runBurst(client, 24);

    await waitFor(() => daemon.openConnections <= 4);
    assert.ok(daemon.openConnections <= 4, `${daemon.openConnections} connections were kept after the burst`);

    resetConnectionPools();
    assert.ok(await waitFor(() => daemon.openConnections === 0), `${daemon.openConnections} connections survived a reset`);
  } finally {
    resetConnectionPools();
    await daemon.close();
  }
});

// REQ-4 — "on a remote context, a run of calls starts no new `ssh` process each". The stand-in
// `ssh` this test puts on PATH pipes its stdio into the stub's socket, exactly as
// `docker system dial-stdio` does over a real one, and records every time it is started.
test("a run of calls over an ssh context starts fewer ssh processes than it makes calls", async () => {
  const daemon = await startDaemonStub(withVersion((req, res) => jsonResponse(res, 200, { path: req.url })));
  const binDirectory = mkdtempSync(join(tmpdir(), "vexel-fake-ssh-"));
  const spawnLog = join(binDirectory, "spawns.log");
  const originalPath = process.env.PATH;
  resetConnectionPools();
  try {
    const fakeSsh = join(binDirectory, "ssh");
    writeFileSync(
      fakeSsh,
      [
        "#!/usr/bin/env node",
        'const { appendFileSync } = require("node:fs");',
        'const { connect } = require("node:net");',
        'appendFileSync(process.env.VEXEL_SSH_SPAWN_LOG, "spawn\\n");',
        "const socket = connect(process.env.VEXEL_SSH_TARGET_SOCKET);",
        "process.stdin.pipe(socket);",
        "socket.pipe(process.stdout);",
        'socket.on("close", () => process.exit(0));',
        "",
      ].join("\n"),
    );
    chmodSync(fakeSsh, 0o755);
    writeFileSync(spawnLog, "");
    process.env.PATH = `${binDirectory}:${originalPath ?? ""}`;
    process.env.VEXEL_SSH_SPAWN_LOG = spawnLog;
    process.env.VEXEL_SSH_TARGET_SOCKET = daemon.socketPath;

    const client = new EngineClient({ kind: "ssh", destination: "operator@remote" });
    const callCount = 6;
    for (let index = 0; index < callCount; index += 1) {
      const response = await client.request(`/containers/json?n=${index}`);
      assert.equal(response.statusCode, 200);
      assert.equal(JSON.parse(response.body).path, `/v1.41/containers/json?n=${index}`);
    }

    const spawned = readFileSync(spawnLog, "utf8").split("\n").filter(Boolean).length;
    assert.ok(spawned >= 1, "the ssh transport was not used at all");
    assert.ok(spawned < callCount, `${spawned} ssh processes were started for ${callCount} calls`);
  } finally {
    resetConnectionPools();
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    delete process.env.VEXEL_SSH_SPAWN_LOG;
    delete process.env.VEXEL_SSH_TARGET_SOCKET;
    rmSync(binDirectory, { recursive: true, force: true });
    await daemon.close();
  }
});

// engine-client.md — "A pool belongs to the endpoint it was opened for (REQ-5): connections are
// held per endpoint and never shared between two"; active-endpoint.md — "every connection held
// open for the previous daemon is closed. Nothing opened for one endpoint outlives it."
test("changing the active endpoint closes the previous daemon's connections and sends no further call to it", async () => {
  const first = await startDaemonStub(withVersion((req, res) => jsonResponse(res, 200, { daemon: "first", path: req.url })));
  const second = await startDaemonStub(
    withVersion((req, res) => jsonResponse(res, 200, { daemon: "second", path: req.url })),
  );
  const originalDockerHost = process.env.DOCKER_HOST;
  delete process.env.DOCKER_HOST;
  resetConnectionPools();
  try {
    setActiveEndpoint({ kind: "unix", socketPath: first.socketPath });
    for (let index = 0; index < 3; index += 1) {
      const response = await getEngineClient().request("/containers/json");
      assert.equal(JSON.parse(response.body).daemon, "first");
    }
    assert.ok(first.openConnections >= 1, "no connection was held open for the first daemon");
    const servedByFirst = first.requests.length;

    setActiveEndpoint({ kind: "unix", socketPath: second.socketPath });

    assert.ok(
      await waitFor(() => first.openConnections === 0),
      `${first.openConnections} connections to the previous daemon stayed open after the change`,
    );

    for (let index = 0; index < 3; index += 1) {
      const response = await getEngineClient().request("/containers/json");
      assert.equal(JSON.parse(response.body).daemon, "second");
    }

    assert.equal(first.requests.length, servedByFirst, "a call reached the previous daemon after the change");
    assert.ok(
      second.connections < second.requests.length,
      `${second.connections} connections for ${second.requests.length} calls on the new endpoint`,
    );
  } finally {
    setActiveEndpoint(undefined);
    resetConnectionPools();
    if (originalDockerHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = originalDockerHost;
    await first.close();
    await second.close();
  }
});

// engine-client.md — "A call in flight over the previous daemon at that instant fails as
// DaemonUnreachable instead of answering with what that daemon had to say."
test("a call in flight when the active endpoint changes fails as DaemonUnreachable", async () => {
  const first = await startDaemonStub(
    withVersion((req, res) => {
      setTimeout(() => jsonResponse(res, 200, { daemon: "first", path: req.url }), 500);
    }),
  );
  const second = await startDaemonStub(
    withVersion((req, res) => jsonResponse(res, 200, { daemon: "second", path: req.url })),
  );
  const originalDockerHost = process.env.DOCKER_HOST;
  delete process.env.DOCKER_HOST;
  resetConnectionPools();
  try {
    setActiveEndpoint({ kind: "unix", socketPath: first.socketPath });
    const inFlight = getEngineClient().request("/containers/json?slow=1");
    await waitFor(() => first.requests.some((served) => served.path.includes("slow=1")));

    setActiveEndpoint({ kind: "unix", socketPath: second.socketPath });

    await assert.rejects(
      () => inFlight,
      (error: unknown) => {
        assert.ok(error instanceof DockerDaemonError, `expected a DockerDaemonError, got ${String(error)}`);
        assert.equal(error.code, "DaemonUnreachable");
        return true;
      },
    );
  } finally {
    setActiveEndpoint(undefined);
    resetConnectionPools();
    if (originalDockerHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = originalDockerHost;
    await first.close();
    await second.close();
  }
});

/** Fails the check instead of letting it hang when a call is never served. */
async function withDeadline<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const guard = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(label)), timeoutMs);
  });
  try {
    return await Promise.race([work, guard]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function burstIndexesInServedOrder(stub: DaemonStub, marker: string): number[] {
  return stub.requests
    .filter((served) => served.path.includes(`${marker}=`))
    .map((served) => Number(new URL(`http://daemon${served.path}`).searchParams.get(marker)));
}

// engine-client.md — "A waiting call is served as soon as one ahead of it has read its answer, and
// it is served in the order it arrived".
// The burst is made of already-versioned `requestRaw` calls ("a path that already carries a version
// prefix is sent as typed"), so each call takes the pool exactly once and the order it is granted a
// connection in is the order its path reaches the daemon.
test("the calls a burst puts over the bound reach the daemon in the order they arrived", async () => {
  const daemon = await slowDaemon();
  resetConnectionPools();
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });
    await client.requestRaw("/v1.41/containers/json?warm=1");

    const size = 28;
    const answers = await Promise.all(
      Array.from({ length: size }, (_unused, index) => client.requestRaw(`/v1.41/containers/json?queued=${index}`)),
    );
    for (const answer of answers) assert.equal(answer.statusCode, 200);

    const servedOrder = burstIndexesInServedOrder(daemon, "queued");
    assert.equal(servedOrder.length, size, "the daemon did not serve every call of the burst");

    // The first sixteen take the connections; everything after them had to wait for one.
    const waited = servedOrder.slice(16);
    assert.equal(waited.length, size - 16);
    for (let index = 1; index < waited.length; index += 1) {
      assert.ok(
        waited[index] > waited[index - 1],
        `calls that waited for a connection were served out of order: ${waited.join(", ")}`,
      );
    }
    assert.deepEqual(
      [...servedOrder].sort((left, right) => left - right),
      Array.from({ length: size }, (_unused, index) => index),
      "the daemon was not asked for every call of the burst exactly once",
    );
  } finally {
    resetConnectionPools();
    await daemon.close();
  }
});

type FailureMode = "reject" | "dropBody" | "destroy" | "ok";

// engine-client.md — a call returns its connection "once the answer has been read", and the bound
// never refuses anything: a run of failures must therefore leave the pool as usable as it found it.
// A leaked slot shows up as a later call that is never served at all.
test("a burst of failing calls leaves the pool usable, whatever the failure was", async () => {
  let mode: FailureMode = "ok";
  const daemon = await startDaemonStub(
    withVersion((req, res) => {
      if (mode === "reject") {
        jsonResponse(res, 404, { message: "no such container: missing-one" });
        return;
      }
      if (mode === "dropBody") {
        // Announces more body than it sends, then drops: the read fails after the response arrived.
        res.writeHead(200, { "content-type": "application/json", "content-length": "512" });
        res.write('{"Containers":[');
        setTimeout(() => res.socket?.destroy(), 20);
        return;
      }
      if (mode === "destroy") {
        res.socket?.destroy();
        return;
      }
      jsonResponse(res, 200, { path: req.url });
    }),
  );
  resetConnectionPools();
  try {
    const client = new EngineClient({ kind: "unix", socketPath: daemon.socketPath });
    await client.request("/containers/json?warm=1");

    const failures: Array<{ mode: FailureMode; code: string }> = [
      { mode: "reject", code: "DaemonRejected" },
      { mode: "dropBody", code: "DaemonUnreachable" },
      { mode: "destroy", code: "DaemonUnreachable" },
    ];

    for (const failure of failures) {
      mode = failure.mode;
      const size = 40; // well over the bound, so slots have to be handed on
      const outcomes = await Promise.allSettled(
        Array.from({ length: size }, (_unused, index) => client.request(`/containers/json?failing=${index}`)),
      );
      for (const outcome of outcomes) {
        assert.equal(outcome.status, "rejected", `a call succeeded while the daemon was in ${failure.mode} mode`);
        const error: unknown = outcome.status === "rejected" ? outcome.reason : undefined;
        assert.ok(error instanceof DockerDaemonError, `expected a DockerDaemonError, got ${String(error)}`);
        assert.equal(error.code, failure.code);
      }

      mode = "ok";
      const afterFailures = await withDeadline(
        client.request(`/containers/json?after=${failure.mode}`),
        5000,
        `a call made after ${size} ${failure.mode} failures was never served: the pool leaked connection slots`,
      );
      assert.equal(afterFailures.statusCode, 200);
      assert.equal(JSON.parse(afterFailures.body).path, `/v1.41/containers/json?after=${failure.mode}`);
    }
  } finally {
    resetConnectionPools();
    await daemon.close();
  }
});

// engine-client.md — "A call in flight over the previous daemon at that instant fails as
// DaemonUnreachable ... and so does one still waiting for a connection to it."
test("a call still waiting for a connection when the active endpoint changes fails as DaemonUnreachable", async () => {
  const first = await startDaemonStub(
    withVersion((req, res) => {
      setTimeout(() => jsonResponse(res, 200, { daemon: "first", path: req.url }), 800);
    }),
  );
  const second = await startDaemonStub(
    withVersion((req, res) => jsonResponse(res, 200, { daemon: "second", path: req.url })),
  );
  const originalDockerHost = process.env.DOCKER_HOST;
  delete process.env.DOCKER_HOST;
  resetConnectionPools();
  try {
    setActiveEndpoint({ kind: "unix", socketPath: first.socketPath });
    const client = getEngineClient();
    await client.request("/containers/json?warm=1");

    const size = 24; // sixteen take a connection, the rest wait for one
    const outcomes = Array.from({ length: size }, (_unused, index) =>
      client.request(`/containers/json?pending=${index}`).then(
        (response) => ({ answered: true, response, error: undefined as unknown }),
        (error: unknown) => ({ answered: false, response: undefined, error }),
      ),
    );

    assert.ok(
      await waitFor(() => burstIndexesInServedOrder(first, "pending").length >= 16),
      "the burst never reached the bound, so no call was left waiting",
    );
    assert.equal(
      burstIndexesInServedOrder(first, "pending").length,
      16,
      "more calls than the bound reached the daemon, so none of the burst was waiting for a connection",
    );

    setActiveEndpoint({ kind: "unix", socketPath: second.socketPath });

    const settled = await withDeadline(Promise.all(outcomes), 5000, "calls left over the previous endpoint never settled");
    for (const outcome of settled) {
      assert.equal(outcome.answered, false, "a call over the previous endpoint was answered after the change");
      assert.ok(outcome.error instanceof DockerDaemonError, `expected a DockerDaemonError, got ${String(outcome.error)}`);
      assert.equal(outcome.error.code, "DaemonUnreachable");
    }
  } finally {
    setActiveEndpoint(undefined);
    resetConnectionPools();
    if (originalDockerHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = originalDockerHost;
    await first.close();
    await second.close();
  }
});
