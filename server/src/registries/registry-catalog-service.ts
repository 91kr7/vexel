// Repository and tag browsing against a configured registry (REQ-86): search
// the repositories a registry exposes, list a repository's tags with the size
// each one weighs, and name the reference a selected tag is pulled by.
//
// Two channels, because registries do not all answer the same questions:
//   - Docker Hub has no catalog endpoint but a search API of its own, which is
//     also where the pull counts and the per-tag sizes come from.
//   - every other registry answers the Distribution v2 API: `_catalog`,
//     `tags/list`, and the manifest a tag's size is summed from.
// Both are read anonymously: the credential store's secrets are never read
// back by this application (REQ-87), so what is browsable here is what the
// registry lets an anonymous client reach.
import { DockerDaemonError } from "../docker/errors.js";
import { byNameThenIdentity } from "../list-order/list-order.js";
import { isDockerHub, normalizeRegistryHost, type RegistrySummary } from "./registries-service.js";

const HUB_API = "https://hub.docker.com/v2";
// Tolerance, not a cadence: how slow a registry on the internet may be.
// Shortened, a slow but healthy registry reads as unreachable.
const REQUEST_TIMEOUT_MS = 15000;
/** How many tags of a v2 registry get their manifest read, and how many at a time. */
const TAG_SIZE_CONCURRENCY = 4;

const MANIFEST_ACCEPT = [
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.oci.image.index.v1+json",
].join(", ");

// A repository and a tag carry no identifier but their own name, so the last
// comparison is that same name compared exactly.
const nameOrder = byNameThenIdentity<string>({ name: (name) => name, identity: (name) => name });
const tagOrder = byNameThenIdentity<TagSummary>({ name: (tag) => tag.name, identity: (tag) => tag.name });

export interface RepositorySummary {
  /** The repository path inside the registry, e.g. `library/nginx`, `myorg/api`. */
  name: string;
  description?: string;
  /** Lifetime pull count, reported by Docker Hub only. */
  pullCount?: number;
}

export interface TagSummary {
  name: string;
  /** Total size of the tag's image; absent when the registry did not report one. */
  sizeBytes?: number;
  updatedAt?: string;
  /** The reference this tag is pulled by, e.g. `nginx:1.27`, `ghcr.io/myorg/api:latest`. */
  pullReference: string;
}

/**
 * The reference the daemon pulls a tag by: bare for Docker Hub (the default
 * index needs no host, and an official image needs no `library/`), host-
 * prefixed everywhere else.
 */
export function pullReferenceFor(host: string, repository: string, tag: string): string {
  const path = repository.replace(/^\/+/, "");
  if (isDockerHub(host)) return `${path.startsWith("library/") ? path.slice("library/".length) : path}:${tag}`;
  return `${normalizeRegistryHost(host)}/${path}:${tag}`;
}

/**
 * Repositories of `registry` matching `query`. Docker Hub is searched (it has
 * no catalog to list, so an empty query yields nothing) and its result set
 * keeps the order Hub returned it in, which is a relevance ranking for the term
 * the operator typed; every other registry has its catalog listed, filtered on
 * the term and ordered by repository name, having no ranking of its own.
 */
export async function searchRepositories(registry: RegistrySummary, query: string, limit: number): Promise<RepositorySummary[]> {
  const term = query.trim();
  if (isDockerHub(registry.host)) return term === "" ? [] : searchDockerHub(term, limit);
  return listCatalog(registry, term, limit);
}

/** Tags of `repository`, ordered by tag name, each with its size. */
export async function listRepositoryTags(registry: RegistrySummary, repository: string, limit: number): Promise<TagSummary[]> {
  const path = repository.trim().replace(/^\/+|\/+$/g, "");
  if (path === "") throw new DockerDaemonError("DaemonRejected", "A repository is required.");
  if (isDockerHub(registry.host)) return listHubTags(path, limit);
  return listV2Tags(registry, path, limit);
}

async function searchDockerHub(query: string, limit: number): Promise<RepositorySummary[]> {
  const url = `${HUB_API}/search/repositories/?query=${encodeURIComponent(query)}&page_size=${limit}`;
  const payload = await fetchJson<{ results?: { repo_name?: string; short_description?: string; pull_count?: number }[] }>(url);
  return (payload.results ?? [])
    .filter((entry): entry is { repo_name: string; short_description?: string; pull_count?: number } => typeof entry.repo_name === "string")
    .map((entry) => ({
      name: entry.repo_name,
      description: entry.short_description?.trim() ? entry.short_description.trim() : undefined,
      pullCount: typeof entry.pull_count === "number" ? entry.pull_count : undefined,
    }));
}

async function listHubTags(repository: string, limit: number): Promise<TagSummary[]> {
  // Docker Hub keys official images under `library/`, while its search reports
  // them bare — the reference the daemon pulls by keeps the bare form.
  const path = repository.includes("/") ? repository : `library/${repository}`;
  const url = `${HUB_API}/repositories/${path}/tags/?page_size=${limit}`;
  const payload = await fetchJson<{ results?: { name?: string; full_size?: number; last_updated?: string }[] }>(url);
  return (payload.results ?? [])
    .filter((entry): entry is { name: string; full_size?: number; last_updated?: string } => typeof entry.name === "string")
    .map((entry) => ({
      name: entry.name,
      sizeBytes: typeof entry.full_size === "number" ? entry.full_size : undefined,
      updatedAt: entry.last_updated,
      pullReference: pullReferenceFor("docker.io", repository, entry.name),
    }))
    .sort(tagOrder);
}

