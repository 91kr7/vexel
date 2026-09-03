import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { liveChannelRouter } from "../../src/live-channel/live-channel-routes.js";
import { setActiveEndpoint } from "../../src/docker/endpoint.js";
import { startApp } from "../support/fixtures.js";
import type { ConnectionStatus } from "../../src/connectivity/connection-status-service.js";

// The connection status on the channel
// (plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-17,
// REQ-19, REQ-38, REQ-39). Importing the service is what registers the kind, as the running server
// does; nothing else is registered, so every read this file costs the daemon is that value's own.
import "../../src/connectivity/connection-status-service.js";

/** The name the server gives the connection status on the channel. */
const CONNECTION_STATUS = "connection-status";

/** Slack rather than a period: the kind is refilled the moment the endpoint changes. */
const ARRIVAL_BUDGET_MS = 45_000;

interface OpenChannel {
  statuses: ConnectionStatus[];
  close: () => Promise<void>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(condition: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) assert.fail(`timed out after ${timeoutMs}ms waiting for ${what}`);
    await delay(100);
  }
}

/** Opens a channel and collects the connection statuses written on it until it is closed. */
async function openChannel(baseUrl: string): Promise<OpenChannel> {
  const response = await fetch(`${baseUrl}/api/live`);
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  const channel: OpenChannel = {
    statuses: [],
    close: async () => {
      await reader.cancel().catch(() => undefined);
    },
  };

  void (async () => {
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const chunk = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (chunk.done) return;
      buffer += decoder.decode(chunk.value as Uint8Array, { stream: true });
      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const lines = buffer.slice(0, separator).split("\n");
        buffer = buffer.slice(separator + 2);
        const data = lines.find((line) => line.startsWith("data: "))?.slice("data: ".length);
        if (data && lines.includes("event: value")) {
          const message = JSON.parse(data) as { name: string; value: unknown };
          if (message.name === CONNECTION_STATUS) channel.statuses.push(message.value as ConnectionStatus);
        }
        separator = buffer.indexOf("\n\n");
      }
    }
  })();

  return channel;
}

/** The app under test, recording every path asked of it so "nobody asked" is a fact and not a claim. */
function appRecordingRequests(): { app: express.Express; paths: string[] } {
  const paths: string[] = [];
  const app = express();
  app.use((request, _response, next) => {
    paths.push(request.originalUrl);
    next();
  });
  app.use("/api/live", liveChannelRouter);
  return { app, paths };
}

// REQ-8, REQ-19 — the status the server holds reaches the channel, and it carries what only a real
// call to the daemon returns: the negotiated Engine API version and the engine version.
test("carries the connection status with the negotiated Engine API and engine versions", async () => {
  const { app } = appRecordingRequests();
  const running = await startApp(app);
  let channel: OpenChannel | undefined;

  try {
    channel = await openChannel(running.url);
    await waitUntil(() => channel!.statuses.length > 0, ARRIVAL_BUDGET_MS, "the connection status to reach the channel");

    const status = channel.statuses[0];
    assert.equal(status.daemon.reachable, true);
    assert.ok(status.apiVersion, "the status carried no negotiated Engine API version");
    assert.match(status.apiVersion, /^\d+\.\d+$/);
    assert.ok(status.engineVersion, "the status carried no engine version");
    assert.ok(status.cli, "the status carried no CLI availability");
  } finally {
    await channel?.close();
    await running.close();
  }
});

// REQ-17, REQ-19, REQ-39 and the batch's first acceptance scenario — the daemon goes away and comes
// back, and both are on the channel with nobody having asked for anything. It is made unreachable
// through the access layer's own published endpoint (`docker-access/specs/active-endpoint.md`),
// which leaves the operator's daemon untouched; `DOCKER_HOST` outranks that endpoint, so it is
// stepped aside for the duration.
test("pushes the daemon going away and coming back, with nobody asking for it", async () => {
  const previousDockerHost = process.env.DOCKER_HOST;
  const { app, paths } = appRecordingRequests();
  const running = await startApp(app);
  let channel: OpenChannel | undefined;

  try {
    channel = await openChannel(running.url);
    await waitUntil(() => channel!.statuses.some((status) => status.daemon.reachable), ARRIVAL_BUDGET_MS, "the daemon to be reported reachable");

    delete process.env.DOCKER_HOST;
    setActiveEndpoint({ kind: "unix", socketPath: `/tmp/vexel-unreachable-${Date.now()}.sock` });

    await waitUntil(
      () => channel!.statuses.some((status) => !status.daemon.reachable),
      ARRIVAL_BUDGET_MS,
      "the daemon that went away to be reported unreachable",
    );
    const gone = channel.statuses.filter((status) => !status.daemon.reachable).at(-1)!;
    assert.ok(typeof gone.daemon.cause === "string" && gone.daemon.cause.length > 0, "the unreachable daemon was reported without a cause");
    assert.equal(gone.apiVersion, undefined);
    assert.equal(gone.engineVersion, undefined);

    const seenBefore = channel.statuses.length;
    setActiveEndpoint(undefined);

    await waitUntil(
      () => channel!.statuses.slice(seenBefore).some((status) => status.daemon.reachable && status.apiVersion !== undefined),
      ARRIVAL_BUDGET_MS,
      "the daemon that came back to be reported reachable again, with its negotiated version",
    );

    assert.deepEqual(paths, ["/api/live"], `the status was asked for on ${paths.join(", ")}`);
  } finally {
    // Process-wide state: the access layer is handed back the daemon it was talking to.
    setActiveEndpoint(undefined);
    if (previousDockerHost !== undefined) process.env.DOCKER_HOST = previousDockerHost;
    await channel?.close();
    await running.close();
  }
});
