import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { liveChannelRouter } from "../../src/live-channel/live-channel-routes.js";
import { containerListCache } from "../../src/containers/containers-service.js";
import { DEMAND_EXPIRY_MS } from "../../src/refresh-cache/refresh-cache.js";
import { createSleepingContainer, fixtureName, ownershipArgs, removeContainerQuietly, startApp } from "../support/fixtures.js";
import { ALPINE_IMAGE, ensureImages } from "../support/base-images.js";
import { execFileAsync } from "../support/docker-cli.js";

// The one channel a window opens, against the daemon the application actually
// talks to (live-channel/specs/live-channel-endpoint.md;
// plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-2,
// REQ-3, REQ-4, REQ-5, REQ-8, REQ-12, REQ-13, REQ-14, REQ-16, REQ-32).
//
// Every one of the twelve kinds is registered by importing the service that
// declares it — which is what the running server does — so a channel opened here
// carries exactly what a channel opened against the product carries.
import "../../src/connectivity/connection-status-service.js";
import "../../src/builders/build-cache-service.js";
import "../../src/builders/builders-service.js";
import "../../src/compose/compose-discovery-service.js";
import "../../src/contexts/contexts-service.js";
import "../../src/images/images-service.js";
import "../../src/networks/networks-service.js";
import "../../src/plugins/plugins-inventory-service.js";
import "../../src/registries/registries-service.js";
import "../../src/system/disk-usage-service.js";
import "../../src/volumes/volumes-service.js";

// A pruned daemon is a starting state like any other: the base image the
// fixtures are built on is ensured before the first test.
await ensureImages([ALPINE_IMAGE]);

/** REQ-2's census, as the server registers it: the twelve values a channel carries. */
const EVERY_VALUE = [
  "build-cache",
  "builders",
  "compose-projects",
  "connection-status",
  "containers",
  "contexts",
  "disk-usage",
  "images",
  "networks",
  "plugins",
  "registries",
  "volumes",
];

interface ValueMessage {
  name: string;
  value: unknown;
  /** When this test read it off the wire, so an ordering claim can be made about it. */
  at: number;
}

/** One open channel, collected as it is written, until it is closed. */
interface OpenChannel {
  values: ValueMessage[];
  daemonEvents: unknown[];
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

/** Opens a channel and keeps reading it in the background until it is closed. */
async function openChannel(baseUrl: string): Promise<OpenChannel> {
  const response = await fetch(`${baseUrl}/api/live`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const reader = response.body!.getReader();
  const channel: OpenChannel = {
    values: [],
    daemonEvents: [],
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
          channel.values.push({ ...message, at: Date.now() });
        }
        if (data && lines.includes("event: daemon-event")) channel.daemonEvents.push(JSON.parse(data));
        separator = buffer.indexOf("\n\n");
      }
    }
  })();

  return channel;
}

function named(channel: OpenChannel, name: string): ValueMessage[] {
  return channel.values.filter((message) => message.name === name);
}

function containerNames(message: ValueMessage): string[] {
  return (message.value as { name: string }[]).map((container) => container.name);
}

/** How long a value read against a real daemon may take to arrive; several periods of the slowest kind. */
const ARRIVAL_BUDGET_MS = 90_000;

// REQ-2, REQ-3, REQ-32 — "the response carries the current value of each of the twelve values the
// server holds, every message naming which value it is"
test("carries every value the server holds, each message naming which value it is", async () => {
  const app = express();
  app.use("/api/live", liveChannelRouter);
  const running = await startApp(app);
  let channel: OpenChannel | undefined;

  try {
    channel = await openChannel(running.url);
    const carried = () => new Set(channel!.values.map((message) => message.name));

    await waitUntil(() => EVERY_VALUE.every((name) => carried().has(name)), ARRIVAL_BUDGET_MS, "every registered value to reach the channel");

    // The census is the property, not the list: a value the server holds and the
    // channel does not carry is the failure this states.
    assert.deepEqual([...carried()].sort(), EVERY_VALUE);
  } finally {
    await channel?.close();
    await running.close();
  }
});

// REQ-8, REQ-13 — the container list follows the host with nothing asked for, past the window in
// which the demand would have expired had the channel not held it
test("keeps pushing the container list after the demand-expiry window, with nobody asking for it", async () => {
  const app = express();
  app.use("/api/live", liveChannelRouter);
  const running = await startApp(app);
  const created: string[] = [];
  let channel: OpenChannel | undefined;

  try {
    channel = await openChannel(running.url);
    await waitUntil(() => named(channel!, "containers").length > 0, ARRIVAL_BUDGET_MS, "the first container listing");

    // Longer than the whole expiry window, with no read of anyone's in it: the
    // open channel is the only thing keeping the kind refreshed (REQ-13).
    await delay(DEMAND_EXPIRY_MS + 2_000);
    assert.equal(containerListCache.isRefreshing(), true, "the refresh expired while a channel was open");

    const { name } = await createSleepingContainer("live-channel-follows");
    created.push(name);

    await waitUntil(
      () => named(channel!, "containers").some((message) => containerNames(message).includes(name)),
      ARRIVAL_BUDGET_MS,
      "the new container to be pushed on the channel",
    );
  } finally {
    await channel?.close();
    for (const name of created) await removeContainerQuietly(name);
    await running.close();
  }
});

