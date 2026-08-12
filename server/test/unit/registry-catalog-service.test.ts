import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { listRepositoryTags, pullReferenceFor, searchRepositories } from "../../src/registries/registry-catalog-service.js";
import type { RegistrySummary } from "../../src/registries/registries-service.js";
import { DockerDaemonError } from "../../src/docker/errors.js";

// RegistryCatalogService talks to a registry over HTTP and to nothing else
// (registries/specs/registry-catalog-service.md). That one outbound boundary is
// stubbed here, so the service's own rules are what is under test: which
// channel a registry is browsed on, how a term filters, how a tag's size is
// summed, what a registry that hides itself from an anonymous client produces,
// and the reference a tag is pulled by. No credential exists anywhere in this
// file: every read the service makes must be anonymous (REQ-87).
interface StubResponse {
  status?: number;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
}

const requests: { url: string; headers: Record<string, string> }[] = [];
let respond: (url: string) => StubResponse = () => ({ status: 404 });

const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) headers[key.toLowerCase()] = value;
  requests.push({ url, headers });
  const { status = 200, body, rawBody, headers: responseHeaders = {} } = respond(url);
  return new Response(rawBody ?? (body === undefined ? "" : JSON.stringify(body)), {
    status,
    headers: { "content-type": "application/json", ...responseHeaders },
  });
}) as typeof fetch;

after(() => {
  globalThis.fetch = originalFetch;
});

function registry(overrides: Partial<RegistrySummary> = {}): RegistrySummary {
  return {
    host: "registry.internal:5000",
    serverUrl: "registry.internal:5000",
    authenticated: false,
    secure: true,
    official: false,
    ...overrides,
  };
}

const dockerHub = registry({ host: "docker.io", serverUrl: "https://index.docker.io/v1/", official: true });

/** A manifest of the shape a Distribution v2 registry answers a tag with. */
function manifest(configSize: number, layerSizes: number[]) {
  return { config: { size: configSize }, layers: layerSizes.map((size) => ({ size })) };
}

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ status: 404 });
});

// registry-catalog-service.md — "Docker Hub -> repository:tag, with no host prefix and with the
// library/ prefix of an official image dropped"
test("pullReferenceFor names a Docker Hub official image bare, without host or library prefix", () => {
  assert.equal(pullReferenceFor("docker.io", "library/nginx", "1.27"), "nginx:1.27");
  assert.equal(pullReferenceFor("https://index.docker.io/v1/", "library/nginx", "1.27"), "nginx:1.27");
});

test("pullReferenceFor keeps an organisation's Docker Hub repository as it is, with no host prefix", () => {
  assert.equal(pullReferenceFor("docker.io", "myorg/api", "latest"), "myorg/api:latest");
});

// registry-catalog-service.md — "Any other registry -> host/repository:tag"
test("pullReferenceFor prefixes any other registry's reference with its host", () => {
  assert.equal(pullReferenceFor("ghcr.io", "myorg/api", "latest"), "ghcr.io/myorg/api:latest");
  assert.equal(pullReferenceFor("registry.internal:5000", "team/app", "v1"), "registry.internal:5000/team/app:v1");
});

// registry-catalog-service.md — "Docker Hub ... has no catalog to list, so an empty term yields an
// empty list, not an error"
test("searchRepositories yields an empty list for Docker Hub with an empty term, asking nothing of the network", async () => {
  respond = () => {
    throw new Error("no request may be made for an empty Docker Hub term");
  };

  assert.deepEqual(await searchRepositories(dockerHub, "   ", 25), []);
  assert.equal(requests.length, 0);
});

// registry-catalog-service.md — "Docker Hub -> searched on the term ... pullCount and description
// are reported there"
test("searchRepositories reports Docker Hub's description and pull count for a searched term", async () => {
  respond = () => ({
    body: {
      results: [
        { repo_name: "library/nginx", short_description: "Official build of Nginx.", pull_count: 1_800_000_000 },
        { repo_name: "myorg/nginx-proxy", short_description: "   ", pull_count: 48_000 },
      ],
    },
  });

  const repositories = await searchRepositories(dockerHub, "nginx", 25);

  assert.deepEqual(repositories[0], { name: "library/nginx", description: "Official build of Nginx.", pullCount: 1_800_000_000 });
  assert.equal(repositories[1]!.name, "myorg/nginx-proxy");
  assert.equal(repositories[1]!.description, undefined);
  assert.equal(repositories[1]!.pullCount, 48_000);
});

