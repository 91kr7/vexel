/**
 * `GET /api/timing-scale` (`timing-scale/specs/timing-scale-endpoint.md`;
 * plan-docker_management_app-timing_scale/REQ-7), and the process-level half of
 * REQ-2.
 *
 * The browser has no environment to read, so what this endpoint must answer is
 * not "a number" but **the factor the answering process was started with**. That
 * is only observable from outside the process, so the two cases that matter run
 * the delivered entrypoint as the operator runs it, once with a factor of its own
 * and once with a value it must refuse. The in-process case covers the router
 * itself under whatever factor this pass carries.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { timingScaleRouter } from "../../src/timing/timing-routes.js";
import { buildApp, startApp } from "../support/fixtures.js";

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const entrypoint = join(serverDir, "src", "index.ts");
// Resolved from this file rather than passed as a bare name: the child is spawned
// with an environment of its own and must not depend on a lookup.
const typescriptLoader = import.meta.resolve("tsx");

/** The factor this pass started with, read the way the contract states it — not from the module under test. */
function configuredScale(): number {
  const raw = process.env.VEXEL_TIMING_SCALE?.trim();
  return raw === undefined || raw === "" ? 1 : Number(raw);
}

function findFreePort(): Promise<number> {
  return new Promise((settle) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => settle(port));
    });
  });
}

interface StartedProcess {
  origin: string;
  output: () => string;
  stop: () => Promise<void>;
}

/** Starts the server's own entrypoint with an environment of its own, and waits for it to answer. */
async function startServerProcess(scale: string, dataDir: string): Promise<StartedProcess> {
  const port = await findFreePort();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    VEXEL_DATA_DIR: dataDir,
    VEXEL_TIMING_SCALE: scale,
  };
  const child = spawn(process.execPath, ["--import", typescriptLoader, entrypoint], {
    cwd: serverDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
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

  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`the server process exited before answering:\n${output}`);
    }
    const answered = await fetch(`${origin}/health`).then((response) => response.ok).catch(() => false);
    if (answered) break;
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`the server process never answered on ${origin}:\n${output}`);
    }
    await new Promise((waiting) => setTimeout(waiting, 50));
  }
  return { origin, output: () => output, stop };
}

// REQ-7 — the router answers the factor in force, as JSON, asking the daemon nothing.
test("answers the factor this process is using", async () => {
  const app = await startApp(buildApp("/api/timing-scale", timingScaleRouter));
  try {
    const response = await fetch(`${app.url}/api/timing-scale`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { scale?: unknown };
    assert.equal(body.scale, configuredScale());
  } finally {
    await app.close();
  }
});

// REQ-7 — on the delivered process, at the delivered path: the answer is the
// factor *that* process was started with, not the one this pass runs at.
test("the delivered process answers the factor it was started with", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "vexel-timing-scale-endpoint-"));
  let server: StartedProcess | undefined;
  try {
    server = await startServerProcess("0.5", dataDir);
    const response = await fetch(`${server.origin}/api/timing-scale`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { scale?: unknown };
    assert.equal(body.scale, 0.5);
  } finally {
    await server?.stop();
    await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

// REQ-2 — a value the factor cannot be read from stops the process, and the
// operator is told which variable and which value.
test("a process given an unusable factor never starts, and says which value", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "vexel-timing-scale-refusal-"));
  try {
    const port = await findFreePort();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(port),
      VEXEL_DATA_DIR: dataDir,
      VEXEL_TIMING_SCALE: "02",
    };
    const child = spawn(process.execPath, ["--import", typescriptLoader, entrypoint], {
      cwd: serverDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (output += chunk));
    child.stderr.on("data", (chunk: string) => (output += chunk));
    const code = await new Promise<number | null>((settle) => child.once("close", settle));

    assert.notEqual(code, 0, `the process started on VEXEL_TIMING_SCALE=02:\n${output}`);
    assert.ok(output.includes("VEXEL_TIMING_SCALE"), `the refusal never names the variable:\n${output}`);
    assert.ok(output.includes("02"), `the refusal never names the value:\n${output}`);
    const answered = await fetch(`http://127.0.0.1:${port}/health`).then(() => true).catch(() => false);
    assert.equal(answered, false, "the refused process opened its port anyway");
  } finally {
    await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
