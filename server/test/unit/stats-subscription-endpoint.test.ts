import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { installEngineMock } from "../support/engine-mock.js";

// The subscription that gates the sampler, driven over HTTP end to end, and the
// count of stats requests reaching the daemon measured in each state of the gate
// (containers/specs/container-stats-subscription-endpoint.md,
// plan-docker_management_app-containers_card_view/REQ-39, REQ-41, REQ-44, REQ-46,
// REQ-47, REQ-50, REQ-54, REQ-57, REQ-58).
//
// The Engine API is mocked, and that is the point of this file rather than a
// concession: the requirement is stated as traffic reaching the daemon, and the
// engine mock is the only place that traffic can be *counted*. A real daemon
// answers the same calls and says nothing about how many of them were made.
const engine = installEngineMock();

const { containersRouter } = await import("../../src/containers/containers-routes.js");
const { statsDemandCount, statsSamplingActive } = await import("../../src/containers/stats-demand-registry.js");
const { stopStatsSampling, STATS_SAMPLE_INTERVAL_MS } = await import("../../src/containers/containers-service.js");

const SUBSCRIPTION_PATH = "/api/containers/stats/subscription";
const CONTAINER_ID = "feedface0000";
/** One interval plus enough margin for the tick to have fired and been recorded. */
const ONE_INTERVAL_WINDOW_MS = STATS_SAMPLE_INTERVAL_MS + 1_500;

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

function startApp(app: Express): Promise<{ url: string; port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        close: () => new Promise((closeResolve) => server.close(() => closeResolve())),
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

interface HeldSubscription {
  /** The chunks the server has written to this connection so far. */
  writes: string[];
  response: Response;
  abort: () => void;
}

/** Opens the subscription and keeps reading it, the way a browser's EventSource does. */
async function holdSubscription(url: string): Promise<HeldSubscription> {
  const controller = new AbortController();
  const response = await fetch(`${url}${SUBSCRIPTION_PATH}`, { signal: controller.signal });
  const writes: string[] = [];
  const reader = response.body?.getReader();
  void (async () => {
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const chunk = await reader?.read();
        if (!chunk || chunk.done) return;
        writes.push(decoder.decode(chunk.value));
      }
    } catch {
      // the abort below is how this loop ends
    }
  })();
  await until(() => writes.length > 0);
  return { writes, response, abort: () => controller.abort() };
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

// container-stats-subscription-endpoint.md — "a connection held open, 200,
// Content-Type: text/event-stream, Cache-Control: no-cache ... the client is written to at once, so
// the response is observably open before anything else happens" (REQ-46)
test("the subscription answers as an event stream and is observably open at once", async () => {
  const app = await startApp(buildApp());
  try {
    const held = await holdSubscription(app.url);
    try {
      assert.equal(held.response.status, 200);
      assert.match(held.response.headers.get("content-type") ?? "", /text\/event-stream/);
      assert.equal(held.response.headers.get("cache-control"), "no-cache");
      assert.ok(held.writes.length > 0, "the connection was written to on open");
    } finally {
      held.abort();
    }
  } finally {
    await app.close();
  }
});

// container-stats-subscription-endpoint.md — "on open: one consumer is registered ... on close: the
// consumer is released, once" (REQ-41, REQ-46, REQ-51)
test("holding the connection registers one consumer and samples at once; closing it releases and stops", async () => {
  const app = await startApp(buildApp());
  try {
    assert.equal(statsDemandCount(), 0);
    assert.equal(statsRequests(), 0, "nothing is asked of the daemon before a consumer exists");

    const held = await holdSubscription(app.url);
    try {
      assert.equal(statsDemandCount(), 1);
      assert.equal(statsSamplingActive(), true);
      await until(() => statsRequests() === 1);
    } finally {
      held.abort();
    }

    await until(() => statsDemandCount() === 0);
    assert.equal(statsSamplingActive(), false);
  } finally {
    await app.close();
  }
});

