import { test, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installEngineMock } from "../support/engine-mock.js";

// What the operator's own action must not lose (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-57, REQ-62).
//
// Each case fills the held value first, so there is a reading from before the
// action for the answer to fall back to — the failure being checked for. Both
// stand-ins act like the real channels: a state change moves the fake daemon's
// own plugin list, and a `docker login` writes the throwaway Docker configuration.
const engine = installEngineMock();

const configDir = mkdtempSync(join(tmpdir(), "vexel-follow-actions-"));
const originalDockerConfig = process.env.DOCKER_CONFIG;
process.env.DOCKER_CONFIG = configDir;

interface DockerConfig {
  auths?: Record<string, { auth?: string }>;
}

function writeDockerConfig(config: DockerConfig): void {
  writeFileSync(join(configDir, "config.json"), JSON.stringify(config), "utf8");
}

function readDockerConfig(): DockerConfig {
  return JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as DockerConfig;
}

const cliCalls: { args: string[]; stdin?: string }[] = [];

/** The CLI channel, acting as the real one does: `docker info` reports the client inventory, login and logout write the credential store. */
function runDocker(args: string[], stdin: string | undefined): string {
  if (args[0] === "info") return JSON.stringify({ Plugins: [{ Name: "compose", Version: "v2" }] });
  if (args[0] === "login") {
    const config = readDockerConfig();
    const auths = { ...(config.auths ?? {}) };
    auths[args[1]!] = { auth: Buffer.from(`${args[3]}:${stdin ?? ""}`).toString("base64") };
    writeDockerConfig({ ...config, auths });
    return "Login Succeeded\n";
  }
  if (args[0] === "logout") {
    const config = readDockerConfig();
    const auths = { ...(config.auths ?? {}) };
    delete auths[args[1]!];
    writeDockerConfig({ ...config, auths });
    return "Removing login credentials\n";
  }
  throw new Error(`unexpected docker invocation: ${args.join(" ")}`);
}

mock.module(new URL("../../src/docker/cli-runner.ts", import.meta.url).href, {
  namedExports: {
    runCliCommand: (_command: string, args: string[], _endpoint: unknown, options: { stdin?: string } = {}) => {
      cliCalls.push({ args, stdin: options.stdin });
      const stdout = runDocker(args, options.stdin);
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

// The registries read the daemon's `/info` through the shared Engine client,
// not through the connectivity service the other mock stands in for.
mock.module(new URL("../../src/docker/engine-client.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async () => ({ statusCode: 200, body: JSON.stringify({ RegistryConfig: { IndexConfigs: {} } }) }),
    }),
  },
});

const { pluginsInventoryCache } = await import("../../src/plugins/plugins-inventory-service.js");
const { disablePlugin, enablePlugin, installPlugin, removePlugin } = await import(
  "../../src/plugins/plugin-management-service.js"
);
const { loginToRegistry, logoutFromRegistry, registryListCache } = await import("../../src/registries/registries-service.js");
const { resetRefreshCache } = await import("../../src/refresh-cache/refresh-cache.js");

const REMOTE = "registry.internal:5000/driver:v1";
const PRIVILEGES = [{ Name: "mount", Description: "", Value: ["/var/lib"] }];
const REGISTRY_HOST = "registry.internal:5000";

/** The daemon's managed plugins, as this fake daemon holds them between calls. */
let installedPlugins: { Id: string; Name: string; Enabled: boolean; Config: unknown }[] = [];

function plugin(name: string, enabled: boolean) {
  return { Id: `id-${name}`, Name: name, Enabled: enabled, Config: { Interface: { Types: ["docker.volumedriver/1.0"] } } };
}

function found(name: string) {
  const match = installedPlugins.find((candidate) => candidate.Name === name);
  if (!match) throw new Error(`this fake daemon holds no plugin named ${name}`);
  return match;
}

/** The names the held round carries for the daemon side, read as the endpoint reads it. */
async function daemonNamesInTheHeldRound(): Promise<string[]> {
  return (await pluginsInventoryCache.read()).value.daemon.items.map((entry) => entry.name);
}

async function heldPlugin(name: string) {
  return (await pluginsInventoryCache.read()).value.daemon.items.find((entry) => entry.name === name);
}

/** "After the value was held" is measured in whole milliseconds, and a mocked daemon answers inside one. */
function anInstantLater(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
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
  cliCalls.length = 0;
  installedPlugins = [];
  writeDockerConfig({ auths: {} });

  engine.on("GET", "/plugins", () => installedPlugins);
  engine.on("GET", "/plugins/privileges", () => PRIVILEGES);
  engine.on("POST", "/plugins/pull", (call) => {
    const name = call.query.get("name") ?? call.query.get("remote") ?? "";
    installedPlugins = [...installedPlugins, plugin(name, false)];
    return '{"status":"Download complete"}\n';
  });
  engine.on("POST", /^\/plugins\/[^/]+\/enable$/, (call) => {
    found(decodeURIComponent(call.pathname.split("/")[2]!)).Enabled = true;
    return {};
  });
  engine.on("POST", /^\/plugins\/[^/]+\/disable$/, (call) => {
    found(decodeURIComponent(call.pathname.split("/")[2]!)).Enabled = false;
    return {};
  });
  engine.on("DELETE", /^\/plugins\/[^/]+$/, (call) => {
    const name = decodeURIComponent(call.pathname.split("/")[2]!);
    installedPlugins = installedPlugins.filter((candidate) => candidate.Name !== name);
    return {};
  });
  engine.on("GET", /^\/plugins\/[^/]+\/json$/, (call) => found(decodeURIComponent(call.pathname.split("/")[2]!)));
});

