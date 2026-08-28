// Docker context inventory and management (REQ-92, REQ-93): every context the
// local Docker configuration holds — whatever its endpoint kind — which one is
// active, plus create (local socket and SSH kinds), select-active and remove,
// all through the CLI channel, which is the only owner of that configuration.
//
// Creating a TCP+TLS context is deliberately absent (departure Three,
// 2026-08-07): it would need three certificate paths on the server's own
// filesystem. Support is not: a TCP+TLS context created outside the
// application is listed, selectable and dialed like any other.
import { join } from "node:path";
import { defaultLocalSocket, parseEndpointUrl, setActiveEndpoint } from "../docker/endpoint.js";
import { DockerDaemonError } from "../docker/errors.js";
import type { DockerEndpoint, TlsOptions } from "../docker/types.js";
import { byNameThenIdentity } from "../list-order/list-order.js";
import { registerRefreshKind } from "../refresh-cache/refresh-cache.js";
import { runDockerCapture, runDockerJsonArray } from "./docker-cli.js";

export type ContextEndpointKind = "local" | "ssh" | "tcp";

/** The endpoint kinds this application can create; the others are console-only. */
export type CreatableContextKind = "local" | "ssh";

export interface ContextSummary {
  name: string;
  description?: string;
  /** The endpoint URL exactly as Docker records it (`unix:///…`, `ssh://…`, `tcp://…`). */
  endpoint: string;
  kind: ContextEndpointKind;
  /** Whether the endpoint is secured by the TLS material the context carries. */
  tls: boolean;
  active: boolean;
  /** The failure Docker reports for a context it could not read; absent when there is none. */
  error?: string;
}

export interface CreateContextInput {
  name: string;
  kind: CreatableContextKind;
  /** SSH destination (`user@host`, optionally `ssh://`-prefixed); ignored by the local kind. */
  host?: string;
  description?: string;
}

interface RawContext {
  Name: string;
  Description?: string;
  DockerEndpoint?: string;
  Current?: boolean;
  Error?: string;
}

interface RawContextInspect {
  Name: string;
  Endpoints?: { docker?: { Host?: string } };
  TLSMaterial?: Record<string, string[]>;
  Storage?: { TLSPath?: string };
}

export async function listContexts(): Promise<ContextSummary[]> {
  const raw = await runDockerJsonArray<RawContext>(["context", "ls", "--format", "json"]);
  const tlsByName = await readTlsMaterial(raw.map((entry) => entry.Name));
  return raw
    .map((entry) => ({
      name: entry.Name,
      description: entry.Description ? entry.Description : undefined,
      endpoint: entry.DockerEndpoint ?? "",
      kind: endpointKind(entry.DockerEndpoint ?? ""),
      tls: tlsByName.get(entry.Name) !== undefined,
      active: entry.Current === true,
      error: entry.Error ? entry.Error : undefined,
    }))
    // A context has no identifier but its name, so the last comparison is that
    // same name compared exactly: it separates what the name comparison calls
    // equal (`Data` from `data`), and is not a no-op. The active context is
    // marked, never promoted.
    .sort(byNameThenIdentity({ name: (context) => context.name, identity: (context) => context.name }));
}

/**
 * The context inventory as the refresh cache keeps it (REQ-9, REQ-11, REQ-13).
 * No event type: a context changes only when the operator changes one, and the
 * routes that do say so. Five minutes is the period that covers a change made
 * with the `docker` CLI outside the application.
 *
 * This inventory is also what reports **which** context is active, so a switch
 * discards it like every other held value (REQ-16) and the next request reads
 * it again with the client waiting — the interface is never left without an
 * answer, and never shown the previous answer.
 */
export const contextListCache = registerRefreshKind({
  key: "contexts",
  periodMs: 300000,
  read: listContexts,
});

export async function createContext(input: CreateContextInput): Promise<ContextSummary> {
  const args = ["context", "create", input.name, "--docker", `host=${hostFor(input)}`];
  if (input.description) args.push("--description", input.description);
  await runDockerCapture(args);
  contextListCache.markChanged();
  return getContext(input.name);
}

