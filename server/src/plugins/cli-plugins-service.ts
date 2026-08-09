// CLI plugin inventory of the local Docker installation (REQ-98): every
// `docker <name>` sub-command shipped as a plugin, with the version and the
// availability the installation itself reports.
//
// The source is `docker info`'s own client-side plugin inventory, which is the
// only place the installation lists them: `docker plugin ls` is the daemon's
// managed plugins, an unrelated set (REQ-99). The reading is deliberately
// client-side only, so it still answers while the daemon is unreachable.
import { runCliCommand } from "../docker/cli-runner.js";
import { resolveActiveEndpoint } from "../docker/endpoint.js";

/**
 * A reading that may legitimately have nothing to show: `unavailableReason`
 * carries why, in the installation's or the daemon's own words, so the screen
 * can say it instead of showing an empty list that looks like an answer.
 */
export interface PluginListing<T> {
  items: T[];
  unavailableReason?: string;
}

/**
 * `enabled` — the installation runs it and advertises it; `available` — it is
 * installed and runnable but not advertised in `docker --help` (Docker's own
 * "hidden" flag); `unavailable` — the installation found it and refuses to run
 * it, with the reason attached.
 */
export type CliPluginAvailability = "enabled" | "available" | "unavailable";

export interface CliPlugin {
  /** The plugin's own name, as `docker <name>` invokes it. */
  name: string;
  /** The full invocation, e.g. `docker compose`. */
  command: string;
  /** Absent when the installation reports no version for it. */
  version?: string;
  vendor?: string;
  description?: string;
  path?: string;
  availability: CliPluginAvailability;
  /** Why the installation will not run it; only ever set on `unavailable`. */
  unavailableReason?: string;
}

interface RawCliPlugin {
  Name?: string;
  Path?: string;
  Vendor?: string;
  Version?: string;
  ShortDescription?: string;
  Hidden?: boolean;
  /** Docker reports a plugin it refuses to run with this field; its shape has varied across CLI versions. */
  Err?: unknown;
}

export async function listCliPlugins(): Promise<PluginListing<CliPlugin>> {
  let output: string;
  try {
    output = await runDockerCapture(["info", "--format", "{{json .ClientInfo}}"]);
  } catch (error) {
    return { items: [], unavailableReason: `The local Docker installation did not report its CLI plugins: ${(error as Error).message}` };
  }

  let clientInfo: { Plugins?: RawCliPlugin[] | null };
  try {
    clientInfo = JSON.parse(output.trim() === "" ? "{}" : output) as { Plugins?: RawCliPlugin[] | null };
  } catch {
    return { items: [], unavailableReason: "The local Docker installation answered with something other than its client information." };
  }
  if (!Array.isArray(clientInfo.Plugins)) {
    return { items: [], unavailableReason: "This Docker installation does not expose a CLI plugin inventory." };
  }

  return { items: clientInfo.Plugins.map(toCliPlugin).sort((a, b) => a.name.localeCompare(b.name)) };
}

function toCliPlugin(raw: RawCliPlugin): CliPlugin {
  const name = raw.Name ?? "";
  const unavailableReason = failureMessage(raw.Err);
  return {
    name,
    command: `docker ${name}`,
    version: nonEmpty(raw.Version),
    vendor: nonEmpty(raw.Vendor),
    description: nonEmpty(raw.ShortDescription),
    path: nonEmpty(raw.Path),
    availability: unavailableReason ? "unavailable" : raw.Hidden === true ? "available" : "enabled",
    unavailableReason,
  };
}

/** Docker has reported a broken plugin as a plain string and as an object; neither shape may be lost. */
function failureMessage(error: unknown): string | undefined {
  if (typeof error === "string") return nonEmpty(error);
  if (error !== null && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return nonEmpty(message) ?? "The Docker installation refuses to run this plugin.";
    return "The Docker installation refuses to run this plugin.";
  }
  return undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

/**
 * Runs `docker <args>` to completion, resolving with its full stdout. Internal
 * to this module: the CLI plugin inventory is the one thing here that lives in
 * the local Docker installation rather than in the daemon.
 */
function runDockerCapture(args: string[]): Promise<string> {
  const handle = runCliCommand("docker", args, resolveActiveEndpoint(), { stdin: "" });
  let stdout = "";
  let stderr = "";
  let spawnError: string | undefined;
  handle.onStdout((chunk) => (stdout += chunk));
  handle.onStderr((chunk) => (stderr += chunk));
  handle.onSpawnError((message) => (spawnError = message));

  return handle.done.then(({ exitCode }) => {
    if (spawnError !== undefined) throw new Error(spawnError);
    if (exitCode !== 0) throw new Error(stderr.trim() || `docker exited with code ${exitCode}`);
    return stdout;
  });
}
