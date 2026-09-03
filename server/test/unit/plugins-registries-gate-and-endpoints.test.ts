import { test, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import express, { type Express } from "express";
import { installEngineMock } from "../support/engine-mock.js";

// The demand gate and the two endpoints (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-55, REQ-60, REQ-62).
//
// The gate is measured at the two channels on a fake clock, a whole expiry
// window being a minute of real time; the endpoints are read over HTTP from the
// routers themselves, so the body and the headers are the ones a browser gets.
const engine = installEngineMock();

const configDir = mkdtempSync(join(tmpdir(), "vexel-gate-endpoints-"));
const originalDockerConfig = process.env.DOCKER_CONFIG;
process.env.DOCKER_CONFIG = configDir;

/** Readings of the local Docker installation's CLI plugin inventory. */
let cliReadings = 0;
let cliPlugins: unknown[] = [];

mock.module(new URL("../../src/docker/cli-runner.ts", import.meta.url).href, {
  namedExports: {
    runCliCommand: (_command: string, args: string[]) => {
      if (args[0] !== "info") throw new Error(`unexpected docker invocation: ${args.join(" ")}`);
      cliReadings += 1;
      const stdout = JSON.stringify({ Plugins: cliPlugins });
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

/** Readings of the daemon's registry configuration — one per inventory reading. */
let registryReadings = 0;

mock.module(new URL("../../src/docker/engine-client.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async () => {
        registryReadings += 1;
        return { statusCode: 200, body: JSON.stringify({ RegistryConfig: { IndexConfigs: {} } }) };
      },
    }),
  },
});

const { pluginsRouter } = await import("../../src/plugins/plugins-routes.js");
const { pluginsInventoryCache } = await import("../../src/plugins/plugins-inventory-service.js");
const { registriesRouter } = await import("../../src/registries/registries-routes.js");
const { registryListCache } = await import("../../src/registries/registries-service.js");
const { reloadHeldValues, resetRefreshCache, DEMAND_EXPIRY_MS } = await import("../../src/refresh-cache/refresh-cache.js");
const { DockerDaemonError } = await import("../../src/docker/errors.js");

/** plugins-inventory-service.md and registries-service.md — the period both kinds declare. */
const PERIOD_MS = 30_000;

interface Answer<T> {
  status: number;
  body: T;
  readAt: string | null;
  ageMs: string | null;
  stale: string | null;
}

function startApp(): Promise<{ url: string; close: () => Promise<void> }> {
  const app: Express = express();
  app.use("/api/plugins", pluginsRouter);
  app.use("/api/registries", registriesRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((closeResolve) => server.close(() => closeResolve())),
      });
    });
  });
}

async function get<T>(url: string, path: string): Promise<Answer<T>> {
  const response = await fetch(`${url}${path}`);
  return {
    status: response.status,
    body: (await response.json()) as T,
    readAt: response.headers.get("X-Vexel-Read-At"),
    ageMs: response.headers.get("X-Vexel-Age-Ms"),
    stale: response.headers.get("X-Vexel-Stale"),
  };
}

/** Lets the pending reads run their awaits out; a fake clock does not advance microtasks. */
async function settle(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

/** Advances the fake clock in slices, so a timer chained after an awaited read still fires. */
async function advance(milliseconds: number): Promise<void> {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 5_000) {
    mock.timers.tick(Math.min(5_000, milliseconds - elapsed));
    await settle();
  }
}

/** The expiry is measured from the last request, so the gate closes on the first period tick beyond it. */
function nobodyAsksForAWholeExpiryWindow(): Promise<void> {
  return advance(DEMAND_EXPIRY_MS + PERIOD_MS * 2);
}

after(() => {
  if (originalDockerConfig === undefined) delete process.env.DOCKER_CONFIG;
  else process.env.DOCKER_CONFIG = originalDockerConfig;
  rmSync(configDir, { recursive: true, force: true });
});

