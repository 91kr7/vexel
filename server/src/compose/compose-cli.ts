// Shared helpers for running `docker compose` through the CLI channel and
// buffering/parsing its JSON output. Internal to the compose module: every
// sibling service file goes through here rather than spawning on its own.
import { runCliCommand } from "../docker/cli-runner.js";
import { resolveActiveEndpoint } from "../docker/endpoint.js";
import { DockerDaemonError } from "../docker/errors.js";

/** Runs `docker compose <args>`, buffers its output and parses it as a single JSON value (e.g. `docker compose config`, which always emits one object). Rejects with the daemon's own stderr message on a non-zero exit, a spawn failure, or malformed output. */
export async function runComposeJson<T>(args: string[]): Promise<T> {
  const output = await runComposeCapture(args);
  return JSON.parse(output.trim() || "{}") as T;
}

/**
 * Runs `docker compose <args>`, buffers its output and parses it as a JSON
 * array. `docker compose ls`/`ps` emit newline-delimited JSON — one object
 * per line — except when there is exactly one entry, in which case the whole
 * output is that one JSON object with no surrounding array; some CLI
 * versions instead emit a single JSON array on one line. All three shapes
 * are normalized here. Rejects with the daemon's own stderr message on a
 * non-zero exit, a spawn failure, or malformed output.
 */
export async function runComposeJsonArray<T>(args: string[]): Promise<T[]> {
  const output = await runComposeCapture(args);
  return parseJsonArray<T>(output);
}

/** Runs `docker compose <args>` to completion, resolving with its full stdout. */
export function runComposeCapture(args: string[]): Promise<string> {
  const handle = runCliCommand("docker", ["compose", ...args], resolveActiveEndpoint());
  let stdout = "";
  let stderr = "";
  let spawnError: string | undefined;
  handle.onStdout((chunk) => (stdout += chunk));
  handle.onStderr((chunk) => (stderr += chunk));
  handle.onSpawnError((message) => (spawnError = message));

  return handle.done.then(({ exitCode }) => {
    if (spawnError) throw new DockerDaemonError("DaemonRejected", spawnError);
    if (exitCode !== 0) throw new DockerDaemonError("DaemonRejected", stderr.trim() || `docker compose exited with code ${exitCode}`);
    return stdout;
  });
}

function parseJsonArray<T>(output: string): T[] {
  const lines = output
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0) return [];
  if (lines.length > 1) {
    // More than one line: genuine newline-delimited JSON, one object per line.
    return lines.map((line) => JSON.parse(line) as T);
  }
  // A single line: either a JSON array, or one bare NDJSON object (the
  // single-entry case, indistinguishable from a lone valid JSON object).
  const parsed = JSON.parse(lines[0]) as T | T[];
  return Array.isArray(parsed) ? parsed : [parsed];
}
