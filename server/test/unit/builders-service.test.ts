import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// BuildersService talks to buildx only through the shared CLI runner: the mock
// stands in for it, so the output-shape normalization, the platform union, the
// endpoint/status/active derivation and the cache-size aggregation are the only
// behaviours under test (builders-service.md). Field names in the fixtures below
// (Name, Driver, Current, Nodes[].Endpoint/Platforms/Status) mirror `docker
// buildx ls --format json`'s own real output.
interface FakeResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

let handler: (args: string[]) => FakeResult = () => ({ stdout: "", exitCode: 0 });
const calls: string[][] = [];

mock.module(new URL("../../src/docker/cli-runner.ts", import.meta.url).href, {
  namedExports: {
    runCliCommand: (_command: string, args: string[]) => {
      calls.push(args);
      const { stdout = "", stderr = "", exitCode = 0 } = handler(args);
      return {
        cancel: () => undefined,
        onStdout: (listener: (chunk: string) => void) => {
          if (stdout) listener(stdout);
        },
        onStderr: (listener: (chunk: string) => void) => {
          if (stderr) listener(stderr);
        },
        onSpawnError: () => undefined,
        done: Promise.resolve({ exitCode }),
      };
    },
    detectCliAvailability: async () => ({
      docker: { available: true },
      compose: { available: true },
      buildx: { available: true },
    }),
  },
});

const { listBuilders, createBuilder, removeBuilder, useBuilder } = await import("../../src/builders/builders-service.js");
const { DockerDaemonError } = await import("../../src/docker/errors.js");

beforeEach(() => {
  calls.length = 0;
  handler = () => ({ stdout: "", exitCode: 0 });
});

/** Always succeeds with an empty cache, so `du` calls made incidentally by `listBuilders` do not interfere with the assertion under test. */
function emptyCacheOnDu(lsStdout: string): (args: string[]) => FakeResult {
  return (args) => (args[1] === "du" ? { stdout: "[]", exitCode: 0 } : { stdout: lsStdout, exitCode: 0 });
}

const runningNode = { Endpoint: "node-a", Platforms: ["linux/amd64"], Status: "running" };

// builders-service.md — "docker buildx ls/du output is read as newline-delimited JSON ... never
// assumed to be exactly one of those shapes"
test("listBuilders parses genuine newline-delimited JSON, one builder per line", async () => {
  const line1 = JSON.stringify({ Name: "alpha", Driver: "docker-container", Current: false, Nodes: [runningNode] });
  const line2 = JSON.stringify({ Name: "beta", Driver: "docker", Current: true, Nodes: [runningNode] });
  handler = emptyCacheOnDu(`${line1}\n${line2}\n`);

  const builders = await listBuilders();

  assert.deepEqual(
    builders.map((builder) => builder.name).sort(),
    ["alpha", "beta"],
  );
});

test("listBuilders parses a single bare JSON object as the one-builder case", async () => {
  handler = emptyCacheOnDu(JSON.stringify({ Name: "solo", Driver: "docker", Current: true, Nodes: [runningNode] }));

  const builders = await listBuilders();

  assert.equal(builders.length, 1);
  assert.equal(builders[0]!.name, "solo");
});

test("listBuilders parses a single-line JSON array", async () => {
  const array = [
    { Name: "one", Driver: "docker", Current: false, Nodes: [runningNode] },
    { Name: "two", Driver: "docker", Current: true, Nodes: [runningNode] },
  ];
  handler = emptyCacheOnDu(JSON.stringify(array));

  const builders = await listBuilders();

  assert.deepEqual(
    builders.map((builder) => builder.name).sort(),
    ["one", "two"],
  );
});

// builders-service.md — "a genuinely malformed output surfaces as a rejection rather than being
// silently misread"
test("listBuilders rejects rather than silently misreading genuinely malformed output", async () => {
  handler = (args) => (args[1] === "ls" ? { stdout: "not json at all", exitCode: 0 } : { stdout: "[]", exitCode: 0 });

  await assert.rejects(() => listBuilders());
});

// builders-service.md — "A non-zero exit ... rejects with a DockerDaemonError (docker-access, code
// DaemonRejected) carrying the daemon's own message, so the REST layer maps it to 502"
test("listBuilders rejects with a DaemonRejected DockerDaemonError when the CLI exits non-zero", async () => {
  handler = () => ({ stdout: "", stderr: "Cannot connect to the Docker daemon", exitCode: 1 });

  await assert.rejects(
    () => listBuilders(),
    (error: unknown) => {
      assert.ok(error instanceof DockerDaemonError, "expected a DockerDaemonError");
      assert.equal(error.code, "DaemonRejected");
      assert.match(error.message, /Cannot connect to the Docker daemon/);
      return true;
    },
  );
});

test("createBuilder rejects with a DaemonRejected DockerDaemonError when the CLI exits non-zero", async () => {
  handler = (args) => (args[1] === "create" ? { stdout: "", stderr: "invalid driver", exitCode: 1 } : { stdout: "[]", exitCode: 0 });

  await assert.rejects(
    () => createBuilder({ name: "bad", driver: "nope", platforms: [] }),
    (error: unknown) => {
      assert.ok(error instanceof DockerDaemonError, "expected a DockerDaemonError");
      assert.equal(error.code, "DaemonRejected");
      return true;
    },
  );
});

