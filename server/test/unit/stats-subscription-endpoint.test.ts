import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { installEngineMock } from "../support/engine-mock.js";

// The connection that gates the sampler, driven over the wire end to end, and
// the count of stats requests reaching the daemon measured in each state of the
// gate (containers/specs/container-stats-subscription-endpoint.md,
// plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-1,
// REQ-2, REQ-3, REQ-5, REQ-7, REQ-8, REQ-9, REQ-10, REQ-17, REQ-21).
//
// The Engine API is mocked, and that is the point of this file rather than a
// concession: the gate is stated as traffic reaching the daemon, and the engine
// mock is the only place that traffic can be *counted*. A real daemon answers
// the same calls and says nothing about how many of them were made.
const engine = installEngineMock();

const { containersRouter } = await import("../../src/containers/containers-routes.js");
const { handleStatsSubscriptionUpgrade } = await import("../../src/containers/container-stats-subscription-routes.js");
const { statsDemandCount, statsSamplingActive } = await import("../../src/containers/stats-demand-registry.js");
const { stopStatsSampling, STATS_SAMPLE_INTERVAL_MS } = await import("../../src/containers/containers-service.js");

const SUBSCRIPTION_PATH = "/api/containers/stats/subscription";
const CONTAINER_ID = "feedface0000";
/** One interval plus enough margin for the tick to have fired and been recorded. */
const ONE_INTERVAL_WINDOW_MS = STATS_SAMPLE_INTERVAL_MS + 1_500;
/** The bound the spec states: a ping every 10s, and 5s more for the pong. */
const LIVENESS_BOUND_MS = 15_000;

function runningContainer(id = CONTAINER_ID): unknown {
  return { Id: id, Names: ["/subscribed"], Image: "alpine:3.20", State: "running", Status: "Up 5 minutes", Ports: [] };
}

function statsFrame(): unknown {
  return {
    read: "2026-08-26T10:00:00.000000000Z",
    cpu_stats: { cpu_usage: { total_usage: 2_000_000_000 }, system_cpu_usage: 20_000_000_000, online_cpus: 2 },
    precpu_stats: { cpu_usage: { total_usage: 1_000_000_000 }, system_cpu_usage: 10_000_000_000, online_cpus: 2 },
    memory_stats: { usage: 2048, limit: 8192, stats: {} },
    networks: { eth0: { rx_bytes: 30, tx_bytes: 40 } },
  };
}

function statsRequests(): number {
  return engine.callsTo("GET", /^\/containers\/[^/]+\/stats$/).length;
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/containers", containersRouter);
  return app;
}

interface RunningApp {
  url: string;
  wsUrl: string;
  server: Server;
  close: () => Promise<void>;
}

/** The dispatcher of `server/src/index.ts`: the gate is offered the upgrade, and an unclaimed one is destroyed. */
function startApp(app: Express): Promise<RunningApp> {
  const server = createServer(app);
  server.on("upgrade", (request, socket, head) => {
    if (!handleStatsSubscriptionUpgrade(request, socket, head)) socket.destroy();
  });
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        wsUrl: `ws://127.0.0.1:${port}`,
        server,
        close: () =>
          new Promise((closeResolve) => {
            server.closeAllConnections();
            server.close(() => closeResolve());
          }),
      });
    });
  });
}

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Waits for a condition the server reaches on its own, rather than for a fixed time. */
async function until(condition: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await delay(25);
  }
  assert.fail(`the condition was still false after ${timeoutMs}ms`);
}

interface HeldGate {
  socket: WebSocket;
  /** Application data that reached this end: the spec allows none. */
  messages: string[];
  /** Protocol pings received, which is how the server proves the connection live. */
  pings: number;
  close: () => void;
}

