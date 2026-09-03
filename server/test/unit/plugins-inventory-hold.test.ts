import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { installEngineMock } from "../support/engine-mock.js";
import type { DaemonEvent } from "../../src/events/event-stream-service.js";

// What holding the plugins round buys (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-54, REQ-56, REQ-62).
//
// The subject is the traffic, so both channels of the installation are stood in
// for and every call to each is counted: only that tells one reading serving
// many requests from one reading per request.
const engine = installEngineMock();

/** Every `docker` invocation the CLI half has made since the last reset. */
const cliCalls: string[][] = [];
let clientInfo: unknown = { Plugins: [] };

mock.module(new URL("../../src/docker/cli-runner.ts", import.meta.url).href, {
  namedExports: {
    runCliCommand: (_command: string, args: string[]) => {
      cliCalls.push(args);
      const stdout = JSON.stringify(clientInfo);
      return {
        cancel: () => undefined,
        onStdout: (listener: (chunk: string) => void) => listener(stdout),
        onStderr: () => undefined,
        onSpawnError: () => undefined,
        done: Promise.resolve({ exitCode: 0 }),
      };
    },
    detectCliAvailability: async () => ({
      docker: { available: true },
      compose: { available: true },
      buildx: { available: true },
    }),
  },
});

const { pluginsInventoryCache } = await import("../../src/plugins/plugins-inventory-service.js");
const { resetRefreshCache, EVENT_GROUPING_WINDOW_MS } = await import("../../src/refresh-cache/refresh-cache.js");
const { eventStreamService } = await import("../../src/events/event-stream-service.js");

/** A CLI plugin as `docker info`'s client information reports one. */
function cliPlugin(name: string): unknown {
  return { Name: name, Path: `/plugins/${name}`, Vendor: "Docker Inc.", Version: "v1", ShortDescription: name };
}

/** A managed plugin as `GET /plugins` reports one. */
function daemonPlugin(name: string, enabled: boolean): unknown {
  return { Id: `id-${name}`, Name: name, Enabled: enabled, Config: { Interface: { Types: ["docker.volumedriver/1.0"] } } };
}

function daemonEvent(action: string): DaemonEvent {
  return { id: `plugin-${action}-${Math.random()}`, timestamp: new Date().toISOString(), type: "plugin", action };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** "After the value was held" is measured in whole milliseconds, and a mocked installation answers inside one. */
function anInstantLater(): Promise<void> {
  return wait(5);
}

/** The budget is one read started per window, and the read that filled the kind has just spent one. */
function aWholeGroupingWindow(): Promise<void> {
  return wait(EVENT_GROUPING_WINDOW_MS + 50);
}

/**
 * Waits for the round the notice caused to be held, without deciding when the
 * cache starts it: the bound is the check's, the timing the cache's. `peek`
 * rather than `read`, which would renew the demand and answer from what is held.
 */
async function heldRoundToCarry(cliPluginCount: number, budgetMs: number): Promise<void> {
  const deadline = Date.now() + budgetMs;
  while ((pluginsInventoryCache.peek()?.value.cli.items.length ?? 0) < cliPluginCount && Date.now() < deadline) await wait(10);
}

beforeEach(() => {
  // The cache is process-wide and its refresher outlives the test that started
  // it: without this, one test is served what another one's read put there.
  resetRefreshCache();
  engine.reset();
  cliCalls.length = 0;
  clientInfo = { Plugins: [cliPlugin("compose")] };
  engine.on("GET", "/plugins", () => [daemonPlugin("driver:latest", false)]);
});

// REQ-54 — "However many windows are open, the local Docker installation and the daemon are read
// once per period, not once per request."
test("many requests inside one period cost one reading of the installation", async () => {
  await pluginsInventoryCache.read();
  await Promise.all([pluginsInventoryCache.read(), pluginsInventoryCache.read()]);
  for (let request = 0; request < 5; request += 1) await pluginsInventoryCache.read();

  assert.equal(cliCalls.length, 1, `eight requests cost ${cliCalls.length} readings of the local Docker installation`);
  assert.equal(engine.callsTo("GET", "/plugins").length, 1, "eight requests cost more than one reading of the daemon");
});

// REQ-56 — "the CLI inventory and the daemon inventory are read together and held together, so the
// two panels never show two different moments of the same installation."
test("the round is stored and served whole: the two halves never come from two moments", async () => {
  const first = await pluginsInventoryCache.read();
  assert.deepEqual(first.value.cli.items.map((plugin) => plugin.name), ["compose"]);
  assert.deepEqual(first.value.daemon.items.map((plugin) => plugin.name), ["driver:latest"]);

  clientInfo = { Plugins: [cliPlugin("compose"), cliPlugin("buildx")] };
  engine.on("GET", "/plugins", () => [daemonPlugin("driver:latest", true)]);

  const served = await pluginsInventoryCache.read();
  assert.deepEqual(
    served.value.cli.items.map((plugin) => plugin.name),
    ["compose"],
    "the CLI half moved on its own while the daemon half stayed where it was",
  );
  assert.equal(served.value.daemon.items[0]!.enabled, false, "the daemon half moved on its own while the CLI half stayed where it was");

  await anInstantLater();
  pluginsInventoryCache.markChanged();
  const afterTheChange = await pluginsInventoryCache.read();
  assert.deepEqual(afterTheChange.value.cli.items.map((plugin) => plugin.name), ["buildx", "compose"]);
  assert.equal(afterTheChange.value.daemon.items[0]!.enabled, true);
  assert.equal(cliCalls.length, engine.callsTo("GET", "/plugins").length, "the two halves were read a different number of times");
});

// REQ-54, and the kind's own declaration: the round is marked due by the daemon's `plugin` events,
// within the grouping window the cache groups a burst into.
test("a plugin event marks the round due, and reaches both halves", async () => {
  await pluginsInventoryCache.read();
  assert.equal(cliCalls.length, 1);

  await aWholeGroupingWindow();

  clientInfo = { Plugins: [cliPlugin("compose"), cliPlugin("scout")] };
  engine.on("GET", "/plugins", () => [daemonPlugin("driver:latest", true)]);
  eventStreamService.emit("event", daemonEvent("enable"));

  await heldRoundToCarry(2, EVENT_GROUPING_WINDOW_MS * 4);
  assert.equal(cliCalls.length, 2, "a plugin event started no reading of the installation");
  assert.equal(engine.callsTo("GET", "/plugins").length, 2, "a plugin event reached the CLI half but not the daemon half");

  const served = await pluginsInventoryCache.read();
  assert.deepEqual(served.value.cli.items.map((plugin) => plugin.name), ["compose", "scout"]);
  assert.equal(served.value.daemon.items[0]!.enabled, true, "the event moved the CLI half and left the daemon half behind");
});

// REQ-56 — "Each side keeps carrying its own stated unavailability": one channel going quiet is a
// reason on that side, never a failure of the round.
test("a daemon exposing no managed plugins is a reason on its own side, and the CLI half still answers", async () => {
  const { DockerDaemonError } = await import("../../src/docker/errors.js");
  engine.on("GET", "/plugins", () => {
    throw new DockerDaemonError("DaemonRejected", "page not found", undefined, 404);
  });

  const served = await pluginsInventoryCache.read();

  assert.deepEqual(served.value.cli.items.map((plugin) => plugin.name), ["compose"]);
  assert.deepEqual(served.value.daemon.items, []);
  assert.match(served.value.daemon.unavailableReason ?? "", /does not expose managed plugins/);
  assert.equal(served.stale, false, "one side's stated unavailability was reported as a failed round");
});