// builders-service.md — "platforms is the union of every node's platforms; endpoint is the first
// node's own endpoint"
test("listBuilders unions every node's platforms and reports the first node's endpoint", async () => {
  const builderJson = JSON.stringify({
    Name: "multi",
    Driver: "docker-container",
    Current: false,
    Nodes: [
      { Endpoint: "node-a", Platforms: ["linux/amd64", "linux/arm64"], Status: "running" },
      { Endpoint: "node-b", Platforms: ["linux/arm64", "linux/386"], Status: "running" },
    ],
  });
  handler = emptyCacheOnDu(builderJson);

  const builders = await listBuilders();

  assert.equal(builders[0]!.endpoint, "node-a");
  assert.deepEqual(builders[0]!.platforms.sort(), ["linux/386", "linux/amd64", "linux/arm64"]);
});

// builders-service.md — "status is 'running' if any node reports running, otherwise the first
// node's own status, or 'unknown' when the builder has no node"
test("listBuilders reports status 'running' when any node is running, even if the first one is not", async () => {
  const builderJson = JSON.stringify({
    Name: "mixed",
    Driver: "docker-container",
    Current: false,
    Nodes: [
      { Endpoint: "node-a", Status: "inactive" },
      { Endpoint: "node-b", Status: "running" },
    ],
  });
  handler = emptyCacheOnDu(builderJson);

  const builders = await listBuilders();

  assert.equal(builders[0]!.status, "running");
});

test("listBuilders falls back to the first node's own status when none is running", async () => {
  const builderJson = JSON.stringify({
    Name: "idle",
    Driver: "docker-container",
    Current: false,
    Nodes: [{ Endpoint: "node-a", Status: "inactive" }],
  });
  handler = emptyCacheOnDu(builderJson);

  const builders = await listBuilders();

  assert.equal(builders[0]!.status, "inactive");
});

test("listBuilders reports status 'unknown' for a builder with no node", async () => {
  const builderJson = JSON.stringify({ Name: "nodeless", Driver: "docker-container", Current: false, Nodes: [] });
  handler = emptyCacheOnDu(builderJson);

  const builders = await listBuilders();

  assert.equal(builders[0]!.status, "unknown");
});

// builders-service.md — "active reflects buildx's own 'current' builder"
test("listBuilders reflects buildx's own Current flag as active", async () => {
  const builderJson = JSON.stringify({ Name: "current-one", Driver: "docker", Current: true, Nodes: [runningNode] });
  handler = emptyCacheOnDu(builderJson);

  const builders = await listBuilders();

  assert.equal(builders[0]!.active, true);
});

// builders-service.md — "cacheBytes ... omitted (not zero) when it could not be read, e.g. the
// builder is not running"
test("listBuilders omits cacheBytes, rather than reporting zero, when the builder's cache cannot be read", async () => {
  const builderJson = JSON.stringify({ Name: "unreachable", Driver: "docker-container", Current: false, Nodes: [] });
  handler = (args) => (args[1] === "du" ? { stdout: "", stderr: "no active session", exitCode: 1 } : { stdout: builderJson, exitCode: 0 });

  const builders = await listBuilders();

  assert.equal(builders[0]!.cacheBytes, undefined);
});

// builders-service.md — "createBuilder ... Rejects with the daemon's own message on a name
// collision or an invalid driver/endpoint"
test("createBuilder rejects with the daemon's own message on failure", async () => {
  handler = (args) => (args[1] === "create" ? { stdout: "", stderr: 'ERROR: existing instance for "dup"', exitCode: 1 } : { stdout: "[]", exitCode: 0 });

  await assert.rejects(() => createBuilder({ name: "dup", driver: "docker-container", platforms: [] }), /existing instance/);
});

// builders-service.md — "createBuilder ... Resolves with the newly created builder's own summary"
test("createBuilder resolves with the newly created builder's own summary", async () => {
  const builderJson = JSON.stringify({ Name: "fresh", Driver: "docker-container", Current: false, Nodes: [runningNode] });
  handler = (args) => {
    if (args[1] === "create") return { stdout: "", exitCode: 0 };
    if (args[1] === "du") return { stdout: "[]", exitCode: 0 };
    return { stdout: builderJson, exitCode: 0 };
  };

  const created = await createBuilder({ name: "fresh", driver: "docker-container", platforms: ["linux/amd64"] });

  assert.equal(created.name, "fresh");
});

// builders-service.md — "removeBuilder ... Rejects with the daemon's own message if the builder
// does not exist or refuses removal"
test("removeBuilder rejects with the daemon's own message on failure", async () => {
  handler = (args) => (args[1] === "rm" ? { stdout: "", stderr: 'no builder "missing" found', exitCode: 1 } : { stdout: "[]", exitCode: 0 });

  await assert.rejects(() => removeBuilder("missing"), /no builder "missing" found/);
});

// builders-service.md — "useBuilder ... resolves with its resulting summary (now active)"
test("useBuilder resolves with the resulting builder now marked active", async () => {
  const builderJson = JSON.stringify({ Name: "target", Driver: "docker", Current: true, Nodes: [runningNode] });
  handler = (args) => {
    if (args[1] === "use") return { stdout: "", exitCode: 0 };
    if (args[1] === "du") return { stdout: "[]", exitCode: 0 };
    return { stdout: builderJson, exitCode: 0 };
  };

  const result = await useBuilder("target");

  assert.equal(result.name, "target");
  assert.equal(result.active, true);
});