// REQ-57 — "after installing ... a plugin ... the listing the screen reads back describes the
// change and never a state read before it."
test("a plugin just installed is in the listing the screen reads back", async () => {
  assert.deepEqual(await daemonNamesInTheHeldRound(), [], "the round was not held before the install");
  await anInstantLater();

  await installPlugin({ remote: REMOTE, alias: "driver:v1", grantedPrivileges: [{ name: "mount", values: ["/var/lib"] }], enable: false });

  assert.deepEqual(await daemonNamesInTheHeldRound(), ["driver:v1"], "the listing read back after an install did not name the plugin");
});

// REQ-57 — the same for an enable.
test("a plugin just enabled is enabled in the listing the screen reads back", async () => {
  installedPlugins = [plugin("driver:v1", false)];
  assert.equal((await heldPlugin("driver:v1"))!.enabled, false);
  await anInstantLater();

  await enablePlugin("driver:v1");

  assert.equal((await heldPlugin("driver:v1"))!.enabled, true, "the listing read back after an enable still described the plugin as disabled");
});

// REQ-57 — the same for a disable.
test("a plugin just disabled is disabled in the listing the screen reads back", async () => {
  installedPlugins = [plugin("driver:v1", true)];
  assert.equal((await heldPlugin("driver:v1"))!.enabled, true);
  await anInstantLater();

  await disablePlugin("driver:v1");

  assert.equal((await heldPlugin("driver:v1"))!.enabled, false, "the listing read back after a disable still described the plugin as enabled");
});

// REQ-57 — the same for a removal.
test("a plugin just removed is gone from the listing the screen reads back", async () => {
  installedPlugins = [plugin("driver:v1", false)];
  assert.deepEqual(await daemonNamesInTheHeldRound(), ["driver:v1"]);
  await anInstantLater();

  await removePlugin("driver:v1");

  assert.deepEqual(await daemonNamesInTheHeldRound(), [], "the listing read back after a removal still named the plugin");
});

// REQ-57 — "and after a log in ... the listing the screen reads back describes the change"; the log
// in itself answers from a direct read, which is the other half of the same promise.
test("a registry just logged in to is authenticated in the listing the screen reads back", async () => {
  const before = (await registryListCache.read()).value.find((registry) => registry.host === REGISTRY_HOST);
  assert.equal(before, undefined, "the fixture registry is configured before the log in");
  await anInstantLater();

  const answered = await loginToRegistry({ host: REGISTRY_HOST, username: "octocat", secret: "s3cret" });
  assert.equal(answered.authenticated, true, "the log in answered with a state read before it");
  assert.equal(answered.account, "octocat");

  const listed = (await registryListCache.read()).value.find((registry) => registry.host === REGISTRY_HOST);
  assert.equal(listed?.authenticated, true, "the listing read back after a log in did not describe it");
  assert.equal(listed?.account, "octocat");
});

// REQ-57 — the same for a log out.
test("a registry just logged out of is no longer authenticated in the listing the screen reads back", async () => {
  writeDockerConfig({ auths: { [REGISTRY_HOST]: { auth: Buffer.from("octocat:s3cret").toString("base64") } } });
  const before = (await registryListCache.read()).value.find((registry) => registry.host === REGISTRY_HOST);
  assert.equal(before?.authenticated, true);
  await anInstantLater();

  const answered = await logoutFromRegistry(REGISTRY_HOST);
  assert.equal(answered.authenticated, false, "the log out answered with a state read before it");

  const listed = (await registryListCache.read()).value.find((registry) => registry.host === REGISTRY_HOST);
  assert.equal(listed?.authenticated ?? false, false, "the listing read back after a log out still described the registry as authenticated");
});

// REQ-57 — an operation the daemon refuses states nothing: what is held still describes what is
// true, and the refusal is the caller's.
test("a state change the daemon refuses leaves the listing describing what is actually true", async () => {
  installedPlugins = [plugin("driver:v1", false)];
  assert.equal((await heldPlugin("driver:v1"))!.enabled, false);
  await anInstantLater();
  engine.on("POST", /^\/plugins\/[^/]+\/enable$/, () => {
    throw new Error("plugin driver:v1 failed to enable");
  });

  await assert.rejects(() => enablePlugin("driver:v1"), /failed to enable/);

  assert.equal((await heldPlugin("driver:v1"))!.enabled, false, "a refused enable moved what the listing says");
});
