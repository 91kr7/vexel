import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ContextsService reaches the local Docker configuration only through the
// shared CLI runner (contexts/specs/contexts-service.md), so the mock stands in
// for it: the inventory's derivations (endpoint, kind, tls, active, error), the
// endpoint a creation asks Docker for, the error mapping and the publication of
// the active endpoint are the only behaviours under test. The fixture shapes
// below mirror the real output of `docker context ls --format json` and
// `docker context inspect`.
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

const { listContexts, createContext, activateContext, removeContext, publishActiveEndpoint } = await import(
  "../../src/contexts/contexts-service.js"
);
const { DockerDaemonError } = await import("../../src/docker/errors.js");
const { defaultLocalSocket, resolveActiveEndpoint, setActiveEndpoint } = await import("../../src/docker/endpoint.js");

interface ListEntry {
  Name: string;
  Description?: string;
  DockerEndpoint?: string;
  Current?: boolean;
  Error?: string;
}

interface InspectEntry {
  Name: string;
  Endpoints?: { docker?: { Host?: string } };
  TLSMaterial?: Record<string, string[]>;
  Storage?: { TLSPath?: string };
}

/** Answers `context ls` with the given inventory and `context inspect` with the matching detail, exactly as the real CLI lays them out. */
function inventory(entries: ListEntry[], inspects: InspectEntry[] = []): (args: string[]) => FakeResult {
  const details =
    inspects.length > 0
      ? inspects
      : entries.map((entry) => ({
          Name: entry.Name,
          Endpoints: { docker: { Host: entry.DockerEndpoint ?? "" } },
          TLSMaterial: {},
          Storage: { TLSPath: "<IN MEMORY>" },
        }));
  return (args) => {
    if (args[1] === "inspect") {
      const requested = details.filter((detail) => args.includes(detail.Name));
      return { stdout: JSON.stringify(requested.length > 0 ? requested : details), exitCode: 0 };
    }
    if (args[1] === "ls") {
      return { stdout: entries.map((entry) => JSON.stringify(entry)).join("\n"), exitCode: 0 };
    }
    return { stdout: "", exitCode: 0 };
  };
}

function listEntry(name: string, endpoint: string, overrides: Partial<ListEntry> = {}): ListEntry {
  return { Name: name, Description: "", DockerEndpoint: endpoint, Current: false, Error: "", ...overrides };
}

function argsOf(subcommand: string): string[] {
  const call = calls.find((args) => args[1] === subcommand);
  assert.ok(call, `expected a \`docker context ${subcommand}\` call`);
  return call!;
}

beforeEach(() => {
  calls.length = 0;
  handler = () => ({ stdout: "", exitCode: 0 });
  // The active endpoint is process-wide: each test starts from the platform default.
  setActiveEndpoint(undefined);
});

// contexts-service.md — "kind is derived from that URL: ssh for ssh://, tcp for
// tcp:///http:///https://, local for anything else (unix://, npipe://)"
test("listContexts derives the endpoint kind from the endpoint URL", async () => {
  handler = inventory([
    listEntry("sock", "unix:///var/run/docker.sock"),
    listEntry("pipe", "npipe:////./pipe/docker_engine"),
    listEntry("remote", "ssh://operator@build-host"),
    listEntry("plain-tcp", "tcp://198.51.100.7:2375"),
    listEntry("secure", "https://198.51.100.8:2376"),
  ]);

  const contexts = await listContexts();
  const kindOf = (name: string) => contexts.find((context) => context.name === name)?.kind;

  assert.equal(kindOf("sock"), "local");
  assert.equal(kindOf("pipe"), "local");
  assert.equal(kindOf("remote"), "ssh");
  assert.equal(kindOf("plain-tcp"), "tcp");
  assert.equal(kindOf("secure"), "tcp");
});

// contexts-service.md — "endpoint is the endpoint URL exactly as Docker records it"
test("listContexts reports the endpoint URL exactly as Docker records it", async () => {
  handler = inventory([listEntry("remote", "ssh://operator@build-host")]);

  const contexts = await listContexts();

  assert.equal(contexts[0]!.endpoint, "ssh://operator@build-host");
});