// Both kinds are process-wide, so one case would be served what another one's read put there.
beforeEach(() => {
  resetRefreshCache();
  engine.reset();
  cliReadings = 0;
  registryReadings = 0;
  cliPlugins = [{ Name: "compose", Version: "v2" }];
  writeFileSync(join(configDir, "config.json"), JSON.stringify({ auths: { "ghcr.io": {} } }), "utf8");
  engine.on("GET", "/plugins", () => [
    { Id: "id-driver", Name: "driver:v1", Enabled: true, Config: { Interface: { Types: ["docker.volumedriver/1.0"] } } },
  ]);
});

// REQ-55 — "Each is read only while it is being asked for ... A whole expiry window without a
// request stops the reading and drops what was held, so the next request reads fresh."
test("a whole expiry window with nobody asking stops both readings and drops what was held", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    assert.equal(cliReadings, 0, "the installation was read with nobody asking for the plugins");
    assert.equal(registryReadings, 0, "the installation was read with nobody asking for the registries");

    await pluginsInventoryCache.read();
    await registryListCache.read();
    assert.equal(pluginsInventoryCache.isRefreshing(), true, "asking for the plugins started no refresher");
    assert.equal(registryListCache.isRefreshing(), true, "asking for the registries started no refresher");

    await nobodyAsksForAWholeExpiryWindow();
    assert.equal(pluginsInventoryCache.isRefreshing(), false, "the plugins round is still being read with nobody asking");
    assert.equal(registryListCache.isRefreshing(), false, "the registries inventory is still being read with nobody asking");
    assert.equal(pluginsInventoryCache.peek(), undefined, "a plugins round of unknown age survived the expiry of its demand");
    assert.equal(registryListCache.peek(), undefined, "a registries inventory of unknown age survived the expiry of its demand");

    const whenEverythingHadGoneQuiet = { cli: cliReadings, registry: registryReadings };
    await advance(DEMAND_EXPIRY_MS * 4);
    assert.equal(cliReadings, whenEverythingHadGoneQuiet.cli, "the installation was read while nobody was on the Plugins screen");
    assert.equal(registryReadings, whenEverythingHadGoneQuiet.registry, "the installation was read while nobody was on the Registries screen");

    cliPlugins = [{ Name: "compose", Version: "v2" }, { Name: "scout", Version: "v1" }];
    const round = await pluginsInventoryCache.read();
    const inventory = await registryListCache.read();
    assert.deepEqual(round.value.cli.items.map((entry) => entry.name), ["compose", "scout"], "the next request was served a dropped round");
    assert.equal(cliReadings, whenEverythingHadGoneQuiet.cli + 1);
    assert.equal(registryReadings, whenEverythingHadGoneQuiet.registry + 1);
    assert.equal(inventory.ageMs, 0, "the next request was served an inventory of unknown age");
  } finally {
    mock.timers.reset();
  }
});

// REQ-60 — "Both endpoints answer with the body they answer with today and carry the read-time
// headers every held value carries."
test("GET /api/plugins answers the round it answers today, with the read-time headers", async () => {
  const { url, close } = await startApp();
  try {
    const answer = await get<{ cli: { items: { name: string }[] }; daemon: { items: { name: string }[] } }>(url, "/api/plugins");

    assert.equal(answer.status, 200);
    assert.deepEqual(answer.body.cli.items.map((entry) => entry.name), ["compose"]);
    assert.deepEqual(answer.body.daemon.items.map((entry) => entry.name), ["driver:v1"]);
    assert.ok(answer.readAt !== null && !Number.isNaN(Date.parse(answer.readAt)), `the read time is not an instant: ${answer.readAt}`);
    assert.ok(Number.isFinite(Number(answer.ageMs)), `the age is not a number of milliseconds: ${answer.ageMs}`);
    assert.equal(answer.stale, null, "a value just read was answered as stale");

    const again = await get<unknown>(url, "/api/plugins");
    assert.equal(again.status, 200);
    assert.deepEqual(again.body, answer.body, "the second request answered with a different body");
    assert.equal(cliReadings, 1, `two requests cost ${cliReadings} readings of the installation`);
    assert.equal(engine.callsTo("GET", "/plugins").length, 1, "two requests cost more than one reading of the daemon");
  } finally {
    await close();
  }
});

