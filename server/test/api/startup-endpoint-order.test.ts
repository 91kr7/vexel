import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { connect, createServer } from "node:net";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileAsync } from "../support/docker-cli.js";

// The startup order of the delivered process: the active Docker endpoint is
// resolved and set before the port opens, and the port opens whatever the
// daemon does. REQ ids belong to plan-docker_management_app-refresh_cache:
// REQ-24, REQ-27, REQ-29.
//
// Every case here starts the entrypoint as a **fresh process**, because that is
// what the requirement is about: an application started in-process by the other
// api files has already had its endpoint published by the time a test asks it
// anything.

const RUN_ID = `${process.pid}-${Date.now()}`;
const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const entrypoint = join(serverDir, "src", "index.ts");
// Resolved from this file rather than passed as a bare name: the child is
// spawned with an environment of its own and must not depend on a lookup.
const typescriptLoader = import.meta.resolve("tsx");

const temporaryDirs: string[] = [];

async function makeTemporaryDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirs.push(dir);
  return dir;
}

/** A port nothing is listening on: for binding a process, or for naming a daemon that cannot be reached. */
function findFreePort(): Promise<number> {
  return new Promise((resolvePort) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolvePort(port));
    });
  });
}

/**
 * Whether the port accepts a connection — the readiness probe of this file, on
 * purpose. An HTTP probe would be a request the process had already answered,
 * and the case below contracts that the *first* request it ever receives is
 * answered.
 */
function portAccepts(port: number): Promise<boolean> {
  return new Promise((settle) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      settle(true);
    });
    socket.once("error", () => {
      socket.destroy();
      settle(false);
    });
  });
}

interface StartedProcess {
  origin: string;
  port: number;
  /** When the port first accepted a connection (epoch ms). */
  openedAt: number;
  output: () => string;
  stop: () => Promise<void>;
}

/** Starts the server's own entrypoint as the operator's command does, with an environment of its own. */
async function startServerProcess(options: {
  env?: NodeJS.ProcessEnv;
  readyWithinMs?: number;
}): Promise<StartedProcess> {
  const port = await findFreePort();
  const dataDir = await makeTemporaryDir("vexel-startup-order-data-");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    VEXEL_DATA_DIR: dataDir,
    ...options.env,
  };
  delete env.VEXEL_CLIENT_DIST;
  for (const [name, value] of Object.entries(options.env ?? {})) {
    if (value === undefined) delete env[name];
  }

  const child = spawn(
    process.execPath,
    ["--import", typescriptLoader, entrypoint],
    { cwd: serverDir, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => (output += chunk));
  child.stderr.on("data", (chunk: string) => (output += chunk));

  const stop = async (): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGKILL");
    await new Promise((exited) => child.once("exit", exited));
  };

  const deadline = Date.now() + (options.readyWithinMs ?? 60_000);
  for (;;) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`the server process exited before opening its port:\n${output}`);
    }
    if (await portAccepts(port)) break;
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`the server process never opened its port:\n${output}`);
    }
    await new Promise((waiting) => setTimeout(waiting, 25));
  }

  return { origin: `http://127.0.0.1:${port}`, port, openedAt: Date.now(), output: () => output, stop };
}

/** The endpoint of the context the operator has active, so a fixture context can point at a daemon that answers. */
async function activeContextHost(): Promise<string> {
  const { stdout } = await execFileAsync("docker", [
    "context",
    "inspect",
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]);
  return stdout.trim();
}

/** The socket the platform defaults to when no context is published — what a differing context must differ from. */
const PLATFORM_DEFAULT_HOST = process.platform === "win32" ? "npipe:////./pipe/docker_engine" : "unix:///var/run/docker.sock";

async function removeContextQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["context", "rm", "-f", name]).catch(() => undefined);
}

/**
 * A Docker context whose endpoint reaches the same daemon under a **different
 * value** from the platform default: the machine the defect appears on. The
 * path is a symlink to the operator's own socket, so the daemon answers and the
 * value is provably not the default one.
 */
async function createDifferingContext(caseName: string): Promise<{ name: string; host: string }> {
  const name = `vexel-test-ctx-startup-${caseName}-${RUN_ID}`;
  const host = await activeContextHost();
  let endpoint = host;
  if (host.startsWith("unix://")) {
    const dir = await makeTemporaryDir("vexel-startup-order-socket-");
    await symlink(host.slice("unix://".length), join(dir, "docker.sock"));
    endpoint = `unix://${join(dir, "docker.sock")}`;
  }
  await execFileAsync("docker", ["context", "create", name, "--docker", `host=${endpoint}`]);
  return { name, host: endpoint };
}

/**
 * A `docker` earlier on the child's PATH that takes its time. Every invocation
 * waits, then runs the real one and records when it ended, so a case can compare
 * the moment the port opened with the moment the context resolution finished.
 */
async function installSlowDocker(delaySeconds: number): Promise<{ dir: string; log: string }> {
  const dir = await makeTemporaryDir("vexel-startup-order-slow-docker-");
  const log = join(dir, "invocations.log");
  const { stdout } = await execFileAsync("/bin/sh", ["-c", "command -v docker"]);
  const realDocker = stdout.trim();
  const script = [
    "#!/bin/sh",
    `sleep ${delaySeconds}`,
    `'${realDocker}' "$@"`,
    "status=$?",
    `'${process.execPath}' -e 'require("fs").appendFileSync(process.argv[1], Date.now() + " " + process.argv.slice(2).join(" ") + "\\n")' '${log}' "$@"`,
    "exit $status",
    "",
  ].join("\n");
  await writeFile(join(dir, "docker"), script, "utf8");
  await chmod(join(dir, "docker"), 0o755);
  return { dir, log };
}