// contexts-service.md — "'' when the context records none"
test("listContexts reports an empty endpoint for a context recording none", async () => {
  handler = inventory([listEntry("endpointless", "")]);

  const contexts = await listContexts();

  assert.equal(contexts[0]!.endpoint, "");
});

// contexts-service.md — "active marks the one context Docker currently has selected; at most one is active"
test("listContexts marks as active the one context Docker has selected, and no other", async () => {
  handler = inventory([
    listEntry("one", "unix:///var/run/docker.sock"),
    listEntry("two", "ssh://operator@build-host", { Current: true }),
    listEntry("three", "tcp://198.51.100.7:2375"),
  ]);

  const contexts = await listContexts();

  assert.deepEqual(
    contexts.filter((context) => context.active).map((context) => context.name),
    ["two"],
  );
});

// contexts-service.md — "error carries Docker's own message for a context it could not read; the
// context is still listed"
test("listContexts still lists a context Docker reports an error for, carrying that message", async () => {
  handler = inventory([listEntry("broken", "ssh://operator@gone", { Error: "cannot connect to the host" })]);

  const contexts = await listContexts();

  assert.equal(contexts.length, 1);
  assert.equal(contexts[0]!.name, "broken");
  assert.match(contexts[0]!.error ?? "", /cannot connect to the host/);
});

// contexts-service.md — "Every context is listed whatever its endpoint kind — a TCP+TLS one created
// outside the application included: none is filtered out, and none is marked unsupported" and
// "tls is true when the context carries TLS material for its Docker endpoint"
test("listContexts lists an externally created TCP+TLS context, marked tls, alongside the others", async () => {
  handler = inventory(
    [listEntry("local-one", "unix:///var/run/docker.sock"), listEntry("secure", "tcp://198.51.100.7:2376")],
    [
      {
        Name: "local-one",
        Endpoints: { docker: { Host: "unix:///var/run/docker.sock" } },
        TLSMaterial: {},
        Storage: { TLSPath: "<IN MEMORY>" },
      },
      {
        Name: "secure",
        Endpoints: { docker: { Host: "tcp://198.51.100.7:2376" } },
        TLSMaterial: { docker: ["ca.pem", "cert.pem", "key.pem"] },
        Storage: { TLSPath: "/home/operator/.docker/contexts/tls/abc" },
      },
    ],
  );

  const contexts = await listContexts();
  const secure = contexts.find((context) => context.name === "secure");

  assert.equal(contexts.length, 2);
  assert.ok(secure, "the TCP+TLS context must be listed like any other");
  assert.equal(secure!.kind, "tcp");
  assert.equal(secure!.tls, true);
  assert.equal(contexts.find((context) => context.name === "local-one")!.tls, false);
});

const localSocket = "unix:///var/run/docker.sock";

/** The listed names in the order they came back: a context carries no identifier but its name, so the name is the whole sequence. */
async function listedNames(entries: ListEntry[]): Promise<string[]> {
  handler = inventory(entries);
  const contexts = await listContexts();
  return contexts.map((context) => context.name);
}

// contexts-service.md — "Ordered by context name under the list-order rule (compareNames)" and
// "The active context keeps its alphabetical place: it is marked by active, never promoted" (REQ-10)
test("listContexts orders an out-of-order inventory by name, leaving the active context in its alphabetical place", async () => {
  handler = inventory([
    listEntry("ctx-10", localSocket),
    listEntry("zulu", localSocket, { Current: true }),
    listEntry("ctx-2", localSocket),
    listEntry("alpha", localSocket),
  ]);

  const contexts = await listContexts();

  assert.deepEqual(
    contexts.map((context) => context.name),
    ["alpha", "ctx-2", "ctx-10", "zulu"],
  );
  assert.equal(contexts.at(-1)!.name, "zulu");
  assert.equal(contexts.at(-1)!.active, true);
});

// contexts-service.md — "the final comparison is that same name compared exactly, which separates
// two contexts whose names differ only in case" (REQ-5, REQ-10, REQ-12)
test("listContexts separates two contexts whose names differ only in case, both ways round", async () => {
  const forwards = await listedNames([listEntry("data", localSocket), listEntry("Data", localSocket)]);
  const backwards = await listedNames([listEntry("Data", localSocket), listEntry("data", localSocket)]);

  assert.deepEqual(forwards, ["Data", "data"]);
  assert.deepEqual(backwards, forwards);
});

