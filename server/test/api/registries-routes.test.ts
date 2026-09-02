import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registriesRouter } from "../../src/registries/registries-routes.js";
import type { RegistrySummary } from "../../src/registries/registries-service.js";
import type { RepositorySummary, TagSummary } from "../../src/registries/registry-catalog-service.js";
import { ALPINE_IMAGE, REGISTRY_IMAGE, ensureImages } from "../support/base-images.js";
import { buildApp, ownershipArgs, startApp } from "../support/fixtures.js";
import { execFileAsync } from "../support/docker-cli.js";
import { resetRefreshCache } from "../../src/refresh-cache/refresh-cache.js";

// A pruned daemon is a starting state like any other: the base images these
// fixtures are built on are ensured before anything else, with the operator's
// own Docker configuration still in place (a pull may legitimately need it).
await ensureImages([ALPINE_IMAGE, REGISTRY_IMAGE]);

const RUN_ID = `${process.pid}-${Date.now()}`;

// REQ-87 is what this file is mostly about, so nothing here may reach the
// operator's own credentials. Two protections, both in force for the whole
// file: the Docker configuration is a throwaway directory (their ~/.docker is
// neither read nor written), and the only registry ever logged in to is a
// throwaway container of this run's own, logged out again in a `finally` and
// once more in `after`.
const configDir = await mkdtemp(join(tmpdir(), "vexel-test-registries-cfg-"));
const originalDockerConfig = process.env.DOCKER_CONFIG;
process.env.DOCKER_CONFIG = configDir;

const FIXTURE_USERNAME = "vexel-tester";
const FIXTURE_SECRET = "c0rrect-horse-battery-staple";
/**
 * The bcrypt hash of FIXTURE_SECRET, as `htpasswd -Bbn` produces it. Hard-coded
 * on purpose: it is the hash of a constant that lives in this file, so it
 * belongs to no machine and to nobody, and computing it at run time would make
 * the fixture depend on an `htpasswd` binary being installed.
 */
const FIXTURE_HTPASSWD = `${FIXTURE_USERNAME}:$2y$05$4hTbCtSK.pRuwi.hJHs7z.j/4oUxnPN/B7HT8M0uyyrSsGczPIA66`;

interface RegistryFixture {
  containerId: string;
  host: string;
}

let anonymousRegistry: RegistryFixture = { containerId: "", host: "" };
let authenticatedRegistry: RegistryFixture = { containerId: "", host: "" };
/** The repositories pushed into the anonymous fixture registry, unique to this run. */
const REPOSITORY_A = `vexel-test-reg-${RUN_ID}/alpine`;
const REPOSITORY_B = `vexel-test-reg-${RUN_ID}/hello`;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const port = (probe.address() as { port: number }).port;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * A throwaway registry:2, published on a host port so the daemon can push to it
 * and the server can browse it. `extraArgs` turn on htpasswd authentication;
 * the password file is written inside the container, so no host path is shared.
 */
async function startRegistry(caseName: string, authenticated: boolean): Promise<RegistryFixture> {
  const port = await freePort();
  const args = ["run", "-d", "-p", `${port}:5000`, ...ownershipArgs(caseName)];
  if (authenticated) {
    args.push(
      "-e",
      "REGISTRY_AUTH=htpasswd",
      "-e",
      "REGISTRY_AUTH_HTPASSWD_REALM=Vexel test realm",
      "-e",
      "REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd",
      "-e",
      `HTPASSWD=${FIXTURE_HTPASSWD}`,
      "--entrypoint",
      "sh",
      REGISTRY_IMAGE,
      "-c",
      'mkdir -p /auth && printf "%s\\n" "$HTPASSWD" > /auth/htpasswd && exec /entrypoint.sh /etc/docker/registry/config.yml',
    );
  } else {
    args.push(REGISTRY_IMAGE);
  }
  const { stdout } = await execFileAsync("docker", args);
  const host = `localhost:${port}`;

  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      const response = await fetch(`http://${host}/v2/`);
      if (response.ok || response.status === 401) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error(`the ${caseName} registry did not become ready in time`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return { containerId: stdout.trim(), host };
}

async function pushFixtureRepository(host: string, repository: string, sourceImage: string, tag: string): Promise<void> {
  const reference = `${host}/${repository}:${tag}`;
  await execFileAsync("docker", ["tag", sourceImage, reference]);
  try {
    await execFileAsync("docker", ["push", reference]);
  } finally {
    await execFileAsync("docker", ["rmi", "-f", reference]).catch(() => undefined);
  }
}

/** Drops any credential this file may have stored for a fixture registry. Safe to call when there is none. */
async function logoutQuietly(host: string): Promise<void> {
  if (host === "") return;
  await execFileAsync("docker", ["logout", host]).catch(() => undefined);
}

function app() {
  return buildApp("/api/registries", registriesRouter);
}

async function getJson<T>(url: string, path: string): Promise<{ status: number; body: T; text: string }> {
  const response = await fetch(`${url}${path}`);
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text) as T, text };
}