/**
 * A `docker` that never answers, which is what an unreachable daemon does to
 * the context resolution. It carries a marker in its own command line so the
 * case can end it, whatever the server process does.
 */
async function installHangingDocker(marker: string): Promise<string> {
  const dir = await makeTemporaryDir("vexel-startup-order-hanging-docker-");
  const script = [
    "#!/bin/sh",
    `exec '${process.execPath}' -e 'setTimeout(() => undefined, 120000)' ${marker}`,
    "",
  ].join("\n");
  await writeFile(join(dir, "docker"), script, "utf8");
  await chmod(join(dir, "docker"), 0o755);
  return dir;
}

async function killByMarker(marker: string): Promise<void> {
  await execFileAsync("/usr/bin/pkill", ["-f", marker]).catch(() => undefined);
}

after(async () => {
  const { stdout } = await execFileAsync("docker", ["context", "ls", "--format", "{{.Name}}"]).catch(() => ({ stdout: "" }));
  for (const name of stdout.split("\n").filter((entry) => entry.startsWith("vexel-test-ctx-startup-"))) {
    await removeContextQuietly(name);
  }
  for (const dir of temporaryDirs) await rm(dir, { recursive: true, force: true });
});

// REQ-24, REQ-27 — a fresh process whose active context is not the platform
// default answers the very first list request it ever receives, rather than
// reporting that the value could not be read.
test("the first request a fresh process ever receives is answered, on a non-default active context", async () => {
  const context = await createDifferingContext("first-request");
  assert.notEqual(context.host, PLATFORM_DEFAULT_HOST, "the fixture context does not differ from the platform default");
  let server: StartedProcess | undefined;
  try {
    server = await startServerProcess({ env: { DOCKER_CONTEXT: context.name, DOCKER_HOST: undefined } });

    // The first request the process has been asked anything at all.
    const listing = await fetch(`${server.origin}/api/containers`);
    const body = await listing.text();
    assert.equal(listing.status, 200, `the first list request was refused with ${body}\n${server.output()}`);
    assert.ok(Array.isArray(JSON.parse(body)), "the first list request did not answer with a listing");

    // The arrangement is the one the requirement is about: that context, and
    // not the platform default, is what the process resolved.
    const contexts = (await (await fetch(`${server.origin}/api/contexts`)).json()) as { name: string; active: boolean }[];
    const active = contexts.find((entry) => entry.active);
    assert.equal(active?.name, context.name, "the process did not run on the fixture context");
  } finally {
    await server?.stop();
    await removeContextQuietly(context.name);
  }
});

// REQ-24 — the port is not opened until the resolution has ended: the process
// accepts nothing while it is still pending. Driven with a `docker` that takes
// a second, so the two moments are far apart and the order is not read off a
// coincidence.
test("the port is not opened until the active endpoint has been resolved", async () => {
  const slow = await installSlowDocker(1);
  let server: StartedProcess | undefined;
  try {
    server = await startServerProcess({
      env: { PATH: `${slow.dir}:${process.env.PATH ?? ""}`, DOCKER_HOST: undefined },
    });

    const invocations = await readFile(slow.log, "utf8").catch(() => "");
    const resolution = invocations
      .split("\n")
      .filter((line) => line.includes("context ls"))
      .map((line) => Number(line.split(" ")[0]));
    assert.ok(
      resolution.length > 0,
      `the port was accepting connections while the context resolution had not even run:\n${invocations}\n${server.output()}`,
    );
    assert.ok(
      server.openedAt >= resolution[0],
      `the port accepted a connection ${resolution[0] - server.openedAt} ms before the context resolution ended`,
    );

    const listing = await fetch(`${server.origin}/api/containers`);
    assert.equal(listing.status, 200, `the first list request was refused:\n${server.output()}`);
  } finally {
    await server?.stop();
  }
});

// REQ-29 — a daemon that cannot be reached does not stop the process from
// serving: the port opens, `/health` answers, and the endpoints that need the
// daemon report its failure the way they do once the server is running.
test("a daemon that cannot be reached still leaves a listening port that reports the failure", async () => {
  const deadPort = await findFreePort();
  let server: StartedProcess | undefined;
  try {
    server = await startServerProcess({ env: { DOCKER_HOST: `tcp://127.0.0.1:${deadPort}` } });

    const health = await fetch(`${server.origin}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const listing = await fetch(`${server.origin}/api/containers`);
    assert.equal(listing.status, 502, `expected the daemon's failure to be served:\n${server.output()}`);
    const failure = (await listing.json()) as { error?: string };
    assert.equal(typeof failure.error, "string");
    assert.notEqual(failure.error, "");
  } finally {
    await server?.stop();
  }
});

// REQ-29 — the other half of the same rule: a resolution that never answers is
// not a place the startup can hang. The port opens while that resolution is
// still pending.
test("a context resolution that never answers still leaves a listening port", async () => {
  const marker = `vexel-hanging-docker-${RUN_ID}`;
  const hangingDir = await installHangingDocker(marker);
  let server: StartedProcess | undefined;
  try {
    server = await startServerProcess({
      env: { PATH: `${hangingDir}:${process.env.PATH ?? ""}`, DOCKER_HOST: undefined },
      // Well under the two minutes the fake `docker` waits: a startup that
      // waited for it would not be answering here.
      readyWithinMs: 30_000,
    });

    const health = await fetch(`${server.origin}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
  } finally {
    await server?.stop();
    await killByMarker(marker);
  }
});