// contexts-service.md — "... or in leading zeros" (REQ-5, REQ-10, REQ-12)
test("listContexts separates two contexts whose names differ only in leading zeros, both ways round", async () => {
  const forwards = await listedNames([listEntry("ctx-1", localSocket), listEntry("ctx-01", localSocket)]);
  const backwards = await listedNames([listEntry("ctx-01", localSocket), listEntry("ctx-1", localSocket)]);

  assert.deepEqual(forwards, ["ctx-01", "ctx-1"]);
  assert.deepEqual(backwards, forwards);
});

// contexts-service.md — "The same contexts produce the same sequence on every read, whatever order
// Docker listed them in" (REQ-6, REQ-12): the only check that detects a missing final comparison,
// since a sort that is stable keeps whatever Docker's own listing happened to say.
test("listContexts produces one sequence whichever order Docker listed the contexts in", async () => {
  const entries = [
    listEntry("ctx-1", localSocket),
    listEntry("Data", localSocket),
    listEntry("ctx-10", localSocket),
    listEntry("data", localSocket),
    listEntry("ctx-01", localSocket),
    listEntry("ctx-2", localSocket),
  ];

  const forwards = await listedNames(entries);
  const backwards = await listedNames([...entries].reverse());

  assert.deepEqual(forwards, ["ctx-01", "ctx-1", "ctx-2", "ctx-10", "Data", "data"]);
  assert.deepEqual(backwards, forwards);
});

// contexts-service.md — "A non-zero exit or a spawn failure of the underlying CLI command rejects
// with a DockerDaemonError (docker-access, code DaemonRejected) carrying Docker's own message"
test("listContexts rejects with a DaemonRejected DockerDaemonError when the CLI exits non-zero", async () => {
  handler = () => ({ stdout: "", stderr: "docker: command not usable", exitCode: 1 });

  await assert.rejects(
    () => listContexts(),
    (error: unknown) => {
      assert.ok(error instanceof DockerDaemonError, "expected a DockerDaemonError");
      assert.equal(error.code, "DaemonRejected");
      assert.match(error.message, /docker: command not usable/);
      return true;
    },
  );
});

// contexts-service.md — "local -> the endpoint is the default Docker socket of the machine running
// the server; the operator supplies no path"
test("createContext with the local kind asks Docker for the machine's own default socket", async () => {
  handler = (args) =>
    args[1] === "create" ? { stdout: "", exitCode: 0 } : inventory([listEntry("fresh", "unix:///var/run/docker.sock")])(args);

  await createContext({ name: "fresh", kind: "local" });

  const platformDefault = defaultLocalSocket();
  assert.equal(platformDefault.kind, "unix");
  const socketPath = platformDefault.kind === "unix" ? platformDefault.socketPath : "";
  const created = argsOf("create").join(" ");
  assert.ok(created.includes(socketPath), `expected the default socket in: ${created}`);
});

// contexts-service.md — "ssh -> the endpoint is ssh://<host>, the destination as typed (user@host)"
test("createContext with the ssh kind asks Docker for ssh://<destination>", async () => {
  handler = (args) =>
    args[1] === "create" ? { stdout: "", exitCode: 0 } : inventory([listEntry("remote", "ssh://operator@build-host")])(args);

  await createContext({ name: "remote", kind: "ssh", host: "operator@build-host" });

  const created = argsOf("create").join(" ");
  assert.ok(created.includes("ssh://operator@build-host"), `expected the ssh endpoint in: ${created}`);
});

// contexts-service.md — "an ssh:// prefix the operator typed being accepted and not doubled"
test("createContext does not double an ssh:// prefix the operator typed", async () => {
  handler = (args) =>
    args[1] === "create" ? { stdout: "", exitCode: 0 } : inventory([listEntry("remote", "ssh://operator@build-host")])(args);

  await createContext({ name: "remote", kind: "ssh", host: "ssh://operator@build-host" });

  const created = argsOf("create").join(" ");
  assert.ok(!created.includes("ssh://ssh://"), `the ssh:// prefix was doubled: ${created}`);
  assert.ok(created.includes("ssh://operator@build-host"), `expected the ssh endpoint in: ${created}`);
});