// container-stats-subscription-endpoint.md — "on close: the consumer is released ... whether the
// client closed the connection, the browser was killed, the process was force-quit or the network
// was pulled" (REQ-54)
test("a connection destroyed without a close is released as surely as one that closed", async () => {
  const app = await startApp(buildApp());
  const socket = net.connect(app.port, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
    socket.write(`GET ${SUBSCRIPTION_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\nAccept: text/event-stream\r\n\r\n`);
    await new Promise<void>((resolve) => socket.once("data", () => resolve()));

    assert.equal(statsDemandCount(), 1);

    // No FIN, no close frame, nothing announced: the socket simply goes.
    socket.destroy();

    await until(() => statsDemandCount() === 0);
    assert.equal(statsSamplingActive(), false);
  } finally {
    socket.destroy();
    await app.close();
  }
});

// container-stats-subscription-endpoint.md / stats-demand-registry.md — one of two subscribers going
// away does not stop the sampling the other is reading (REQ-47)
test("two subscribers are two consumers: one leaving leaves the sampling running for the other", async () => {
  const app = await startApp(buildApp());
  try {
    const first = await holdSubscription(app.url);
    const second = await holdSubscription(app.url);
    try {
      assert.equal(statsDemandCount(), 2);

      first.abort();
      await until(() => statsDemandCount() === 1);
      assert.equal(statsSamplingActive(), true);
    } finally {
      first.abort();
      second.abort();
    }

    await until(() => statsDemandCount() === 0);
    assert.equal(statsSamplingActive(), false);
  } finally {
    await app.close();
  }
});

// The measurement the whole change is stated as: the count of stats requests reaching the daemon
// over a fixed window with a consumer held. Ten seconds gives two passes in this window; the
// delivered three-second cadence would have given four more (REQ-39, REQ-57). The same window
// carries the periodic write that makes a vanished end fail (REQ-50).
test("with one consumer the daemon is asked once per interval, and the connection is written to periodically", async () => {
  const app = await startApp(buildApp());
  try {
    const held = await holdSubscription(app.url);
    try {
      const writesOnOpen = held.writes.length;
      await until(() => statsRequests() === 1);

      await delay(ONE_INTERVAL_WINDOW_MS);

      assert.equal(statsRequests(), 2, "one immediate pass plus one at the interval, and nothing between");
      assert.ok(
        held.writes.length > writesOnOpen,
        "the server wrote to the held connection again within one interval, which is how a vanished end is discovered",
      );
    } finally {
      held.abort();
    }
  } finally {
    await app.close();
  }
});

// "With no consumer, the number of stats requests reaching the daemon over any window is zero"
// (REQ-41, REQ-44, REQ-57, REQ-58)
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

// "The gate neither leaks, drifts nor wedges ... nothing accumulates per cycle" — an upward drift is
// invisible from the interface and reinstates the defect this change exists to remove (REQ-54)
test("repeated subscribe and disconnect cycles return the count to zero and cost exactly one pass each", async () => {
  const app = await startApp(buildApp());
  try {
    for (let cycle = 1; cycle <= 4; cycle += 1) {
      const held = await holdSubscription(app.url);
      await until(() => statsDemandCount() === 1);
      await until(() => statsRequests() === cycle, 3_000);
      held.abort();

      await until(() => statsDemandCount() === 0);
      assert.equal(statsSamplingActive(), false, `cycle ${cycle} left the daemon quiet`);
      assert.equal(statsRequests(), cycle, `cycle ${cycle} cost exactly one pass`);
    }
  } finally {
    await app.close();
  }
});

// container-stats-subscription-endpoint.md — "Nothing about GET /api/containers changes: ... a
// client that never opens this connection still gets the list — with no sampled figures, since
// nobody is being sampled for" (REQ-55, REQ-58)
test("the container list still answers with no subscription held, carrying no sampled figures", async () => {
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
