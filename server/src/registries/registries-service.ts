// Registry inventory and authentication (REQ-85, REQ-87): the configured
// registries, plus log in and log out delegated to the `docker` CLI.
//
// The account name comes from the credential helper's `list` verb, never its
// `get`, which would hand this process the password it must never hold (REQ-87).
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getEngineClient } from "../docker/engine-client.js";
import { DockerDaemonError } from "../docker/errors.js";
import { byNameThenIdentity } from "../list-order/list-order.js";
import { registerRefreshKind } from "../refresh-cache/refresh-cache.js";
import { runCapture } from "./registry-cli.js";

/** Docker's own name for the default index, as it keys it in `config.json`. */
const DEFAULT_INDEX_SERVER_URL = "https://index.docker.io/v1/";
export const DOCKER_HUB_HOST = "docker.io";

const HUB_ALIASES = new Set(["docker.io", "index.docker.io", "registry-1.docker.io", "registry.hub.docker.com"]);

/**
 * The username Docker records for a credential that is an identity token
 * rather than a person's account. It names nobody, so it is reported as no
 * account at all — the session is authenticated, just not as someone.
 */
const TOKEN_PLACEHOLDER_ACCOUNT = "<token>";

export interface RegistrySummary {
  /** The registry as the operator names it: `docker.io`, `ghcr.io`, `registry.internal:5000`. */
  host: string;
  /** The key Docker itself records the registry under, e.g. `https://index.docker.io/v1/`. */
  serverUrl: string;
  authenticated: boolean;
  /** The account the session is authenticated as; absent when the store does not report one. */
  account?: string;
  /** The credential helper backing this registry; absent when credentials sit in the Docker config file. */
  credentialStore?: string;
  /** `false` when the daemon treats the registry as an insecure (plain http) one. */
  secure: boolean;
  /** `true` for the default Docker index. */
  official: boolean;
}

export interface RegistryLoginInput {
  host: string;
  username: string;
  /** The secret, held only for the duration of this call and written to the CLI's standard input. */
  secret: string;
}

interface RawAuthEntry {
  auth?: string;
  identitytoken?: string;
}

interface RawDockerConfig {
  auths?: Record<string, RawAuthEntry>;
  credsStore?: string;
  credHelpers?: Record<string, string>;
}

interface RawIndexConfig {
  Name?: string;
  Secure?: boolean;
  Official?: boolean;
}

/**
 * The host a registry reference names: scheme and path dropped, lower-cased.
 * `""` when the reference names none — which is a distinct answer from the
 * default index, and the only place that distinction survives.
 */
