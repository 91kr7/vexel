import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// The CLI plugin inventory the local Docker installation reports
// (plugins/specs/cli-plugins-service.md, REQ-98). The installation is reached
// only through the shared CLI runner, so the mock stands in for it: what is
// under test is what the service derives from the installation's answer — the
// invocation, the version, the three availabilities and the reason attached to
// a plugin the installation refuses to run — and how it degrades when the
// installation answers nothing usable.
interface FakeResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  spawnError?: string;
}

let handler: (args: string[]) => FakeResult = () => ({ stdout: "{}", exitCode: 0 });
const cliCalls: string[][] = [];

mock.module(new URL("../../src/docker/cli-runner.ts", import.meta.url).href, {
  namedExports: {
    runCliCommand: (_command: string, args: string[]) => {
      cliCalls.push(args);
      const { stdout = "", stderr = "", exitCode = 0, spawnError } = handler(args);
      return {
        cancel: () => undefined,
        onStdout: (listener: (chunk: string) => void) => {
          if (stdout) listener(stdout);
        },
        onStderr: (listener: (chunk: string) => void) => {
          if (stderr) listener(stderr);
        },
        onSpawnError: (listener: (message: string) => void) => {
          if (spawnError) listener(spawnError);
        },
        done: Promise.resolve({ exitCode }),
      };
    },
    detectCliAvailability: async () => ({ docker: { available: true }, compose: { available: true }, buildx: { available: true } }),
  },
});

// The reading is client-side only: it must still answer while the daemon is
// unreachable (cli-plugins-service.md). A daemon client that throws on sight
// makes any reliance on the daemon fail the whole file rather than pass quietly.
mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => {
      throw new Error("the CLI plugin inventory must not reach the daemon");
    },
  },
});

const { listCliPlugins } = await import("../../src/plugins/cli-plugins-service.js");

/** The client-side inventory `docker info` reports, with the given plugin entries. */
function clientInfo(plugins: unknown): string {
  return JSON.stringify({ Version: "29.0.0", Context: "desktop-linux", Plugins: plugins });
}

beforeEach(() => {
  cliCalls.length = 0;
  handler = () => ({ stdout: clientInfo([]), exitCode: 0 });
});

// cli-plugins-service.md — CliPlugin = name, command, version?, vendor?, description?, path?,
// availability; "command is the full invocation (docker compose)"
test("listCliPlugins reports each plugin with its invocation, version, vendor and description", async () => {
  handler = () => ({
    stdout: clientInfo([
      { Name: "compose", Version: "v2.40.0", Vendor: "Docker Inc.", ShortDescription: "Docker Compose", Path: "/plugins/docker-compose" },
    ]),
  });

  const listing = await listCliPlugins();

  assert.deepEqual(listing.items, [
    {
      name: "compose",
      command: "docker compose",
      version: "v2.40.0",
      vendor: "Docker Inc.",
      description: "Docker Compose",
      path: "/plugins/docker-compose",
      availability: "enabled",
      unavailableReason: undefined,
    },
  ]);
  assert.equal(listing.unavailableReason, undefined);
});

// cli-plugins-service.md — "version absent when the installation reports none"
test("listCliPlugins reports no version for a plugin the installation gives none for", async () => {
  handler = () => ({ stdout: clientInfo([{ Name: "scout", Version: "" }, { Name: "sbom" }]) });

  const { items } = await listCliPlugins();

  assert.equal(items.find((plugin) => plugin.name === "scout")?.version, undefined);
  assert.equal(items.find((plugin) => plugin.name === "sbom")?.version, undefined);
});

// cli-plugins-service.md — the three availabilities: `enabled` advertised, `available` hidden,
// `unavailable` found but refused, with the installation's own explanation "and only then"
test("listCliPlugins maps the three availabilities and attaches a reason only to the refused one", async () => {
  handler = () => ({
    stdout: clientInfo([
      { Name: "advertised", Version: "v1" },
      { Name: "hidden", Version: "v1", Hidden: true },
      { Name: "broken", Version: "v1", Err: "accessing plugin: permission denied" },
    ]),
  });

  const { items } = await listCliPlugins();
  const byName = new Map(items.map((plugin) => [plugin.name, plugin]));

  assert.equal(byName.get("advertised")!.availability, "enabled");
  assert.equal(byName.get("advertised")!.unavailableReason, undefined);
  assert.equal(byName.get("hidden")!.availability, "available");
  assert.equal(byName.get("hidden")!.unavailableReason, undefined);
  assert.equal(byName.get("broken")!.availability, "unavailable");
  assert.equal(byName.get("broken")!.unavailableReason, "accessing plugin: permission denied");
});