// REQ-14 — "With no channel open, the server reads the daemon for none of the converted values."
test("reads the daemon for none of the values while no channel is open", async () => {
  const app = express();
  app.use("/api/live", liveChannelRouter);
  const running = await startApp(app);

  try {
    await delay(DEMAND_EXPIRY_MS);

    assert.equal(containerListCache.peek(), undefined, "the server held a container listing with no channel open");
    assert.equal(containerListCache.isRefreshing(), false, "the server kept reading the container list with no channel open");
  } finally {
    await running.close();
  }
});

// REQ-16 — "The number of open windows does not change how often the server reads Docker", and
// closing one window leaves the other following the host.
test("keeps the remaining channel following the host when another one closes", async () => {
  const app = express();
  app.use("/api/live", liveChannelRouter);
  const running = await startApp(app);
  const created: string[] = [];
  let first: OpenChannel | undefined;
  let second: OpenChannel | undefined;

  try {
    first = await openChannel(running.url);
    second = await openChannel(running.url);
    await waitUntil(() => named(first!, "containers").length > 0 && named(second!, "containers").length > 0, ARRIVAL_BUDGET_MS, "both channels to be given the container listing");

    await first.close();
    const { name } = await createSleepingContainer("live-channel-two-windows");
    created.push(name);

    await waitUntil(
      () => named(second!, "containers").some((message) => containerNames(message).includes(name)),
      ARRIVAL_BUDGET_MS,
      "the open channel to be pushed the new container",
    );
  } finally {
    await first?.close();
    await second?.close();
    for (const name of created) await removeContainerQuietly(name);
    await running.close();
  }
});

// REQ-5 — "Daemon events that arrive together produce one push, not one push each."
test("pushes the container list once for a burst of daemon events", async () => {
  const app = express();
  app.use("/api/live", liveChannelRouter);
  const running = await startApp(app);
  const created: string[] = [];
  let channel: OpenChannel | undefined;

  try {
    channel = await openChannel(running.url);
    // Created ahead of the burst so the burst itself is one command: three
    // `start` events land inside one grouping window.
    for (const index of [1, 2, 3]) {
      const name = fixtureName(`live-channel-burst-${index}`);
      created.push(name);
      await execFileAsync("docker", ["create", "--name", name, ...ownershipArgs(name), "--entrypoint", "sleep", ALPINE_IMAGE, "300"]);
    }
    await waitUntil(
      () => named(channel!, "containers").some((message) => created.every((name) => containerNames(message).includes(name))),
      ARRIVAL_BUDGET_MS,
      "the three created containers to reach the channel",
    );

    const before = named(channel, "containers").length;
    await execFileAsync("docker", ["start", ...created]);
    await waitUntil(() => named(channel!, "containers").length > before, ARRIVAL_BUDGET_MS, "the burst to be pushed");
    // Wide enough for a second push to have been produced had each event caused one.
    await delay(2_000);

    const pushes = named(channel, "containers").length - before;
    assert.equal(pushes, 1, `three daemon events arriving together produced ${pushes} pushes`);
  } finally {
    await channel?.close();
    for (const name of created) await removeContainerQuietly(name);
    await running.close();
  }
});

// REQ-4, REQ-12 — "the server pushes a converted value only when that value has changed", so a
// value the server re-reads and finds identical produces no message at all.
//
// The subject is a **volume**, not the container listing: a running container's summary carries the
// daemon's humanized uptime ("Up 4 seconds", then "Up 8 seconds"), so its value genuinely changes on
// every read and REQ-4 has it pushed. A volume listing carries no such field, so what is measured
// here is the rule and not the daemon's clock.
test("pushes a value no further while it is re-read and found unchanged", async () => {
  const app = express();
  app.use("/api/live", liveChannelRouter);
  const running = await startApp(app);
  const volume = fixtureName("live-channel-quiet");
  let channel: OpenChannel | undefined;

  try {
    await execFileAsync("docker", ["volume", "create", ...ownershipArgs(volume), volume]);
    channel = await openChannel(running.url);
    await waitUntil(
      () => named(channel!, "volumes").some((message) => (message.value as { name: string }[]).some((held) => held.name === volume)),
      ARRIVAL_BUDGET_MS,
      "the volume listing to reach the channel",
    );
    // The listing arrives first without its sizes and again once the volume-sizes
    // reading has filled them in: two genuinely different values, and the baseline
    // is taken after both, so what is measured below is a value that has settled.
    await delay(3_000);
    const settled = named(channel, "volumes").length;

    // Several periods of the volume listing, with nothing operated on the host.
    await delay(30_000);

    const pushes = named(channel, "volumes").length - settled;
    assert.equal(pushes, 0, `a quiet host produced ${pushes} further volume listings on the channel`);
  } finally {
    await channel?.close();
    await execFileAsync("docker", ["volume", "rm", "-f", volume]).catch(() => undefined);
    await running.close();
  }
});