async function listCatalog(registry: RegistrySummary, term: string, limit: number): Promise<RepositorySummary[]> {
  // The catalog is fetched wider than the page shown, so filtering on the term
  // still has something to choose from.
  const payload = await fetchRegistryJson<{ repositories?: string[] }>(registry, `/v2/_catalog?n=${Math.max(limit * 4, 100)}`);
  const lowered = term.toLowerCase();
  // Ordered before the page is cut, so which repositories the limit keeps does
  // not depend on the order the registry answered in either.
  return (payload.repositories ?? [])
    .filter((name) => typeof name === "string" && (lowered === "" || name.toLowerCase().includes(lowered)))
    .sort(nameOrder)
    .slice(0, limit)
    .map((name) => ({ name }));
}

async function listV2Tags(registry: RegistrySummary, repository: string, limit: number): Promise<TagSummary[]> {
  const payload = await fetchRegistryJson<{ tags?: string[] | null }>(registry, `/v2/${repository}/tags/list?n=${limit}`);
  const names = (payload.tags ?? [])
    .filter((tag): tag is string => typeof tag === "string")
    .sort(nameOrder)
    .slice(0, limit);

  const sizes = new Map<string, number | undefined>();
  for (let index = 0; index < names.length; index += TAG_SIZE_CONCURRENCY) {
    const slice = names.slice(index, index + TAG_SIZE_CONCURRENCY);
    const resolved = await Promise.all(slice.map((tag) => readTagSize(registry, repository, tag)));
    slice.forEach((tag, position) => sizes.set(tag, resolved[position]));
  }

  return names.map((tag) => ({
    name: tag,
    sizeBytes: sizes.get(tag),
    pullReference: pullReferenceFor(registry.host, repository, tag),
  }));
}

/**
 * The bytes a tag weighs: the config blob plus every layer of its manifest. A
 * multi-platform index is measured on its first manifest. A tag whose manifest
 * cannot be read keeps its place in the list with no size rather than failing
 * the whole listing.
 */
async function readTagSize(registry: RegistrySummary, repository: string, tag: string): Promise<number | undefined> {
  try {
    const manifest = await fetchRegistryJson<RawManifest>(registry, `/v2/${repository}/manifests/${encodeURIComponent(tag)}`, {
      Accept: MANIFEST_ACCEPT,
    });
    const resolved = manifest.manifests?.[0]?.digest
      ? await fetchRegistryJson<RawManifest>(registry, `/v2/${repository}/manifests/${manifest.manifests[0].digest}`, {
          Accept: MANIFEST_ACCEPT,
        })
      : manifest;
    const layers = resolved.layers ?? [];
    if (layers.length === 0 && resolved.config?.size === undefined) return undefined;
    return layers.reduce((total, layer) => total + (layer.size ?? 0), resolved.config?.size ?? 0);
  } catch {
    return undefined;
  }
}

interface RawManifest {
  config?: { size?: number };
  layers?: { size?: number }[];
  manifests?: { digest?: string }[];
}

function registryBaseUrl(registry: RegistrySummary): string {
  return `${registry.secure ? "https" : "http"}://${registry.host}`;
}

/**
 * A Distribution v2 read, answering the registry's bearer challenge
 * anonymously when it issues one. No credential of the operator's is ever used
 * here (REQ-87): a repository the registry hides from an anonymous client
 * stays out of reach, and says so.
 */
async function fetchRegistryJson<T>(registry: RegistrySummary, path: string, headers: Record<string, string> = {}): Promise<T> {
  const url = `${registryBaseUrl(registry)}${path}`;
  const first = await sendRequest(url, headers);
  if (first.status !== 401) return parseJsonResponse<T>(first, registry.host);

  const token = await requestAnonymousToken(first.headers.get("www-authenticate"));
  if (token === undefined) throw unreachable(registry.host, "it requires credentials this application does not hold");
  const retried = await sendRequest(url, { ...headers, Authorization: `Bearer ${token}` });
  return parseJsonResponse<T>(retried, registry.host);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await sendRequest(url, {});
  return parseJsonResponse<T>(response, new URL(url).host);
}

async function sendRequest(url: string, headers: Record<string, string>): Promise<Response> {
  try {
    return await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw unreachable(new URL(url).host, (error as Error).message);
  }
}

async function parseJsonResponse<T>(response: Response, host: string): Promise<T> {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw unreachable(host, "it requires credentials this application does not hold");
    }
    throw unreachable(host, `it answered HTTP ${response.status}`);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw unreachable(host, "it answered something that is not JSON");
  }
}

/**
 * The token a `WWW-Authenticate: Bearer …` challenge points at, fetched without
 * credentials. `undefined` when the challenge is not a bearer one or the token
 * service refuses an anonymous caller.
 */
async function requestAnonymousToken(challenge: string | null): Promise<string | undefined> {
  if (!challenge || !/^bearer/i.test(challenge.trim())) return undefined;
  const parameters = new Map<string, string>();
  for (const match of challenge.slice(challenge.indexOf(" ") + 1).matchAll(/(\w+)="([^"]*)"/g)) {
    parameters.set(match[1].toLowerCase(), match[2]);
  }
  const realm = parameters.get("realm");
  if (!realm) return undefined;

  const url = new URL(realm);
  const service = parameters.get("service");
  const scope = parameters.get("scope");
  if (service) url.searchParams.set("service", service);
  if (scope) url.searchParams.set("scope", scope);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) return undefined;
    const payload = (await response.json()) as { token?: string; access_token?: string };
    return payload.token ?? payload.access_token;
  } catch {
    return undefined;
  }
}

function unreachable(host: string, reason: string): DockerDaemonError {
  return new DockerDaemonError("DaemonRejected", `${host} could not be browsed: ${reason}.`);
}