function hostPartOf(value: string): string {
  const withoutScheme = value.trim().replace(/^https?:\/\//i, "");
  return withoutScheme.split("/")[0]?.trim().toLowerCase() ?? "";
}

/**
 * The registry a host string names, in the form the rest of the area uses:
 * scheme and path dropped, every alias of the default index — the empty string
 * included, since that is how Docker's own configuration writes the default
 * index — collapsed onto `docker.io`.
 */
export function normalizeRegistryHost(value: string): string {
  const host = hostPartOf(value);
  if (host === "") return DOCKER_HUB_HOST;
  return HUB_ALIASES.has(host) ? DOCKER_HUB_HOST : host;
}

export function isDockerHub(host: string): boolean {
  return normalizeRegistryHost(host) === DOCKER_HUB_HOST;
}

/**
 * Docker reaches a registry on the loopback interface over plain http unless
 * told otherwise, and reports no index configuration for it; the same rule is
 * applied here so a registry running on the operator's own machine is browsable
 * without any configuration.
 */
function isLoopbackHost(host: string): boolean {
  const name = host.split(":")[0] ?? "";
  return name === "localhost" || name.endsWith(".localhost") || name === "::1" || /^127\./.test(name);
}

function serverUrlFor(host: string): string {
  return isDockerHub(host) ? DEFAULT_INDEX_SERVER_URL : host;
}

export async function listRegistries(): Promise<RegistrySummary[]> {
  const [config, indexConfigs] = await Promise.all([readDockerConfig(), readIndexConfigs()]);

  const authsByHost = new Map<string, RawAuthEntry>();
  for (const [key, entry] of Object.entries(config.auths ?? {})) authsByHost.set(normalizeRegistryHost(key), entry);
  const helpersByHost = new Map<string, string>();
  for (const [key, helper] of Object.entries(config.credHelpers ?? {})) helpersByHost.set(normalizeRegistryHost(key), helper);

  // The default index is always part of the inventory, logged in or not.
  const hosts = new Set<string>([DOCKER_HUB_HOST, ...authsByHost.keys(), ...helpersByHost.keys(), ...indexConfigs.keys()]);

  const stores = new Set<string>();
  for (const host of hosts) {
    const store = helpersByHost.get(host) ?? config.credsStore;
    if (store) stores.add(store);
  }
  const accountsByStore = await readStoreAccounts([...stores]);

  const summaries = [...hosts].map((host) => {
    const authEntry = authsByHost.get(host);
    const credentialStore = helpersByHost.get(host) ?? config.credsStore;
    const storedAccount = accountFromAuthEntry(authEntry) ?? (credentialStore ? accountsByStore.get(credentialStore)?.get(host) : undefined);
    const index = indexConfigs.get(host);
    return {
      host,
      serverUrl: serverUrlFor(host),
      authenticated: storedAccount !== undefined || (authEntry !== undefined && credentialStore !== undefined),
      account: namedAccount(storedAccount),
      credentialStore,
      secure: index?.Secure ?? !isLoopbackHost(host),
      official: isDockerHub(host),
    };
  });

  // The official entry stays ahead of the host-only ones: it is the grouping
  // rank compared before the host, and a registry has no identifier but its
  // host, so the last comparison is that same host compared exactly.
  return summaries.sort(
    byNameThenIdentity({
      group: (registry) => (registry.official ? 0 : 1),
      name: (registry) => registry.host,
      identity: (registry) => registry.host,
    }),
  );
}

/**
 * The inventory as the refresh cache keeps it. No event type: the daemon
 * publishes none for the Docker configuration or the credential store, where
 * most of this reading lives; log in and log out say so themselves.
 */
export const registryListCache = registerRefreshKind({
  key: "registries",
  periodMs: 30000,
  read: listRegistries,
});

/** A direct read, never the held value: it is what a log in and a log out answer with. */
export async function getRegistry(host: string): Promise<RegistrySummary> {
  const normalized = normalizeRegistryHost(host);
  const found = (await listRegistries()).find((registry) => registry.host === normalized);
  return (
    found ?? {
      host: normalized,
      serverUrl: serverUrlFor(normalized),
      authenticated: false,
      secure: !isLoopbackHost(normalized),
      official: isDockerHub(normalized),
    }
  );
}

/**
 * Logs in through `docker login`: the secret travels on standard input and is
 * stored by the host's credential store, never by this application (REQ-87).
 * Resolves with the registry's resulting state — which never carries a secret.
 */
export async function loginToRegistry(input: RegistryLoginInput): Promise<RegistrySummary> {
  const host = assertUsableHost(input.host);
  const username = input.username.trim();
  if (username === "") throw new DockerDaemonError("DaemonRejected", "A username is required to log in.");
  if (input.secret === "") throw new DockerDaemonError("DaemonRejected", "A secret is required to log in.");

  await runCapture("docker", ["login", host, "--username", username, "--password-stdin"], {
    stdin: input.secret,
    redact: [input.secret],
  });
  registryListCache.markChanged();
  return getRegistry(host);
}

/** Logs out through `docker logout`, which drops the entry from the credential store. */
export async function logoutFromRegistry(host: string): Promise<RegistrySummary> {
  const normalized = assertUsableHost(host);
  await runCapture("docker", ["logout", normalized]);
  registryListCache.markChanged();
  return getRegistry(normalized);
}

/**
 * Refuses a host that names no registry, and one that would be read as an
 * option by the CLI. The arguments are never passed through a shell, so that
 * second shape is the only injection one left to close.
 *
 * The raw input is what gets tested, deliberately **before** normalization: an
 * empty host normalizes to the default index, so normalizing first would turn a
 * blank host into a `docker login docker.io` and ship the operator's secret to
 * a registry they never named (REQ-87).
 */
function assertUsableHost(host: string): string {
  const named = hostPartOf(host);
  if (named === "" || named.startsWith("-")) {
    throw new DockerDaemonError("DaemonRejected", `"${host}" is not a usable registry host.`);
  }
  return normalizeRegistryHost(named);
}

function dockerConfigPath(): string {
  const configured = process.env.DOCKER_CONFIG?.trim();
  return join(configured && configured !== "" ? configured : join(homedir(), ".docker"), "config.json");
}

/** An unreadable or malformed configuration is an empty one: the inventory still lists the default index. */
async function readDockerConfig(): Promise<RawDockerConfig> {
  try {
    return JSON.parse(await readFile(dockerConfigPath(), "utf8")) as RawDockerConfig;
  } catch {
    return {};
  }
}

/**
 * The daemon's own registry configuration, keyed by normalized host: it is what
 * says whether a registry is reached over plain http (an insecure registry) and
 * it lists registries the config file knows nothing about. An unreachable
 * daemon costs the flag, not the inventory.
 */
async function readIndexConfigs(): Promise<Map<string, RawIndexConfig>> {
  const configs = new Map<string, RawIndexConfig>();
  try {
    const response = await getEngineClient().request("/info");
    const info = JSON.parse(response.body) as { RegistryConfig?: { IndexConfigs?: Record<string, RawIndexConfig> } };
    for (const [key, value] of Object.entries(info.RegistryConfig?.IndexConfigs ?? {})) {
      configs.set(normalizeRegistryHost(key), value);
    }
  } catch {
    // The daemon is unreachable or answered something unexpected.
  }
  return configs;
}

/**
 * The username of a credential Docker stored in the config file itself. The
 * decoded value also holds the secret; only the part before the separator ever
 * leaves this function, and nothing else keeps a reference to it (REQ-87).
 */
function accountFromAuthEntry(entry: RawAuthEntry | undefined): string | undefined {
  if (!entry?.auth) return undefined;
  const decoded = Buffer.from(entry.auth, "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  const username = (separator === -1 ? decoded : decoded.slice(0, separator)).trim();
  return username === "" ? undefined : username;
}

/** Drops the identity-token placeholder: it is a marker, not somebody's name. */
function namedAccount(account: string | undefined): string | undefined {
  return account === undefined || account === TOKEN_PLACEHOLDER_ACCOUNT ? undefined : account;
}

/**
 * Server URL → username per credential store, from each helper's `list` verb.
 * A helper that is absent or refuses contributes nothing: an unknown account is
 * not a failed inventory.
 */
async function readStoreAccounts(stores: string[]): Promise<Map<string, Map<string, string>>> {
  const byStore = new Map<string, Map<string, string>>();
  await Promise.all(
    stores.map(async (store) => {
      const accounts = new Map<string, string>();
      try {
        const output = (await runCapture(`docker-credential-${store}`, ["list"])).trim();
        const parsed = output === "" ? {} : (JSON.parse(output) as Record<string, unknown>);
        for (const [serverUrl, username] of Object.entries(parsed)) {
          if (typeof username === "string" && username.trim() !== "") accounts.set(normalizeRegistryHost(serverUrl), username);
        }
      } catch {
        // No such helper on PATH, or it answered something that is not a map.
      }
      byStore.set(store, accounts);
    }),
  );
  return byStore;
}
