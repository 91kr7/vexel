// Shared helper for running `docker` through the CLI channel and buffering its
// output. Internal to the contexts module: context management lives in the
// local Docker configuration, which only the CLI owns.
import { runCliCommand } from "../docker/cli-runner.js";
import { resolveActiveEndpoint } from "../docker/endpoint.js";
import { DockerDaemonError } from "../docker/errors.js";

/** Runs `docker <args>` to completion, resolving with its full stdout. */
export function runDockerCapture(args: string[]): Promise<string> {
  const handle = runCliCommand("docker", args, resolveActiveEndpoint());
  let stdout = "";
  let stderr = "";
  let spawnError: string | undefined;
  handle.onStdout((chunk) => (stdout += chunk));
  handle.onStderr((chunk) => (stderr += chunk));
  handle.onSpawnError((message) => (spawnError = message));

  return handle.done.then(({ exitCode }) => {
    if (spawnError) throw new DockerDaemonError("DaemonRejected", spawnError);
    if (exitCode !== 0) throw new DockerDaemonError("DaemonRejected", stderr.trim() || `docker exited with code ${exitCode}`);
    return stdout;
  });
}

/**
 * Runs `docker <args>` and parses its output as JSON documents: newline-
 * delimited objects (`docker context ls --format json`), a single bare object,
 * or one JSON array (`docker context inspect`).
 */
export async function runDockerJsonArray<T>(args: string[]): Promise<T[]> {
  const output = (await runDockerCapture(args)).trim();
  if (output === "") return [];
  if (output.startsWith("[")) return JSON.parse(output) as T[];
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as T);
}