// registry-catalog-service.md — "Any other registry -> its catalog is listed and filtered on the
// term (case-insensitive substring)"
test("searchRepositories filters another registry's catalog on the term, case-insensitively", async () => {
  respond = () => ({ body: { repositories: ["team/API-gateway", "team/worker", "other/api"] } });

  const repositories = await searchRepositories(registry(), "api", 25);

  // Ordered by repository name, the term being a filter and never a ranking (REQ-39).
  assert.deepEqual(
    repositories.map((repository) => repository.name),
    ["other/api", "team/API-gateway"],
  );
});

// registry-catalog-service.md — "an empty term lists the whole catalog"
test("searchRepositories lists another registry's whole catalog for an empty term", async () => {
  respond = () => ({ body: { repositories: ["team/api", "team/worker"] } });

  const repositories = await searchRepositories(registry(), "", 25);

  assert.deepEqual(
    repositories.map((repository) => repository.name),
    ["team/api", "team/worker"],
  );
});

// registry-catalog-service.md — "No pull count is reported: no Distribution registry publishes one."
test("searchRepositories reports no pull count and no description for a Distribution registry", async () => {
  respond = () => ({ body: { repositories: ["team/api"] } });

  const [repository] = await searchRepositories(registry(), "", 25);

  assert.equal(repository!.pullCount, undefined);
  assert.equal(repository!.description, undefined);
});

// registry-catalog-service.md — "At most limit repositories are returned."
test("searchRepositories returns at most the requested number of repositories", async () => {
  respond = () => ({ body: { repositories: ["a/one", "a/two", "a/three", "a/four"] } });

  const repositories = await searchRepositories(registry(), "a/", 2);

  assert.equal(repositories.length, 2);
});

// registry-catalog-service.md — "Such a catalog carries no ranking of its own, so it is ordered by
// repository name under the list-order rule (compareNames)": digit runs read as numbers, case not
// splitting the catalog into two alphabets (REQ-39).
test("searchRepositories reads digit runs in a repository name as numbers, and keeps case together", async () => {
  respond = () => ({ body: { repositories: ["team/api-10", "team/API-3", "team/api-2"] } });

  const repositories = await searchRepositories(registry(), "", 25);

  assert.deepEqual(
    repositories.map((repository) => repository.name),
    ["team/api-2", "team/API-3", "team/api-10"],
  );
});

// registry-catalog-service.md — "with that name compared exactly as the final comparison", and the
// catalog is listed "in whatever order it arrives", so the same catalog must come out one way
// whichever way round the registry answered (REQ-39, REQ-43, REQ-6).
test("searchRepositories produces one sequence for tying repository names, in either answer order", async () => {
  const catalog = ["team/Api", "team/api", "team/worker-1", "team/worker-01"];
  const expected = ["team/Api", "team/api", "team/worker-01", "team/worker-1"];

  respond = () => ({ body: { repositories: catalog } });
  const asAnswered = (await searchRepositories(registry(), "", 25)).map((repository) => repository.name);

  respond = () => ({ body: { repositories: [...catalog].reverse() } });
  const theOtherWayRound = (await searchRepositories(registry(), "", 25)).map((repository) => repository.name);

  assert.deepEqual(asAnswered, expected);
  assert.deepEqual(theOtherWayRound, expected, "the same catalog must come out the same way in either answer order");
});

// registry-catalog-service.md — "the ordering is applied before that cut, so which repositories the
// limit keeps does not depend on the order the registry answered in" (REQ-39).
test("searchRepositories orders another registry's catalog before the limit cuts it", async () => {
  const catalog = ["team/delta", "team/alpha", "team/charlie", "team/bravo"];
  const expected = ["team/alpha", "team/bravo"];

  respond = () => ({ body: { repositories: catalog } });
  const asAnswered = (await searchRepositories(registry(), "", 2)).map((repository) => repository.name);

  respond = () => ({ body: { repositories: [...catalog].reverse() } });
  const theOtherWayRound = (await searchRepositories(registry(), "", 2)).map((repository) => repository.name);

  assert.deepEqual(asAnswered, expected, "the limit keeps the lowest names, not the first the registry happened to answer");
  assert.deepEqual(theOtherWayRound, expected, "the set the limit keeps must not depend on the answer order either");
});