async function postJson(url: string, path: string, body: unknown): Promise<{ status: number; text: string }> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
}

/** Writes the throwaway Docker configuration the next reading will see. */
async function writeDockerConfig(config: unknown): Promise<void> {
  await writeFile(join(configDir, "config.json"), JSON.stringify(config), "utf8");
}

/**
 * The path of the first file under `directory` whose bytes carry `secret`, or
 * `undefined` when none does; `undefined` too when there is no such directory.
 *
 * Every file is searched on its own, as bytes. Concatenating the whole tree into
 * one string was the trap: the data directory this is pointed at is the suite's
 * shared analysis cache, deliberately kept between runs (`.archi`) and written
 * to by the other files of the parallel pass, so it grows without bound — past
 * V8's maximum string length it stopped answering the question at all and threw
 * `RangeError: Invalid string length` instead. What this test owns is the
 * question "is the secret in there", never the size of what somebody else put
 * there.
 */
async function fileCarryingSecret(directory: string, secret: string): Promise<string | undefined> {
  const entries = await readdir(directory).catch(() => []);
  for (const entry of entries) {
    const path = join(directory, entry);
    const info = await stat(path).catch(() => undefined);
    if (info?.isDirectory()) {
      const found = await fileCarryingSecret(path, secret);
      if (found) return found;
    } else if (info?.isFile()) {
      const contents = await readFile(path).catch(() => Buffer.alloc(0));
      if (contents.includes(secret)) return path;
    }
  }
  return undefined;
}

/**
 * Everything the server writes out while `action` runs. The writes are recorded
 * and then passed on unchanged: the test runner reports its own results through
 * this very stream, and swallowing them would lose whole tests from the run.
 */
