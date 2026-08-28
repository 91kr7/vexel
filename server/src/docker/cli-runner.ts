// Local CLI runner for `docker`, `docker compose` and `docker buildx`:
// presence/version detection, and running a command against the active
// context with streamed stdout/stderr, exit code and cancellation.
import { spawn } from "node:child_process";
import { logCliCall } from "./call-log.js";
import { isExplicitEndpoint } from "./endpoint.js";
import type { DockerEndpoint } from "./types.js";

export interface CliToolStatus {
  available: boolean;
  version?: string;
}

export interface CliAvailability {
  docker: CliToolStatus;
  compose: CliToolStatus;
  buildx: CliToolStatus;
}

export interface CliRunResult {
  exitCode: number | null;
}

export interface CliRunHandle {
  cancel: () => void;
  onStdout: (listener: (chunk: string) => void) => void;
  onStderr: (listener: (chunk: string) => void) => void;
  /** Fires when the process itself could not be spawned (e.g. the binary went missing); `done` never resolves in that case. */
  onSpawnError: (listener: (message: string) => void) => void;
  done: Promise<CliRunResult>;
}

// Nothing can install or remove a CLI while the server runs, so the probe is
// kept for the process's lifetime (plan-docker_management_app-refresh_cache/REQ-1).
let cliAvailability: Promise<CliAvailability> | undefined;

export async function detectCliAvailability(): Promise<CliAvailability> {
  cliAvailability ??= probeCliAvailability();
  return cliAvailability;
}

/** Test seam: discards the remembered probe, which the process itself never does. */
export function resetCliAvailabilityCache(): void {
  cliAvailability = undefined;
}

async function probeCliAvailability(): Promise<CliAvailability> {
  const [docker, compose, buildx] = await Promise.all([
    detect("docker", ["--version"]),
    detect("docker", ["compose", "version"]),
    detect("docker", ["buildx", "version"]),
  ]);
  return { docker, compose, buildx };
}

export interface CliRunOptions {
  /**
   * Written to the child's standard input, which is then closed. Given even as
   * an empty string, it closes stdin — the way to hand a command a value that
   * must not appear in `argv` (a secret on `--password-stdin`), and to stop a
   * command that reads stdin from waiting on one that will never come.
   */
  stdin?: string;
}

/**
 * How a cancel escalates, in milliseconds after the first SIGTERM. The repeat
 * exists because the `docker` wrapper swallows a signal that lands before it
 * has spawned its cli-plugin child (`docker-compose`, `docker-buildx`): the
 * plugin is then spawned regardless and the command runs to completion, so a
 * single signal loses the cancel entirely for the few hundred milliseconds of
 * that startup window. By the repeat the tree is up and honors the signal; the
 * SIGKILL is the backstop for a child that honors nothing.
 */
const CANCEL_ESCALATION: ReadonlyArray<{ afterMs: number; signal: NodeJS.Signals }> = [
  { afterMs: 500, signal: "SIGTERM" },
  { afterMs: 2000, signal: "SIGKILL" },
];