// contexts-service.md — "Resolves with the created context's own summary"
test("createContext resolves with the created context's own summary", async () => {
  handler = (args) =>
    args[1] === "create" ? { stdout: "", exitCode: 0 } : inventory([listEntry("remote", "ssh://operator@build-host")])(args);

  const created = await createContext({ name: "remote", kind: "ssh", host: "operator@build-host" });

  assert.equal(created.name, "remote");
  assert.equal(created.kind, "ssh");
  assert.equal(created.endpoint, "ssh://operator@build-host");
});

// contexts-service.md — "Rejects with Docker's own message on a name collision or a refused endpoint"
test("createContext rejects with Docker's own message on a name collision", async () => {
  handler = (args) =>
    args[1] === "create"
      ? { stdout: "", stderr: 'context "dup" already exists', exitCode: 1 }
      : { stdout: "", exitCode: 0 };

  await assert.rejects(() => createContext({ name: "dup", kind: "local" }), /context "dup" already exists/);
});

// contexts-service.md — "removeContext ... Rejects with Docker's own message when the context cannot be removed"
test("removeContext rejects with Docker's own message when Docker refuses", async () => {
  handler = (args) =>
    args[1] === "rm" ? { stdout: "", stderr: 'context "default" cannot be removed', exitCode: 1 } : { stdout: "", exitCode: 0 };

  await assert.rejects(() => removeContext("default"), /context "default" cannot be removed/);
});

// contexts-service.md — "activateContext ... publishes its resolved endpoint to the Docker access
// layer, so the Engine API client and the daemon event stream re-establish against that daemon
// (REQ-93)" and "Resolves with the resulting summary (now active)"
test("activateContext publishes the newly active context's endpoint to the access layer", async () => {
  handler = (args) =>
    args[1] === "use"
      ? { stdout: "", exitCode: 0 }
      : inventory([listEntry("remote", "ssh://operator@build-host", { Current: true })])(args);

  const activated = await activateContext("remote");

  assert.equal(activated.name, "remote");
  assert.equal(activated.active, true);
  assert.deepEqual(resolveActiveEndpoint(), { kind: "ssh", destination: "operator@build-host" });
});

// contexts-service.md — "A TCP+TLS context is activated like any other: its TLS material, stored by
// Docker itself, is resolved and dialed"
test("activateContext publishes a TCP+TLS context's endpoint with the TLS material Docker stores for it", async () => {
  handler = (args) =>
    args[1] === "use"
      ? { stdout: "", exitCode: 0 }
      : inventory(
          [listEntry("secure", "tcp://198.51.100.7:2376", { Current: true })],
          [
            {
              Name: "secure",
              Endpoints: { docker: { Host: "tcp://198.51.100.7:2376" } },
              TLSMaterial: { docker: ["ca.pem", "cert.pem", "key.pem"] },
              Storage: { TLSPath: "/home/operator/.docker/contexts/tls/abc" },
            },
          ],
        )(args);

  const activated = await activateContext("secure");

  assert.equal(activated.tls, true);
  const endpoint = resolveActiveEndpoint();
  assert.equal(endpoint.kind, "tcp");
  assert.ok(endpoint.kind === "tcp" && endpoint.tls, "a TCP+TLS context must be dialed with its TLS material");
});

// contexts-service.md — "publishActiveEndpoint ... Points the Docker access layer at the currently
// active context"
test("publishActiveEndpoint points the access layer at the currently active context", async () => {
  handler = inventory([
    listEntry("idle", "unix:///var/run/docker.sock"),
    listEntry("remote", "ssh://operator@build-host", { Current: true }),
  ]);

  await publishActiveEndpoint();

  assert.deepEqual(resolveActiveEndpoint(), { kind: "ssh", destination: "operator@build-host" });
});

// contexts-service.md — "Never rejects: when the contexts cannot be read at all ... the access layer
// keeps the endpoint it already had"
test("publishActiveEndpoint never rejects and keeps the endpoint already published when the contexts cannot be read", async () => {
  setActiveEndpoint({ kind: "ssh", destination: "operator@previous-host" });
  handler = () => ({ stdout: "", stderr: "docker: command not found", exitCode: 127 });

  await publishActiveEndpoint();

  assert.deepEqual(resolveActiveEndpoint(), { kind: "ssh", destination: "operator@previous-host" });
});