// cli-plugins-service.md — a plugin "the installation found and refuses to run" is `unavailable`
// whatever shape the refusal is reported in; the reason is never lost.
test("listCliPlugins reports a refusal the installation states as an object as unavailable, with a reason", async () => {
  handler = () => ({ stdout: clientInfo([{ Name: "broken", Err: { message: "exec format error" } }]) });

  const [plugin] = (await listCliPlugins()).items;

  assert.equal(plugin!.availability, "unavailable");
  assert.ok((plugin!.unavailableReason ?? "").length > 0, "a refused plugin must state why");
});

// cli-plugins-service.md — "The items come back ordered by name."
test("listCliPlugins orders the items by name", async () => {
  handler = () => ({ stdout: clientInfo([{ Name: "scout" }, { Name: "buildx" }, { Name: "compose" }]) });

  const { items } = await listCliPlugins();

  assert.deepEqual(
    items.map((plugin) => plugin.name),
    ["buildx", "compose", "scout"],
  );
});

// cli-plugins-service.md — "The local Docker installation not answering at all -> an empty listing
// whose unavailableReason quotes the failure; never a rejection."
test("listCliPlugins answers with an empty listing quoting the failure when the installation does not answer", async () => {
  handler = () => ({ stderr: "docker: command not found", exitCode: 127 });

  const listing = await listCliPlugins();

  assert.deepEqual(listing.items, []);
  assert.ok((listing.unavailableReason ?? "").includes("docker: command not found"), String(listing.unavailableReason));
});

test("listCliPlugins answers with an empty listing quoting the failure when the installation cannot be started", async () => {
  handler = () => ({ spawnError: "spawn docker ENOENT", exitCode: 1 });

  const listing = await listCliPlugins();

  assert.deepEqual(listing.items, []);
  assert.ok((listing.unavailableReason ?? "").includes("spawn docker ENOENT"), String(listing.unavailableReason));
});

// cli-plugins-service.md — "An answer that is not the installation's client information ... -> an
// empty listing whose unavailableReason says the installation does not expose one."
test("listCliPlugins states the reason when the answer is not the installation's client information", async () => {
  handler = () => ({ stdout: "not json at all" });

  const listing = await listCliPlugins();

  assert.deepEqual(listing.items, []);
  assert.ok((listing.unavailableReason ?? "").length > 0, "an unreadable answer must be explained");
});

// cli-plugins-service.md — an answer that "carries no plugin inventory" is a stated reason, not an
// empty list that would read as "this installation ships none".
test("listCliPlugins states the reason when the installation exposes no plugin inventory", async () => {
  handler = () => ({ stdout: JSON.stringify({ Version: "29.0.0" }) });

  const listing = await listCliPlugins();

  assert.deepEqual(listing.items, []);
  assert.ok((listing.unavailableReason ?? "").length > 0, "an installation exposing no inventory must say so");
});

// cli-plugins-service.md — "CLI plugins and daemon plugins are two unrelated sets and are never
// merged: this service knows nothing about the daemon's managed plugins (REQ-99)", and the reading
// still answers while the daemon is unreachable.
test("listCliPlugins answers without the daemon, and never reads the daemon's managed plugins", async () => {
  handler = () => ({ stdout: clientInfo([{ Name: "compose", Version: "v2.40.0" }]) });

  const { items } = await listCliPlugins();

  assert.deepEqual(
    items.map((plugin) => plugin.name),
    ["compose"],
  );
  // The daemon client throws on sight in this file, so answering at all proves
  // the reading did not go through it.
  assert.equal(
    cliCalls.some((args) => args.includes("plugin")),
    false,
    "the CLI inventory must not run `docker plugin`, which is the daemon's unrelated set",
  );
});

// cli-plugins-service.md — "Nothing here changes anything: the CLI plugin inventory is read-only."
test("listCliPlugins only ever reads", async () => {
  await listCliPlugins();

  for (const args of cliCalls) {
    for (const forbidden of ["install", "rm", "remove", "enable", "disable", "create"]) {
      assert.equal(args.includes(forbidden), false, `the CLI inventory must not run \`docker ${args.join(" ")}\``);
    }
  }
});