/** Runs `command args...` against the active context; output streams as it is produced. */
export function runCliCommand(command: string, args: string[], endpoint: DockerEndpoint, options: CliRunOptions = {}): CliRunHandle {
  // Before the process exists. `options.stdin` is deliberately not passed on:
  // it is the channel a secret travels on, and the log never carries one.
  logCliCall(command, args, endpoint);
  // Detached so the child leads a process group of its own: a cancel signals
  // that whole group — the `docker` wrapper *and* the cli-plugin it spawns —
  // and the group can never be the server's own, whatever it was started from.
  const child = spawn(command, args, { env: cliEnv(endpoint), detached: true });
  if (options.stdin !== undefined) {
    // A write error here (the child exited before reading) is not the caller's
    // concern: the exit code and stderr already say what happened.
    child.stdin.on("error", () => undefined);
    child.stdin.end(options.stdin);
  }
  const stdoutListeners: Array<(chunk: string) => void> = [];
  const stderrListeners: Array<(chunk: string) => void> = [];
  const spawnErrorListeners: Array<(message: string) => void> = [];

  child.stdout.on("data", (chunk: Buffer) => stdoutListeners.forEach((listener) => listener(chunk.toString())));
  child.stderr.on("data", (chunk: Buffer) => stderrListeners.forEach((listener) => listener(chunk.toString())));

  // Once the process is gone its pid can be reissued to somebody else's, so a
  // cancel arriving late sends nothing and any pending escalation is dropped.
  let gone = false;
  const escalations: NodeJS.Timeout[] = [];
  const settle = () => {
    gone = true;
    for (const timer of escalations) clearTimeout(timer);
  };

  // A dedicated listener keeps Node from throwing on an unhandled 'error' event (e.g. the binary went missing mid-run).
  child.on("error", (error) => {
    settle();
    spawnErrorListeners.forEach((listener) => listener(error.message));
  });

  const done = new Promise<CliRunResult>((resolve) => {
    child.once("close", (code) => {
      settle();
      resolve({ exitCode: code });
    });
  });

  const signalGroup = (signal: NodeJS.Signals) => {
    if (gone || child.pid === undefined) return;
    // A negative pid addresses the child's own process group. Throwing here
    // means the group emptied since the check above — the outcome a cancel
    // wants, not a failure.
    try {
      process.kill(-child.pid, signal);
    } catch {
      // Already gone.
    }
  };

  return {
    cancel: () => {
      if (gone || escalations.length > 0) return;
      signalGroup("SIGTERM");
      for (const step of CANCEL_ESCALATION) {
        const timer = setTimeout(() => signalGroup(step.signal), step.afterMs);
        timer.unref();
        escalations.push(timer);
      }
    },
    onStdout: (listener) => stdoutListeners.push(listener),
    onStderr: (listener) => stderrListeners.push(listener),
    onSpawnError: (listener) => spawnErrorListeners.push(listener),
    done,
  };
}

async function detect(command: string, args: string[]): Promise<CliToolStatus> {
  try {
    const { stdout, exitCode } = await runOnce(command, args);
    if (exitCode !== 0) return { available: false };
    return { available: true, version: extractVersion(stdout) };
  } catch {
    return { available: false };
  }
}

function runOnce(command: string, args: string[]): Promise<{ stdout: string; exitCode: number }> {
  // No endpoint: the probe asks the binary about itself and dials no daemon.
  logCliCall(command, args);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.once("error", reject);
    child.once("close", (code) => resolve({ stdout, exitCode: code ?? 1 }));
  });
}

function extractVersion(output: string): string {
  const match = output.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : (output.trim().split("\n")[0] ?? "unknown");
}

function endpointToCliEnv(endpoint: DockerEndpoint): Record<string, string> {
  if (endpoint.kind === "unix") return { DOCKER_HOST: `unix://${endpoint.socketPath}` };
  if (endpoint.kind === "tcp") return { DOCKER_HOST: `tcp://${endpoint.host}:${endpoint.port}` };
  return { DOCKER_HOST: `ssh://${endpoint.destination}` };
}

/**
 * The environment a spawned CLI process runs with. When the operator has not
 * set `DOCKER_HOST` themselves, the parent's own environment is passed through
 * unchanged rather than forcing one derived from the assumed default socket:
 * that lets `docker`/`buildx` resolve the active Docker context exactly as a
 * bare terminal invocation would (`~/.docker/config.json`'s current context),
 * which matters for tools that key local state on that resolved identity
 * (e.g. buildx's current-builder file) rather than on the dialed socket path.
 */
function cliEnv(endpoint: DockerEndpoint): NodeJS.ProcessEnv {
  if (!isExplicitEndpoint()) return process.env;
  return { ...process.env, ...endpointToCliEnv(endpoint) };
}