async function captureProcessOutput(action: () => Promise<void>): Promise<string> {
  const originalStdout = process.stdout.write.bind(process.stdout);
  const originalStderr = process.stderr.write.bind(process.stderr);
  const originalConsole = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  let captured = "";
  process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    captured += String(chunk);
    return (originalStdout as (...args: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    captured += String(chunk);
    return (originalStderr as (...args: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stderr.write;
  const recordConsole = (original: (...values: unknown[]) => void) => (...values: unknown[]) => {
    captured += values.map((value) => String(value)).join(" ");
    original(...values);
  };
  console.log = recordConsole(originalConsole.log);
  console.error = recordConsole(originalConsole.error);
  console.warn = recordConsole(originalConsole.warn);
  console.info = recordConsole(originalConsole.info);
  console.debug = recordConsole(originalConsole.debug);
  try {
    await action();
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
    Object.assign(console, originalConsole);
  }
  return captured;
}

// The inventory is now a held value: cases that write the Docker configuration
// behind the application's back must read it, not what a previous case held.
beforeEach(() => {
  resetRefreshCache();
});

before(async () => {
  await writeDockerConfig({ auths: {} });
  anonymousRegistry = await startRegistry("registries-anon", false);
  authenticatedRegistry = await startRegistry("registries-auth", true);
  await pushFixtureRepository(anonymousRegistry.host, REPOSITORY_A, ALPINE_IMAGE, "v1");
  await pushFixtureRepository(anonymousRegistry.host, REPOSITORY_B, ALPINE_IMAGE, "v2");
});

after(async () => {
  // Belt and braces: a spec killed between logging in and its own `finally`
  // would otherwise leave a credential of ours in the host's credential store.
  await logoutQuietly(authenticatedRegistry.host);
  if (originalDockerConfig === undefined) delete process.env.DOCKER_CONFIG;
  else process.env.DOCKER_CONFIG = originalDockerConfig;
  await rm(configDir, { recursive: true, force: true });
});

// plan-docker_management_app/REQ-85 — configured registries are listed with their host, the
// authenticated account, the credential store in use and whether the session is authenticated;
// registries-endpoints.md — "200 -> RegistrySummary[] ... never a credential"
test("GET /api/registries lists the configured registries, the default index first and never a credential", async () => {
  const { url, close } = await startApp(app());
  const secret = "config-file-secret-value";
  try {
    await writeDockerConfig({
      auths: { "ghcr.io": { auth: Buffer.from(`octocat:${secret}`).toString("base64") } },
    });

    const { status, body, text } = await getJson<RegistrySummary[]>(url, "/api/registries");

    assert.equal(status, 200);
    assert.ok(Array.isArray(body), "the inventory must be a list");
    // The default index is always part of the inventory, logged in or not, and comes first.
    assert.equal(body[0]!.host, "docker.io");
    assert.equal(body[0]!.official, true);
    assert.equal(body[0]!.serverUrl, "https://index.docker.io/v1/");

    const ghcr = body.find((registry) => registry.host === "ghcr.io");
    assert.ok(ghcr, "a registry the configuration holds a credential for must be listed");
    assert.equal(ghcr!.authenticated, true);
    assert.equal(ghcr!.account, "octocat");
    assert.equal(typeof ghcr!.secure, "boolean");

    // REQ-87 — no credential comes back, in any field, under any name.
    assert.ok(!text.includes(secret), "the inventory must not carry a credential");
    assert.ok(!/"(secret|password|auth|identitytoken)"\s*:/i.test(text), `an inventory answer must expose no credential field: ${text}`);
  } finally {
    await writeDockerConfig({ auths: {} });
    await close();
  }
});

// plan-docker_management_app/REQ-85 — "whether the session is authenticated"
test("GET /api/registries reports a registry with no credential as not authenticated and with no account", async () => {
  const { url, close } = await startApp(app());
  try {
    await writeDockerConfig({ auths: {} });

    const { body } = await getJson<RegistrySummary[]>(url, "/api/registries");
    const hub = body.find((registry) => registry.host === "docker.io");

    assert.ok(hub);
    assert.equal(hub!.authenticated, false);
    assert.equal(hub!.account, undefined);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-86 — repositories reachable from a selected registry can be
// browsed; registries-endpoints.md — "200 -> RepositorySummary[]"
test("GET /api/registries/repositories lists the repositories of the selected registry", async () => {
  const { url, close } = await startApp(app());
  try {
    const { status, body } = await getJson<RepositorySummary[]>(
      url,
      `/api/registries/repositories?host=${encodeURIComponent(anonymousRegistry.host)}`,
    );

    assert.equal(status, 200);
    const names = body.map((repository) => repository.name);
    assert.ok(names.includes(REPOSITORY_A), `expected ${REPOSITORY_A} among ${names.join(", ")}`);
    assert.ok(names.includes(REPOSITORY_B), `expected ${REPOSITORY_B} among ${names.join(", ")}`);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-86 — repositories "can be browsed and searched"
test("GET /api/registries/repositories searches the registry on the given term", async () => {
  const { url, close } = await startApp(app());
  try {
    const matching = await getJson<RepositorySummary[]>(
      url,
      `/api/registries/repositories?host=${encodeURIComponent(anonymousRegistry.host)}&query=${encodeURIComponent("HELLO")}`,
    );
    const missing = await getJson<RepositorySummary[]>(
      url,
      `/api/registries/repositories?host=${encodeURIComponent(anonymousRegistry.host)}&query=no-such-repository-here`,
    );

    // The term matches case-insensitively, and only what it matches comes back.
    assert.deepEqual(
      matching.body.map((repository) => repository.name),
      [REPOSITORY_B],
    );
    assert.deepEqual(missing.body, []);
  } finally {
    await close();
  }
});

// registries-endpoints.md — "limit is clamped: absent, unparseable or non-positive falls back to 25"
test("GET /api/registries/repositories bounds the answer by limit, and falls back rather than answering nothing", async () => {
  const { url, close } = await startApp(app());
  const base = `/api/registries/repositories?host=${encodeURIComponent(anonymousRegistry.host)}&query=${encodeURIComponent(`vexel-test-reg-${RUN_ID}`)}`;
  try {
    const bounded = await getJson<RepositorySummary[]>(url, `${base}&limit=1`);
    const nonPositive = await getJson<RepositorySummary[]>(url, `${base}&limit=0`);
    const unparseable = await getJson<RepositorySummary[]>(url, `${base}&limit=not-a-number`);

    assert.equal(bounded.body.length, 1);
    assert.equal(nonPositive.body.length, 2, "a non-positive limit falls back to the default, it does not answer nothing");
    assert.equal(unparseable.body.length, 2, "an unparseable limit falls back to the default");
  } finally {
    await close();
  }
});

// registries-endpoints.md — "400 -> no host"
test("GET /api/registries/repositories without a host is rejected with 400", async () => {
  const { url, close } = await startApp(app());
  try {
    const { status, body } = await getJson<{ error?: string }>(url, "/api/registries/repositories");

    assert.equal(status, 400);
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-86 — tags "with each tag's size shown, and a tag can be pulled
// directly from the result"; registry-catalog-service.md — "each tag's size summed from its
// manifest" and the pull reference "host/repository:tag"
test("GET /api/registries/tags lists a repository's tags with their size and the reference each is pulled by", async () => {
  const { url, close } = await startApp(app());
  try {
    const { status, body } = await getJson<TagSummary[]>(
      url,
      `/api/registries/tags?host=${encodeURIComponent(anonymousRegistry.host)}&repository=${encodeURIComponent(REPOSITORY_A)}`,
    );

    assert.equal(status, 200);
    const tag = body.find((entry) => entry.name === "v1");
    assert.ok(tag, `expected the pushed tag among ${body.map((entry) => entry.name).join(", ")}`);
    assert.ok(typeof tag!.sizeBytes === "number" && tag!.sizeBytes > 0, `expected a size for the tag, got ${String(tag!.sizeBytes)}`);
    assert.equal(tag!.pullReference, `${anonymousRegistry.host}/${REPOSITORY_A}:v1`);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-86 — "a tag can be pulled directly from the result": the reference
// the server names for a tag is one the daemon actually pulls by. The pulled tag is removed again.
test("the pull reference a tag carries is the reference the daemon pulls that tag by", async () => {
  const { url, close } = await startApp(app());
  let pulled: string | undefined;
  try {
    const { body } = await getJson<TagSummary[]>(
      url,
      `/api/registries/tags?host=${encodeURIComponent(anonymousRegistry.host)}&repository=${encodeURIComponent(REPOSITORY_A)}`,
    );
    const reference = body.find((entry) => entry.name === "v1")!.pullReference;

    await execFileAsync("docker", ["pull", reference]);
    pulled = reference;

    const { stdout } = await execFileAsync("docker", ["image", "inspect", reference, "--format", "{{.Id}}"]);
    assert.ok(stdout.trim().length > 0, "the pulled reference must name a local image");
  } finally {
    if (pulled) await execFileAsync("docker", ["rmi", "-f", pulled]).catch(() => undefined);
    await close();
  }
});

// registries-endpoints.md — "400 -> no host, or no repository"
test("GET /api/registries/tags without a repository is rejected with 400", async () => {
  const { url, close } = await startApp(app());
  try {
    const { status } = await getJson<{ error?: string }>(url, `/api/registries/tags?host=${encodeURIComponent(anonymousRegistry.host)}`);

    assert.equal(status, 400);
  } finally {
    await close();
  }
});

test("GET /api/registries/tags without a host is rejected with 400", async () => {
  const { url, close } = await startApp(app());
  try {
    const { status } = await getJson<{ error?: string }>(url, "/api/registries/tags?repository=team%2Fapi");

    assert.equal(status, 400);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-87 — the application never reads a credential back, so browsing is
// anonymous; registry-catalog-service.md — a registry that hides itself from an anonymous client
// "stays out of reach and says so"; registries-endpoints.md — "502 -> ... requires credentials the
// application does not hold"
test("GET /api/registries/repositories reports a registry that refuses an anonymous client, rather than an empty list", async () => {
  const { url, close } = await startApp(app());
  try {
    const { status, body } = await getJson<{ error?: string }>(
      url,
      `/api/registries/repositories?host=${encodeURIComponent(authenticatedRegistry.host)}`,
    );

    assert.equal(status, 502);
    assert.match(body.error ?? "", /credentials this application does not hold/);
    assert.match(body.error ?? "", new RegExp(authenticatedRegistry.host.replace(".", "\\.")));
  } finally {
    await close();
  }
});

// registries-endpoints.md — "400 -> a missing or empty host, username or secret"
test("POST /api/registries/login is rejected with 400 when the host, the username or the secret is missing", async () => {
  const { url, close } = await startApp(app());
  try {
    const noHost = await postJson(url, "/api/registries/login", { username: "octocat", secret: "s3cret" });
    const blankHost = await postJson(url, "/api/registries/login", { host: "   ", username: "octocat", secret: "s3cret" });
    const noUsername = await postJson(url, "/api/registries/login", { host: "ghcr.io", secret: "s3cret" });
    const blankUsername = await postJson(url, "/api/registries/login", { host: "ghcr.io", username: " ", secret: "s3cret" });
    const noSecret = await postJson(url, "/api/registries/login", { host: "ghcr.io", username: "octocat" });
    const emptySecret = await postJson(url, "/api/registries/login", { host: "ghcr.io", username: "octocat", secret: "" });

    for (const [name, response] of Object.entries({ noHost, blankHost, noUsername, blankUsername, noSecret, emptySecret })) {
      assert.equal(response.status, 400, `${name} should be refused with 400, got ${response.status}`);
    }
  } finally {
    await close();
  }
});

// registries-endpoints.md — "400 -> a missing or empty host" on logout
test("POST /api/registries/logout without a host is rejected with 400", async () => {
  const { url, close } = await startApp(app());
  try {
    const missing = await postJson(url, "/api/registries/logout", {});
    const blank = await postJson(url, "/api/registries/logout", { host: "  " });

    assert.equal(missing.status, 400);
    assert.equal(blank.status, 400);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-87 — a refused credential must reach the operator as Docker's own
// message and carry no trace of the secret, in the body, in the process output or on disk.
// registries-endpoints.md — "502 -> the registry refused the credential; the message never contains
// the secret."
test("POST /api/registries/login with a wrong secret answers 502 with the registry's own refusal, and the secret nowhere", async () => {
  const { url, close } = await startApp(app());
  const wrongSecret = "definitely-not-the-fixture-password";
  try {
    let response: { status: number; text: string } | undefined;
    const output = await captureProcessOutput(async () => {
      response = await postJson(url, "/api/registries/login", {
        host: authenticatedRegistry.host,
        username: FIXTURE_USERNAME,
        secret: wrongSecret,
      });
    });

    assert.equal(response!.status, 502);
    const body = JSON.parse(response!.text) as { error?: string };
    // Docker's own message reaches the operator: the registry refused the credential.
    assert.ok(typeof body.error === "string" && body.error.length > 0, "the refusal must be reported");
    assert.match(body.error!, /401|unauthorized|denied|incorrect|failed/i);
    // ...and it carries no trace of what was typed.
    assert.ok(!response!.text.includes(wrongSecret), `the refusal answer must not carry the secret: ${response!.text}`);
    assert.ok(!output.includes(wrongSecret), "the secret must appear in no line the server writes out");

    // Nothing was stored: the registry is still not authenticated.
    const { body: registries } = await getJson<RegistrySummary[]>(url, "/api/registries");
    const fixture = registries.find((registry) => registry.host === authenticatedRegistry.host);
    assert.ok(fixture === undefined || fixture.authenticated === false, "a refused login must leave no credential behind");
  } finally {
    await logoutQuietly(authenticatedRegistry.host);
    await close();
  }
});

// plan-docker_management_app/REQ-85 — "a registry can be logged in to and logged out of";
// plan-docker_management_app/REQ-87 — the credential goes to the host's Docker credential store and
// is never displayed back nor persisted by the application itself.
test("POST /api/registries/login logs in through the host credential store, answers with the state alone, and logout drops it", async () => {
  const { url, close } = await startApp(app());
  const dataDir = process.env.VEXEL_DATA_DIR ?? "";
  try {
    let loginResponse: { status: number; text: string } | undefined;
    const output = await captureProcessOutput(async () => {
      loginResponse = await postJson(url, "/api/registries/login", {
        host: authenticatedRegistry.host,
        username: FIXTURE_USERNAME,
        secret: FIXTURE_SECRET,
      });
    });

    assert.equal(loginResponse!.status, 200, `login failed: ${loginResponse!.text}`);
    const summary = JSON.parse(loginResponse!.text) as RegistrySummary;
    assert.equal(summary.host, authenticatedRegistry.host);
    assert.equal(summary.authenticated, true);
    assert.equal(summary.account, FIXTURE_USERNAME);
    assert.equal(summary.official, false);
    // A loopback registry is reached over plain http, exactly as Docker does.
    assert.equal(summary.secure, false);

    // REQ-87 — the secret comes back from nowhere and is written nowhere by this application.
    assert.ok(!loginResponse!.text.includes(FIXTURE_SECRET), "the login answer must not carry the secret");
    assert.ok(!output.includes(FIXTURE_SECRET), "the secret must appear in no line the server writes out");
    const inventory = await getJson<RegistrySummary[]>(url, "/api/registries");
    assert.ok(!inventory.text.includes(FIXTURE_SECRET), "no endpoint may hand the secret back");
    const listed = inventory.body.find((registry) => registry.host === authenticatedRegistry.host);
    assert.ok(listed, "the registry just logged in to must be listed");
    assert.equal(listed!.authenticated, true);
    assert.equal(listed!.account, FIXTURE_USERNAME);
    if (dataDir !== "") {
      const offender = await fileCarryingSecret(dataDir, FIXTURE_SECRET);
      assert.equal(offender, undefined, `the application's own data directory must hold no credential, found one in ${offender}`);
    }

    // plan-docker_management_app/REQ-85 — and the registry can be logged out of again.
    const logoutResponse = await postJson(url, "/api/registries/logout", { host: authenticatedRegistry.host });
    assert.equal(logoutResponse.status, 200, `logout failed: ${logoutResponse.text}`);
    const afterLogout = JSON.parse(logoutResponse.text) as RegistrySummary;
    assert.equal(afterLogout.authenticated, false);
    assert.equal(afterLogout.account, undefined);

    const reread = await getJson<RegistrySummary[]>(url, "/api/registries");
    const stillThere = reread.body.find((registry) => registry.host === authenticatedRegistry.host);
    assert.ok(stillThere === undefined || stillThere.authenticated === false, "the credential must be gone from the store after a logout");
  } finally {
    await logoutQuietly(authenticatedRegistry.host);
    await close();
  }
});

// plan-docker_management_app/REQ-87 — the secret travels in the request body only: never in a URL,
// a query string or a path, which are the parts of a request that get logged.
test("no registry endpoint accepts a secret anywhere but a request body", async () => {
  const { url, close } = await startApp(app());
  try {
    // A secret smuggled onto the query string of the browsing endpoints changes nothing: they take
    // no such parameter, and the answer is the anonymous one either way.
    const { status } = await getJson<RepositorySummary[]>(
      url,
      `/api/registries/repositories?host=${encodeURIComponent(anonymousRegistry.host)}&secret=${encodeURIComponent(FIXTURE_SECRET)}&password=${encodeURIComponent(FIXTURE_SECRET)}`,
    );
    assert.equal(status, 200);

    // The authenticated registry stays out of reach: no query-string credential widens a browse.
    const refused = await getJson<{ error?: string }>(
      url,
      `/api/registries/repositories?host=${encodeURIComponent(authenticatedRegistry.host)}&username=${FIXTURE_USERNAME}&secret=${encodeURIComponent(FIXTURE_SECRET)}`,
    );
    assert.equal(refused.status, 502);
    assert.ok(!refused.text.includes(FIXTURE_SECRET), "the failure must not echo back what was passed");
  } finally {
    await close();
  }
});