/**
 * Makes `name` the active context: `docker context use` writes it to the local
 * Docker configuration — so the CLI channel follows by itself — and the
 * resolved endpoint is published to the Docker access layer, so the Engine API
 * client and the daemon event stream re-establish against it (REQ-93).
 */
export async function activateContext(name: string): Promise<ContextSummary> {
  await runDockerCapture(["context", "use", name]);
  const summary = await getContext(name);
  // After the endpoint is published, so the discard the switch triggers cannot
  // undo the mark (REQ-13, REQ-16).
  await publishActiveEndpoint();
  contextListCache.markChanged();
  return summary;
}

export async function removeContext(name: string): Promise<void> {
  await runDockerCapture(["context", "rm", name]);
  await publishActiveEndpoint();
  contextListCache.markChanged();
}

/**
 * Points the Docker access layer at the currently active context. Called at
 * startup and after any change to the inventory; a failure (no `docker` CLI,
 * unreadable configuration) leaves the previously resolved endpoint in place
 * rather than breaking every other area.
 */
export async function publishActiveEndpoint(): Promise<void> {
  try {
    setActiveEndpoint(await resolveActiveContextEndpoint());
  } catch {
    // The contexts of the local installation could not be read; the access
    // layer keeps the endpoint it already had (DOCKER_HOST or the default).
  }
}

async function resolveActiveContextEndpoint(): Promise<DockerEndpoint | undefined> {
  const contexts = await listContexts();
  const active = contexts.find((context) => context.active);
  if (!active || active.endpoint === "") return undefined;
  const tls = (await readTlsMaterial([active.name])).get(active.name);
  return parseEndpointUrl(active.endpoint, tls);
}

async function getContext(name: string): Promise<ContextSummary> {
  const contexts = await listContexts();
  const match = contexts.find((context) => context.name === name);
  if (!match) throw new DockerDaemonError("DaemonRejected", `Context "${name}" was not found`);
  return match;
}

function hostFor(input: CreateContextInput): string {
  if (input.kind === "local") return localSocketUrl();
  const destination = (input.host ?? "").trim().replace(/^ssh:\/\//, "");
  return `ssh://${destination}`;
}

/** The local socket the server's own machine exposes; the operator never types a path for it. */
function localSocketUrl(): string {
  const endpoint = defaultLocalSocket();
  const socketPath = endpoint.kind === "unix" ? endpoint.socketPath : "";
  return process.platform === "win32" ? `npipe://${socketPath}` : `unix://${socketPath}`;
}

function endpointKind(endpoint: string): ContextEndpointKind {
  if (endpoint.startsWith("ssh://")) return "ssh";
  if (endpoint.startsWith("tcp://") || endpoint.startsWith("http://") || endpoint.startsWith("https://")) return "tcp";
  return "local";
}

/**
 * The TLS material each named context carries for its Docker endpoint, as
 * files stored by Docker itself under the context's TLS directory. Contexts
 * with none are absent from the map. An inspect failure yields an empty map:
 * the inventory is worth more than the TLS detail it adds.
 */
async function readTlsMaterial(names: string[]): Promise<Map<string, TlsOptions>> {
  const material = new Map<string, TlsOptions>();
  if (names.length === 0) return material;
  let inspected: RawContextInspect[];
  try {
    inspected = await runDockerJsonArray<RawContextInspect>(["context", "inspect", ...names]);
  } catch {
    return material;
  }
  for (const entry of inspected) {
    const files = entry.TLSMaterial?.docker;
    const tlsPath = entry.Storage?.TLSPath;
    if (!files || files.length === 0 || !tlsPath) continue;
    const directory = join(tlsPath, "docker");
    const ca = files.find((file) => file.startsWith("ca"));
    const cert = files.find((file) => file.startsWith("cert"));
    const key = files.find((file) => file.startsWith("key"));
    if (!ca || !cert || !key) continue;
    material.set(entry.Name, { ca: join(directory, ca), cert: join(directory, cert), key: join(directory, key) });
  }
  return material;
}
