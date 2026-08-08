// Shared helpers for running `docker buildx` through the CLI channel and
// buffering/parsing its JSON output. Internal to the builders module: every
// sibling service file goes through here rather than spawning on its own.
import { runCliCommand } from "../docker/cli-runner.js";
import { resolveActiveEndpoint } from "../docker/endpoint.js";
import { DockerDaemonError } from "../docker/errors.js";

/** Runs `docker buildx <args>` to completion, resolving with its full stdout. */
export function runBuildxCapture(args: string[]): Promise<string> {
  const handle = runCliCommand("docker", ["buildx", ...args], resolveActiveEndpoint());
  let stdout = "";
  let stderr = "";
  let spawnError: string | undefined;
  handle.onStdout((chunk) => (stdout += chunk));
  handle.onStderr((chunk) => (stderr += chunk));
  handle.onSpawnError((message) => (spawnError = message));

  return handle.done.then(({ exitCode }) => {
    if (spawnError) throw new DockerDaemonError("DaemonRejected", spawnError);
    if (exitCode !== 0) throw new DockerDaemonError("DaemonRejected", stderr.trim() || `docker buildx exited with code ${exitCode}`);
    return stdout;
  });
}

/**
 * Runs `docker buildx <args>`, buffers its output and parses it as a JSON
 * array. `docker buildx ls`/`du` emit newline-delimited JSON — one object per
 * line — except when there is exactly one entry, in which case the whole
 * output is that one JSON object with no surrounding array; some CLI
 * versions instead emit a single JSON array on one line. All three shapes
 * are normalized here. Rejects with the daemon's own stderr message on a
 * non-zero exit, a spawn failure, or malformed output.
 */
export async function runBuildxJsonArray<T>(args: string[]): Promise<T[]> {
  const output = await runBuildxCapture(args);
  return parseJsonArray<T>(output);
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

/**
 * Parses a Go `units.HumanSize`-formatted value (e.g. `"780MB"`, `"4.096kB"`,
 * `"214B"`, decimal-based; the `KiB`/`MiB`/… binary forms are accepted too)
 * into a byte count. Throws on anything that does not match, rather than
 * silently reporting zero.
 */
export function parseHumanSize(value: string): number {
  const match = value.trim().match(/^([\d.]+)\s*([a-zA-Z]*)$/);
  if (!match) throw new Error(`Could not parse size "${value}"`);
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) throw new Error(`Could not parse size "${value}"`);
  const unit = match[2].toLowerCase();
  const multiplier = SIZE_MULTIPLIERS[unit];
  if (multiplier === undefined) throw new Error(`Unknown size unit "${match[2]}" in "${value}"`);
  return Math.round(amount * multiplier);
}

const SIZE_MULTIPLIERS: Record<string, number> = {
  b: 1,
  kb: 1000,
  kib: 1024,
  mb: 1000 ** 2,
  mib: 1024 ** 2,
  gb: 1000 ** 3,
  gib: 1024 ** 3,
  tb: 1000 ** 4,
  tib: 1024 ** 4,
  pb: 1000 ** 5,
  pib: 1024 ** 5,
};
