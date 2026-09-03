import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { installEngineMock } from "../support/engine-mock.js";

// The gate's liveness figures run on the process's clock
// (containers/specs/container-stats-subscription-endpoint.md;
// plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-11).
//
// A file of its own, set before the modules are loaded: the factor is read once, when the timing
// area is first imported, and the rest of this pass measures the shipped values on purpose.
process.env.VEXEL_TIMING_SCALE = "0.2";

const engine = installEngineMock();

const { handleStatsSubscriptionUpgrade } = await import("../../src/containers/container-stats-subscription-routes.js");
const { statsDemandCount } = await import("../../src/containers/stats-demand-registry.js");
const { stopStatsSampling } = await import("../../src/containers/containers-service.js");

const SUBSCRIPTION_PATH = "/api/containers/stats/subscription";
/** Ping and timeout at a fifth of their shipped values, plus room for the round trip. */
const SCALED_BOUND_MS = 6_000;

engine.on("GET", "/containers/json", () => []);

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function until(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await delay(25);
  }
  assert.fail(`the condition was still false after ${timeoutMs}ms`);
}

after(() => stopStatsSampling());

test("a silent connection is dropped on the scaled bound, not on the shipped one", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(404);
    response.end();
  });
  server.on("upgrade", (request, socket, head) => {
    if (!handleStatsSubscriptionUpgrade(request, socket, head)) socket.destroy();
  });
  const port = await new Promise<number>((resolve) => {
    server.listen(0, () => resolve((server.address() as AddressInfo).port));
  });

  try {
    // Answers no ping, as an end that has vanished does.
    const socket = new WebSocket(`ws://127.0.0.1:${port}${SUBSCRIPTION_PATH}`, { autoPong: false });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("open", () => resolve());
        socket.once("error", reject);
      });
      await until(() => statsDemandCount() === 1, 3_000);

      await until(() => statsDemandCount() === 0, SCALED_BOUND_MS);
    } finally {
      socket.terminate();
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
