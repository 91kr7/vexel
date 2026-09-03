import { after, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { liveChannelRouter } from "../../src/live-channel/live-channel-routes.js";
import { eventStreamService } from "../../src/events/event-stream-service.js";
import { execFileAsync } from "../support/docker-cli.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// plan-docker_management_app/REQ-11, plan-docker_management_app/REQ-12 — a real daemon change is republished live,
// typed and timestamped, within a few seconds and without a manual refresh. The events travel on the
// one live channel since …-multiplexed_sse/REQ-1, so that is the connection driven here.
test("GET /api/live republishes a real daemon change as a typed, timestamped event", async () => {
  const app = express();
  app.use("/api/live", liveChannelRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  eventStreamService.start();
  await delay(500); // let the connect loop attach to the daemon's own /events stream

  const response = await fetch(`http://127.0.0.1:${port}/api/live`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: Array<{ type: string; action: string; timestamp: string }> = [];
  let buffer = "";

  const collectUntilNetworkCreate = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex !== -1) {
        const chunk = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        // Only the daemon events: the channel carries the held values too, and a
        // value message names a value rather than a daemon action.
        const lines = chunk.split("\n");
        const data = lines.find((line) => line.startsWith("data: "));
        if (data && lines.includes("event: daemon-event")) events.push(JSON.parse(data.slice("data: ".length)));
        separatorIndex = buffer.indexOf("\n\n");
      }
      if (events.some((event) => event.type === "network" && event.action === "create")) return;
    }
  })();

  const networkName = `vexel-test-net-${Date.now()}`;
  try {
    await execFileAsync("docker", ["network", "create", networkName]);
    await Promise.race([collectUntilNetworkCreate, delay(8000)]);
  } finally {
    await reader.cancel().catch(() => {});
    await execFileAsync("docker", ["network", "rm", networkName]).catch(() => {});
    // The SSE response keeps its socket open; force it shut instead of
    // waiting on a graceful close that a still-lingering client never triggers.
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }

  const created = events.find((event) => event.type === "network" && event.action === "create");
  assert.ok(created, "expected the network-create event to arrive over the SSE stream within a few seconds");
  assert.match(created.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

// events/specs/event-stream-service.md — the daemon subscription's reconnect loop is intentionally endless
// (server-app/specs/server-bootstrap.md: it stays live independent of any client), so this process never goes
// idle on its own once eventStreamService.start() has run; force it to exit once every test above has settled.
after(() => {
  process.exit(process.exitCode ?? 0);
});