/** Opens the gate and holds it, the way the browser's WebSocket does. */
function holdGate(app: RunningApp, options: { autoPong?: boolean } = {}): Promise<HeldGate> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${app.wsUrl}${SUBSCRIPTION_PATH}`, { autoPong: options.autoPong ?? true });
    const held: HeldGate = { socket, messages: [], pings: 0, close: () => socket.close() };
    socket.on("message", (data: Buffer) => held.messages.push(data.toString("utf8")));
    socket.on("ping", () => (held.pings += 1));
    socket.once("open", () => resolve(held));
    socket.once("error", reject);
  });
}

beforeEach(() => {
  engine.reset();
  engine.on("GET", "/containers/json", () => [runningContainer()]);
  engine.on("GET", /^\/containers\/[^/]+\/stats$/, () => statsFrame());
});

afterEach(async () => {
  stopStatsSampling();
  await until(() => statsDemandCount() === 0, 3_000).catch(() => undefined);
});

// container-stats-subscription-endpoint.md — the gate is a connection held open on the upgrade hook
// that serves the interactive sessions, so no HTTP request stays open while it is held (REQ-1, REQ-8)
test("the gate's address is claimed as a WebSocket upgrade and the connection is held open", async () => {
  const app = await startApp(buildApp());
  try {
    const held = await holdGate(app);
    try {
      assert.equal(held.socket.readyState, WebSocket.OPEN);
    } finally {
      held.close();
    }
  } finally {
    await app.close();
  }
});

// container-stats-subscription-endpoint.md — "An upgrade request for any other address is not
// claimed, so nothing else on the server becomes reachable through it" (REQ-5)
test("an upgrade to any other address is refused and registers no demand", async () => {
  const app = await startApp(buildApp());
  try {
    const refused = new Promise<Error>((resolve, reject) => {
      const socket = new WebSocket(`${app.wsUrl}/api/containers/stats/subscription-elsewhere`);
      socket.once("error", resolve);
      socket.once("open", () => {
        socket.close();
        reject(new Error("the upgrade to another address was accepted"));
      });
    });

    await refused;
    assert.equal(statsDemandCount(), 0);
    assert.equal(statsSamplingActive(), false);
  } finally {
    await app.close();
  }
});

// REQ-7 — the SSE endpoint that held the gate is gone: an ordinary GET on the address is an API
// error, and holds no gate. Two gates must not stand side by side.
test("the address answers no plain GET any more, and such a request holds no gate", async () => {
  const app = await startApp(buildApp());
  try {
    const response = await fetch(`${app.url}${SUBSCRIPTION_PATH}`);
    await response.text();

    assert.equal(response.status, 404);
    assert.equal(statsDemandCount(), 0);
    assert.equal(statsSamplingActive(), false);
  } finally {
    await app.close();
  }
});

// container-stats-subscription-endpoint.md — the handshake registers one consumer and a closed gate
// is sampled at once; the close releases it (REQ-3, REQ-17)
test("holding the connection registers one consumer and samples at once; closing it releases and stops", async () => {
  const app = await startApp(buildApp());
  try {
    assert.equal(statsDemandCount(), 0);
    assert.equal(statsRequests(), 0, "nothing is asked of the daemon before a consumer exists");

    const held = await holdGate(app);
    try {
      await until(() => statsDemandCount() === 1);
      assert.equal(statsSamplingActive(), true);
      await until(() => statsRequests() === 1);
    } finally {
      held.close();
    }

    await until(() => statsDemandCount() === 0);
    assert.equal(statsSamplingActive(), false);
  } finally {
    await app.close();
  }
});

// container-stats-subscription-endpoint.md — the consumer is released whether the client closed the
// connection, the browser was killed or the network was pulled (REQ-3)
test("a connection cut without a close frame is released as surely as one that closed", async () => {
  const app = await startApp(buildApp());
  try {
    const held = await holdGate(app);
    await until(() => statsDemandCount() === 1);

    // No close frame, no announcement: the socket simply goes, as a killed browser's does.
    held.socket.terminate();

    await until(() => statsDemandCount() === 0);
    assert.equal(statsSamplingActive(), false);
  } finally {
    await app.close();
  }
});

// container-stats-subscription-endpoint.md / stats-demand-registry.md — one of two subscribers going
// away does not stop the sampling the other is reading
test("two subscribers are two consumers: one leaving leaves the sampling running for the other", async () => {
  const app = await startApp(buildApp());
  try {
    const first = await holdGate(app);
    const second = await holdGate(app);
    try {
      await until(() => statsDemandCount() === 2);

      first.close();
      await until(() => statsDemandCount() === 1);
      assert.equal(statsSamplingActive(), true);
    } finally {
      first.close();
      second.close();
    }

    await until(() => statsDemandCount() === 0);
    assert.equal(statsSamplingActive(), false);
  } finally {
    await app.close();
  }
});

// REQ-2, REQ-9 — no frame carries application data, measured over a window covering a sampling pass:
// that is when a server writing figures or a liveness line by hand would write.
test("with one consumer the daemon is asked once per interval, and nothing is written to the connection", async () => {
  const app = await startApp(buildApp());
  try {
    const held = await holdGate(app);
    try {
      await until(() => statsRequests() === 1);

      await delay(ONE_INTERVAL_WINDOW_MS);

      assert.equal(statsRequests(), 2, "one immediate pass plus one at the interval, and nothing between");
      assert.deepEqual(held.messages, [], "the server wrote application data to a connection that carries none");
    } finally {
      held.close();
    }
  } finally {
    await app.close();
  }
});

// REQ-9, REQ-10 — a ping every 10s and 5s more for the pong: an end that vanished without closing
// never answers, and must not hold the sampler open.
test("a connection that stops answering the ping is closed and its unit released within the bound", async () => {
  const app = await startApp(buildApp());
  try {
    const held = await holdGate(app, { autoPong: false });
    await until(() => statsDemandCount() === 1);

    await until(() => held.pings > 0, LIVENESS_BOUND_MS);
    await until(() => statsDemandCount() === 0, LIVENESS_BOUND_MS);

    assert.equal(held.socket.readyState !== WebSocket.OPEN, true, "the silent connection was left open");
    assert.equal(statsSamplingActive(), false);
  } finally {
    await app.close();
  }
});

// REQ-21, REQ-17 — the drop and the return: the unit the dropped connection released is replaced by
// the reconnection's own, and the gate reopening samples at once rather than at the next interval.
test("the unit a dropped connection released is replaced by the reconnection's, which samples at once", async () => {
  const app = await startApp(buildApp());
  try {
    const dropped = await holdGate(app);
    await until(() => statsDemandCount() === 1);
    await until(() => statsRequests() === 1);

    dropped.socket.terminate();
    await until(() => statsDemandCount() === 0);
    assert.equal(statsSamplingActive(), false);
    const passesBeforeReturn = statsRequests();

    const reconnected = await holdGate(app);
    try {
      await until(() => statsDemandCount() === 1);
      assert.equal(statsSamplingActive(), true);
      // Promptly: well inside one sampling interval, which is the whole of "sampling resumes".
      await until(() => statsRequests() === passesBeforeReturn + 1, 3_000);
    } finally {
      reconnected.close();
    }

    await until(() => statsDemandCount() === 0);
  } finally {
    await app.close();
  }
});

// "The gate neither leaks, drifts nor wedges ... nothing accumulates per cycle": an upward drift is
// invisible from the interface and holds the daemon open for ever.
test("repeated connect and disconnect cycles return the count to zero and cost exactly one pass each", async () => {
  const app = await startApp(buildApp());
  try {
    for (let cycle = 1; cycle <= 4; cycle += 1) {
      const held = await holdGate(app);
      await until(() => statsDemandCount() === 1);
      await until(() => statsRequests() === cycle, 3_000);
      held.close();

      await until(() => statsDemandCount() === 0);
      assert.equal(statsSamplingActive(), false, `cycle ${cycle} left the daemon quiet`);
      assert.equal(statsRequests(), cycle, `cycle ${cycle} cost exactly one pass`);
    }
  } finally {
    await app.close();
  }
});

// "With no consumer, the number of stats requests reaching the daemon over any window is zero"
test("with no consumer connected the daemon is asked for nothing at all over a full interval", async () => {
  const app = await startApp(buildApp());
  try {
    assert.equal(statsDemandCount(), 0);

    await delay(ONE_INTERVAL_WINDOW_MS);

    assert.equal(statsRequests(), 0);
    assert.equal(statsSamplingActive(), false);
  } finally {
    await app.close();
  }
});

// container-stats-subscription-endpoint.md — a client that never opens this connection still gets
// the list, with no sampled figures since nobody is being sampled for
test("the container list still answers with no connection held, carrying no sampled figures", async () => {
  const neverSampled = "0123456789ab";
  engine.on("GET", "/containers/json", () => [runningContainer(neverSampled)]);
  const app = await startApp(buildApp());
  try {
    const response = await fetch(`${app.url}/api/containers`);
    const containers = (await response.json()) as { id: string; cpuPercent?: number; memoryUsageBytes?: number }[];

    assert.equal(response.status, 200);
    const listed = containers.find((entry) => entry.id === neverSampled);
    assert.ok(listed, "the container is listed");
    assert.equal(listed?.cpuPercent, undefined);
    assert.equal(listed?.memoryUsageBytes, undefined);
    assert.equal(statsRequests(), 0, "listing asked the daemon for no stats of its own");
  } finally {
    await app.close();
  }
});