// REQ-60 — the same for the inventory.
test("GET /api/registries answers the inventory it answers today, with the read-time headers", async () => {
  const { url, close } = await startApp();
  try {
    const answer = await get<{ host: string; official: boolean }[]>(url, "/api/registries");

    assert.equal(answer.status, 200);
    assert.ok(Array.isArray(answer.body), "the inventory must be a list");
    assert.equal(answer.body[0]!.host, "docker.io", "the default index no longer comes first");
    assert.equal(answer.body[0]!.official, true);
    assert.ok(answer.body.some((registry) => registry.host === "ghcr.io"), "a configured registry is no longer listed");
    assert.ok(answer.readAt !== null && !Number.isNaN(Date.parse(answer.readAt)), `the read time is not an instant: ${answer.readAt}`);
    assert.ok(Number.isFinite(Number(answer.ageMs)), `the age is not a number of milliseconds: ${answer.ageMs}`);
    assert.equal(answer.stale, null, "a value just read was answered as stale");

    const again = await get<unknown>(url, "/api/registries");
    assert.deepEqual(again.body, answer.body, "the second request answered with a different body");
    assert.equal(registryReadings, 1, `two requests cost ${registryReadings} readings of the installation`);
  } finally {
    await close();
  }
});

// REQ-61 — "a read that fails leaves the last value standing and is reported as staleness rather
// than as a failure".
test("a reading that fails while a round is held keeps it, and says so in the header", async () => {
  const { url, close } = await startApp();
  try {
    const first = await get<{ daemon: { items: { name: string }[] } }>(url, "/api/plugins");
    assert.equal(first.status, 200);

    engine.on("GET", "/plugins", () => {
      throw new DockerDaemonError("DaemonRejected", "cannot reach the Docker daemon", undefined, 502);
    });
    pluginsInventoryCache.markChanged();
    await settle();

    const stale = await get<{ daemon: { items: { name: string }[] } }>(url, "/api/plugins");

    assert.equal(stale.status, 200, "a failed reading blanked an endpoint that was holding an answer");
    assert.deepEqual(stale.body.daemon.items.map((entry) => entry.name), ["driver:v1"], "the last round standing was not the one answered");
    assert.equal(stale.stale, "true", "a stale answer did not say so");
  } finally {
    await close();
  }
});

// REQ-60 — "No endpoint is added, removed or changed in shape": a failure with nothing ever held is
// still the daemon's own, mapped as it is today.
test("a failure with nothing ever held is answered exactly as it is today", async () => {
  const { url, close } = await startApp();
  try {
    engine.on("GET", "/plugins", () => {
      throw new DockerDaemonError("DaemonRejected", "cannot reach the Docker daemon", undefined, 502);
    });

    const answer = await get<{ error?: string }>(url, "/api/plugins");

    assert.equal(answer.status, 502);
    assert.match(answer.body.error ?? "", /cannot reach the Docker daemon/);
    assert.equal(answer.readAt, null, "a failure carried a read time");
  } finally {
    await close();
  }
});

// REQ-61 — "the operator's manual reload reads them again when they are held and skips them when
// they are not".
test("the manual reload reads back the round it holds, and skips the inventory it does not", async () => {
  await pluginsInventoryCache.read();
  const registryReadingsWhenNobodyAsked = registryReadings;
  cliPlugins = [{ Name: "compose", Version: "v2" }, { Name: "scout", Version: "v1" }];

  const report = await reloadHeldValues();

  assert.ok(report.reloaded.includes("plugins"), `the held round was not read again: ${JSON.stringify(report)}`);
  assert.ok(report.skipped.includes("registries"), `the inventory nobody asked for was not skipped: ${JSON.stringify(report)}`);
  assert.equal(registryReadings, registryReadingsWhenNobodyAsked, "the reload read an inventory the server was holding nothing for");
  const round = await pluginsInventoryCache.read();
  assert.deepEqual(round.value.cli.items.map((entry) => entry.name), ["compose", "scout"], "the reload answered before reading again");
});
