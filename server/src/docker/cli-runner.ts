// Local CLI runner for `docker`, `docker compose` and `docker buildx`:
// presence/version detection, and running a command against the active
// context with streamed stdout/stderr, exit code and cancellation.
import { spawn } from "node:child_process";
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

export async function detectCliAvailability(): Promise<CliAvailability> {
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

/** Runs `command args...` against the active context; output streams as it is produced. */
export function runCliCommand(command: string, args: string[], endpoint: DockerEndpoint, options: CliRunOptions = {}): CliRunHandle {
  const child = spawn(command, args, { env: cliEnv(endpoint) });
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
  // A dedicated listener keeps Node from throwing on an unhandled 'error' event (e.g. the binary went missing mid-run).
  child.on("error", (error) => spawnErrorListeners.forEach((listener) => listener(error.message)));

  const done = new Promise<CliRunResult>((resolve) => {
    child.once("close", (code) => resolve({ exitCode: code }));
  });

  return {
    cancel: () => child.kill(),
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
