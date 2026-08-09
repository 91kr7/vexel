// Daemon plugin management over the Engine API (REQ-111): reading the
// privileges a reference asks for, installing it once those privileges have
// been granted, enabling, disabling and removing.
//
// A plugin runs on the host with the mounts, devices and capabilities it asked
// for, so installing one is a security decision, not a download: the
// privileges are read first and the install refuses to proceed unless the
// caller hands back exactly the set the daemon asked for (REQ-99). That check
// lives here, on the server, so no future caller can install a plugin by
// skipping the review.
import type { IncomingMessage } from "node:http";
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { DockerDaemonError } from "../docker/errors.js";
import { getDaemonPlugin, listDaemonPlugins, pluginPathSegment, type DaemonPlugin } from "./daemon-plugins-service.js";

export interface PluginPrivilege {
  /** What is being asked for: `network`, `mount`, `device`, `capabilities`, … */
  name: string;
  description?: string;
  /** The exact value(s) asked for; sometimes empty, which is itself the request. */
  values: string[];
}

export interface InstallPluginInput {
  /** The reference to install from, e.g. `vieux/sshfs:latest`. */
  remote: string;
  /** The name to install it under; the reference's own name when omitted. */
  alias?: string;
  /** The privileges the human reviewed and granted; must match the ones the daemon asks for. */
  grantedPrivileges: PluginPrivilege[];
  /** Enable it once installed, as `docker plugin install` does; `false` leaves it installed and disabled. */
  enable?: boolean;
}

interface RawPrivilege {
  Name?: string;
  Description?: string;
  Value?: string[] | null;
}

export async function getPluginPrivileges(remote: string): Promise<PluginPrivilege[]> {
  const response = await getEngineClient().request(`/plugins/privileges?remote=${encodeURIComponent(remote)}`);
  const raw = JSON.parse(response.body) as RawPrivilege[] | null;
  if (!Array.isArray(raw)) return [];
  return raw.map((privilege) => ({
    name: privilege.Name ?? "",
    description: privilege.Description && privilege.Description !== "" ? privilege.Description : undefined,
    values: (privilege.Value ?? []).filter((value): value is string => typeof value === "string"),
  }));
}

export async function installPlugin(input: InstallPluginInput): Promise<DaemonPlugin> {
  const requested = await getPluginPrivileges(input.remote);
  if (!grantMatches(requested, input.grantedPrivileges)) {
    throw new DockerDaemonError(
      "DaemonRejected",
      `The privileges granted for ${input.remote} are not the ones it asks for. Review them again: nothing has been installed.`,
      undefined,
      409,
    );
  }

  const query = new URLSearchParams({ remote: input.remote });
  if (input.alias !== undefined && input.alias !== "") query.set("name", input.alias);
  // What travels back to the daemon is the set it just asked for, rebuilt from
  // its own answer: the granted list is the proof of the decision, never the
  // payload, so a caller cannot widen a privilege on its way through.
  const stream = await getEngineClient().requestStream(`/plugins/pull?${query.toString()}`, {
    method: "POST",
    body: JSON.stringify(requested.map(toRawPrivilege)),
  });
  await drainProgressStream(stream);

  const name = await resolveInstalledName(input.remote, input.alias);
  if (input.enable !== false) return enablePlugin(name);
  return getDaemonPlugin(name);
}

export async function enablePlugin(name: string): Promise<DaemonPlugin> {
  // `timeout=0` waits as long as the plugin's own handshake takes; a shorter
  // one would report a failure for a plugin that is merely slow to come up.
  await getEngineClient().request(`/plugins/${pluginPathSegment(name)}/enable?timeout=0`, { method: "POST" });
  return getDaemonPlugin(name);
}

export async function disablePlugin(name: string): Promise<DaemonPlugin> {
  await getEngineClient().request(`/plugins/${pluginPathSegment(name)}/disable`, { method: "POST" });
  return getDaemonPlugin(name);
}

/**
 * Removes the plugin. Nothing is forced: an enabled plugin may be driving live
 * containers, so the daemon's refusal is passed on as it is rather than
 * overridden on the operator's behalf.
 */
export async function removePlugin(name: string): Promise<void> {
  await getEngineClient().request(`/plugins/${pluginPathSegment(name)}?force=false`, { method: "DELETE" });
}

function toRawPrivilege(privilege: PluginPrivilege): RawPrivilege {
  return { Name: privilege.name, Description: privilege.description ?? "", Value: privilege.values };
}

/** The granted set must cover the asked-for set exactly: same privileges, same values, nothing added, nothing dropped. */
function grantMatches(requested: PluginPrivilege[], granted: PluginPrivilege[]): boolean {
  if (!Array.isArray(granted) || requested.length !== granted.length) return false;
  const remaining = granted.map(fingerprint);
  for (const privilege of requested) {
    const index = remaining.indexOf(fingerprint(privilege));
    if (index === -1) return false;
    remaining.splice(index, 1);
  }
  return true;
}

function fingerprint(privilege: PluginPrivilege): string {
  // Joined on separators no privilege value carries, so `["ab"]` and
  // `["a", "b"]` never fingerprint alike.
  return [privilege.name, ...(privilege.values ?? [])].join("\u0000");
}

/**
 * The name the daemon filed the plugin under: it normalizes a reference (a
 * missing tag becomes `:latest`), so the installed plugin is looked up in the
 * daemon's own listing rather than guessed from the reference.
 */
async function resolveInstalledName(remote: string, alias: string | undefined): Promise<string> {
  const wanted = alias !== undefined && alias !== "" ? alias : remote;
  const tagged = wanted.includes(":") ? wanted : `${wanted}:latest`;
  const { items } = await listDaemonPlugins();
  const match =
    items.find((plugin) => plugin.name === wanted || plugin.name === tagged) ??
    items.find((plugin) => plugin.reference === remote || plugin.reference?.endsWith(`/${tagged}`) || plugin.reference === tagged);
  if (!match) {
    throw new DockerDaemonError("DaemonRejected", `${remote} was pulled, but the daemon does not list a plugin for it.`, undefined, 502);
  }
  return match.name;
}

/**
 * A plugin pull answers with the same newline-delimited progress stream an
 * image pull does. Nothing here reports progress to the client, but the stream
 * still has to be read to its end — that is when the pull is done — and an
 * error line in it is the failure itself, not a detail.
 */
function drainProgressStream(stream: IncomingMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    let pending = "";
    let failure: string | undefined;

    const readLine = (line: string) => {
      if (line.trim() === "") return;
      try {
        const entry = JSON.parse(line) as { error?: string };
        if (typeof entry.error === "string" && entry.error !== "") failure = entry.error;
      } catch {
        // A line that is not JSON says nothing about success or failure; the
        // exit of the stream, and any error line in it, do.
      }
    };

    stream.on("data", (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      lines.forEach(readLine);
    });
    stream.on("error", (error: Error) => reject(new DockerDaemonError("DaemonRejected", error.message)));
    stream.on("end", () => {
      readLine(pending);
      if (failure !== undefined) {
        reject(new DockerDaemonError("DaemonRejected", failure));
        return;
      }
      resolve();
    });
  });
}