// registry-catalog-service.md — "Docker Hub ... The result keeps the order Docker Hub returned it
// in — that order is a relevance ranking for the term the operator typed, so a search for nginx
// still answers with nginx first, and it is deliberately not alphabetised" (REQ-40).
test("searchRepositories keeps Docker Hub's own ranking, unalphabetised, for the term the operator typed", async () => {
  const ranked = ["library/nginx", "bitnami/nginx", "aaa/nginx-exporter", "myorg/nginx-proxy"];
  respond = () => ({ body: { results: ranked.map((name) => ({ repo_name: name })) } });

  const repositories = await searchRepositories(dockerHub, "nginx", 25);

  assert.deepEqual(
    repositories.map((repository) => repository.name),
    ranked,
    "Hub's relevance ranking carries meaning and must survive: nginx stays the first result of a search for nginx",
  );
});

// registry-catalog-service.md — "A registry is dialed over https unless its summary says it is
// insecure, in which case http."
test("searchRepositories dials a secure registry over https and an insecure one over http", async () => {
  respond = () => ({ body: { repositories: [] } });

  await searchRepositories(registry({ secure: true }), "", 25);
  assert.match(requests.at(-1)!.url, /^https:\/\/registry\.internal:5000\//);

  await searchRepositories(registry({ host: "localhost:5000", secure: false }), "", 25);
  assert.match(requests.at(-1)!.url, /^http:\/\/localhost:5000\//);
});

// registry-catalog-service.md — "Rejects on an empty repository."
test("listRepositoryTags rejects on an empty repository", async () => {
  await assert.rejects(() => listRepositoryTags(registry(), "   ", 25), DockerDaemonError);
  assert.equal(requests.length, 0);
});

// registry-catalog-service.md — "each tag's size summed from its manifest: the config blob plus
// every layer", with the reference the tag is pulled by
test("listRepositoryTags sums a tag's size from its config blob and every layer, and names its pull reference", async () => {
  respond = (url) => {
    if (url.includes("/tags/list")) return { body: { tags: ["v1"] } };
    if (url.includes("/manifests/v1")) return { body: manifest(1_000, [10_000, 20_000]) };
    return { status: 404 };
  };

  const tags = await listRepositoryTags(registry(), "team/api", 25);

  assert.equal(tags.length, 1);
  assert.equal(tags[0]!.name, "v1");
  assert.equal(tags[0]!.sizeBytes, 31_000);
  assert.equal(tags[0]!.pullReference, "registry.internal:5000/team/api:v1");
});

// registry-catalog-service.md — "A multi-platform index is measured on its first manifest."
test("listRepositoryTags measures a multi-platform index on its first manifest", async () => {
  respond = (url) => {
    if (url.includes("/tags/list")) return { body: { tags: ["multi"] } };
    if (url.includes("/manifests/multi")) return { body: { manifests: [{ digest: "sha256:first" }, { digest: "sha256:second" }] } };
    if (url.includes("/manifests/sha256:first")) return { body: manifest(500, [1_500]) };
    if (url.includes("/manifests/sha256:second")) return { body: manifest(999_999, [999_999]) };
    return { status: 404 };
  };

  const tags = await listRepositoryTags(registry(), "team/api", 25);

  assert.equal(tags[0]!.sizeBytes, 2_000);
});

// registry-catalog-service.md — "A tag whose manifest cannot be read keeps its place in the list
// with no size, rather than failing the whole listing."
test("listRepositoryTags keeps a tag whose manifest cannot be read, with no size", async () => {
  respond = (url) => {
    if (url.includes("/tags/list")) return { body: { tags: ["good", "broken"] } };
    if (url.includes("/manifests/good")) return { body: manifest(1_000, [2_000]) };
    if (url.includes("/manifests/broken")) return { status: 500 };
    return { status: 404 };
  };

  const tags = await listRepositoryTags(registry(), "team/api", 25);

  // The tags are ordered by name, so the unreadable one keeps its place in that order rather than
  // the place the registry answered in (REQ-41).
  assert.deepEqual(
    tags.map((tag) => tag.name),
    ["broken", "good"],
  );
  assert.equal(tags[0]!.sizeBytes, undefined);
  assert.equal(tags[1]!.sizeBytes, 3_000);
});

// registry-catalog-service.md — "At most limit tags are returned."
test("listRepositoryTags returns at most the requested number of tags", async () => {
  respond = (url) => {
    if (url.includes("/tags/list")) return { body: { tags: ["v1", "v2", "v3", "v4"] } };
    return { body: manifest(1, [1]) };
  };

  const tags = await listRepositoryTags(registry(), "team/api", 2);

  assert.equal(tags.length, 2);
});

// registry-catalog-service.md — "Ordered by tag name under the list-order rule (compareNames), for
// every registry, Docker Hub included: 1.25 before 1.26 before latest" (REQ-41)
test("listRepositoryTags orders the tags by name, 1.25 before 1.26 before latest", async () => {
  const answered = ["latest", "1.26", "1.25"];
  respond = (url) => {
    if (url.includes("/tags/list")) return { body: { tags: answered } };
    return { body: manifest(1, [1]) };
  };

  const tags = await listRepositoryTags(registry(), "team/api", 25);

  assert.deepEqual(
    tags.map((tag) => tag.name),
    ["1.25", "1.26", "latest"],
  );
});

// registry-catalog-service.md — the same ordering "for every registry, Docker Hub included" (REQ-41)
test("listRepositoryTags orders Docker Hub's tags by name too", async () => {
  respond = () => ({ body: { results: [{ name: "latest" }, { name: "1.26" }, { name: "1.25" }] } });

  const tags = await listRepositoryTags(dockerHub, "library/nginx", 25);

  assert.deepEqual(
    tags.map((tag) => tag.name),
    ["1.25", "1.26", "latest"],
  );
});

// registry-catalog-service.md — "A tag carries no identifier other than its name, so the final
// comparison is that same name compared exactly", and the same tags must come out one way whichever
// way round the registry answered (REQ-41, REQ-43, REQ-6).
test("listRepositoryTags produces one sequence for tying tag names, in either answer order", async () => {
  const answered = ["2.0.1", "2.0.01", "V1", "v1"];
  const expected = ["2.0.01", "2.0.1", "V1", "v1"];
  const respondWith = (tags: string[]) => (url: string) => {
    if (url.includes("/tags/list")) return { body: { tags } };
    return { body: manifest(1, [1]) };
  };

  respond = respondWith(answered);
  const asAnswered = (await listRepositoryTags(registry(), "team/api", 25)).map((tag) => tag.name);

  respond = respondWith([...answered].reverse());
  const theOtherWayRound = (await listRepositoryTags(registry(), "team/api", 25)).map((tag) => tag.name);

  assert.deepEqual(asAnswered, expected);
  assert.deepEqual(theOtherWayRound, expected, "the same tags must come out the same way in either answer order");
});

// registry-catalog-service.md — "the ordering is applied before it, so which tags the limit keeps
// does not depend on the order the registry answered in" (REQ-41).
test("listRepositoryTags orders the tags before the limit cuts them", async () => {
  const answered = ["v4", "v1", "v3", "v2"];
  const expected = ["v1", "v2"];
  const respondWith = (tags: string[]) => (url: string) => {
    if (url.includes("/tags/list")) return { body: { tags } };
    return { body: manifest(1, [1]) };
  };

  respond = respondWith(answered);
  const asAnswered = (await listRepositoryTags(registry(), "team/api", 2)).map((tag) => tag.name);

  respond = respondWith([...answered].reverse());
  const theOtherWayRound = (await listRepositoryTags(registry(), "team/api", 2)).map((tag) => tag.name);

  assert.deepEqual(asAnswered, expected, "the limit keeps the lowest tag names, not the first the registry happened to answer");
  assert.deepEqual(theOtherWayRound, expected, "the set the limit keeps must not depend on the answer order either");
});

test("listRepositoryTags answers an empty list for a repository the registry reports no tags for", async () => {
  respond = () => ({ body: { tags: null } });

  assert.deepEqual(await listRepositoryTags(registry(), "team/api", 25), []);
});

// registry-catalog-service.md — "an official image is looked up under library/... even when it is
// named bare", the pull reference staying bare
test("listRepositoryTags looks a bare Docker Hub official image up under library/, keeping the bare reference", async () => {
  respond = () => ({ body: { results: [{ name: "1.27", full_size: 77_000, last_updated: "2026-01-02T03:04:05Z" }] } });

  const tags = await listRepositoryTags(dockerHub, "nginx", 25);

  assert.match(requests[0]!.url, /\/repositories\/library\/nginx\/tags\//);
  assert.equal(tags[0]!.name, "1.27");
  assert.equal(tags[0]!.sizeBytes, 77_000);
  assert.equal(tags[0]!.updatedAt, "2026-01-02T03:04:05Z");
  assert.equal(tags[0]!.pullReference, "nginx:1.27");
});

// registry-catalog-service.md — "What a registry hides from an anonymous client stays out of reach
// and says so — '...could not be browsed: it requires credentials this application does not hold'"
// (REQ-87)
test("searchRepositories reports a registry that refuses an anonymous client as requiring credentials it does not hold", async () => {
  respond = () => ({ status: 401, headers: { "www-authenticate": 'Basic realm="Vexel test realm"' }, body: { errors: [] } });

  await assert.rejects(
    () => searchRepositories(registry(), "", 25),
    (error: unknown) => {
      assert.ok(error instanceof DockerDaemonError, "expected a DockerDaemonError");
      assert.equal(error.code, "DaemonRejected");
      assert.match(error.message, /registry\.internal:5000/);
      assert.match(error.message, /credentials this application does not hold/);
      return true;
    },
  );
});

test("searchRepositories reports a registry that forbids an anonymous client the same way", async () => {
  respond = () => ({ status: 403, body: { errors: [] } });

  await assert.rejects(() => searchRepositories(registry(), "", 25), /credentials this application does not hold/);
});

// registry-catalog-service.md — "A registry that answers a bearer challenge is followed once,
// anonymously, to its token service; the request is then retried with that token."
test("searchRepositories follows a bearer challenge anonymously and retries with the token it gets", async () => {
  let catalogAttempts = 0;
  respond = (url) => {
    if (url.startsWith("https://token.internal/")) return { body: { token: "an-anonymous-token" } };
    catalogAttempts += 1;
    if (catalogAttempts === 1) {
      return {
        status: 401,
        headers: { "www-authenticate": 'Bearer realm="https://token.internal/token",service="registry.internal",scope="registry:catalog:*"' },
        body: { errors: [] },
      };
    }
    return { body: { repositories: ["team/api"] } };
  };

  const repositories = await searchRepositories(registry(), "", 25);

  assert.deepEqual(
    repositories.map((repository) => repository.name),
    ["team/api"],
  );
  const tokenRequest = requests.find((request) => request.url.startsWith("https://token.internal/"));
  assert.ok(tokenRequest, "expected the token service to be asked");
  // Anonymously: nothing of the operator's is presented to the token service.
  assert.equal(tokenRequest!.headers.authorization, undefined);
  assert.equal(requests.at(-1)!.headers.authorization, "Bearer an-anonymous-token");
  assert.ok(requests[0]!.headers.authorization === undefined, "the first attempt carries no credential either");
});

// registry-catalog-service.md — "Every failure — refusal, unreachable host, non-JSON answer — is
// reported as a DockerDaemonError ... naming the host and the reason"
test("searchRepositories reports a non-JSON answer as a failure naming the host", async () => {
  respond = () => ({ rawBody: "<html>a proxy login page</html>", headers: { "content-type": "text/html" } });

  await assert.rejects(
    () => searchRepositories(registry(), "", 25),
    (error: unknown) => {
      assert.ok(error instanceof DockerDaemonError);
      assert.match(error.message, /registry\.internal:5000/);
      assert.match(error.message, /not JSON/);
      return true;
    },
  );
});

test("searchRepositories reports an unreachable registry as a failure naming the host", async () => {
  respond = () => {
    throw new TypeError("fetch failed");
  };

  await assert.rejects(
    () => searchRepositories(registry(), "", 25),
    (error: unknown) => {
      assert.ok(error instanceof DockerDaemonError);
      assert.equal(error.code, "DaemonRejected");
      assert.match(error.message, /registry\.internal:5000 could not be browsed/);
      return true;
    },
  );
});

test("searchRepositories reports any other refusal with the status the registry answered", async () => {
  respond = () => ({ status: 500, body: { errors: [] } });

  await assert.rejects(() => searchRepositories(registry(), "", 25), /HTTP 500/);
});
