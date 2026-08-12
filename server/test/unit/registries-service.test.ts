import { test, mock, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// RegistriesService reads the local Docker configuration, asks the daemon for
// its registry settings and delegates log in / log out to the CLI channel
// (registries/specs/registries-service.md). Both of those channels are mocked
// here: what is under test is the service's own derivations (host
// normalization, account, credential store, authentication state, plain http,
// ordering), the arguments a login is delegated with, and — above all — that no
// secret ever leaves this service (REQ-87). The Docker configuration itself is
// a real file, in a throwaway directory pointed at by DOCKER_CONFIG, so the
// operator's own `~/.docker` is neither read nor written.
interface FakeResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  spawnError?: string;
}

interface RecordedCall {
  command: string;
  args: string[];
  stdin?: string;
}

let handler: (command: string, args: string[]) => FakeResult = () => ({ stdout: "", exitCode: 0 });
const calls: RecordedCall[] = [];

mock.module(new URL("../../src/docker/cli-runner.ts", import.meta.url).href, {
  namedExports: {
    runCliCommand: (command: string, args: string[], _endpoint: unknown, options: { stdin?: string } = {}) => {
      calls.push({ command, args, stdin: options.stdin });
      const { stdout = "", stderr = "", exitCode = 0, spawnError } = handler(command, args);
      return {
        cancel: () => undefined,
        onStdout: (listener: (chunk: string) => void) => {
          if (stdout) listener(stdout);
        },
        onStderr: (listener: (chunk: string) => void) => {
          if (stderr) listener(stderr);
        },
        onSpawnError: (listener: (message: string) => void) => {
          if (spawnError) listener(spawnError);
        },
        done: Promise.resolve({ exitCode }),
      };
    },
    detectCliAvailability: async () => ({
      docker: { available: true },
      compose: { available: true },
      buildx: { available: true },
    }),
  },
});

let indexConfigs: Record<string, { Name?: string; Secure?: boolean; Official?: boolean }> = {};
let daemonReachable = true;

mock.module(new URL("../../src/docker/engine-client.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async () => {
        if (!daemonReachable) throw new Error("cannot reach the Docker daemon");
        return { status: 200, body: JSON.stringify({ RegistryConfig: { IndexConfigs: indexConfigs } }) };
      },
    }),
  },
});

const { listRegistries, getRegistry, loginToRegistry, logoutFromRegistry, isDockerHub, normalizeRegistryHost } = await import(
  "../../src/registries/registries-service.js"
);
const { DockerDaemonError } = await import("../../src/docker/errors.js");

const configDir = await mkdtemp(join(tmpdir(), "vexel-test-registries-cfg-"));
const originalDockerConfig = process.env.DOCKER_CONFIG;
process.env.DOCKER_CONFIG = configDir;

/** Writes the throwaway Docker configuration the next reading will see. */
async function writeDockerConfig(config: unknown): Promise<void> {
  await writeFile(join(configDir, "config.json"), typeof config === "string" ? config : JSON.stringify(config), "utf8");
}

/** The `auth` value Docker records for a username/secret pair in the configuration file. */
function authValue(username: string, secret: string): string {
  return Buffer.from(`${username}:${secret}`).toString("base64");
}

/** Answers a credential helper's `list` verb with the given server URL -> username map. */
function helperListing(byHelper: Record<string, Record<string, string>>): (command: string, args: string[]) => FakeResult {
  return (command, args) => {
    const helper = command.startsWith("docker-credential-") ? command.slice("docker-credential-".length) : undefined;
    if (helper !== undefined && args[0] === "list") {
      const listing = byHelper[helper];
      if (listing === undefined) return { stderr: `${command}: not found`, spawnError: `spawn ${command} ENOENT`, exitCode: 1 };
      return { stdout: JSON.stringify(listing), exitCode: 0 };
    }
    return { stdout: "", exitCode: 0 };
  };
}

function summaryFor<T extends { host: string }>(summaries: T[], host: string): T {
  const found = summaries.find((summary) => summary.host === host);
  assert.ok(found, `expected ${host} in the inventory`);
  return found!;
}

function callTo(command: string, subcommand: string): RecordedCall {
  const found = calls.find((call) => call.command === command && call.args[0] === subcommand);
  assert.ok(found, `expected a \`${command} ${subcommand}\` call`);
  return found!;
}

beforeEach(async () => {
  calls.length = 0;
  handler = () => ({ stdout: "", exitCode: 0 });
  indexConfigs = {};
  daemonReachable = true;
  await writeDockerConfig({});
});

after(async () => {
  if (originalDockerConfig === undefined) delete process.env.DOCKER_CONFIG;
  else process.env.DOCKER_CONFIG = originalDockerConfig;
  await rm(configDir, { recursive: true, force: true });
});

// registries-service.md — "scheme and path dropped, lower-cased, every alias of the default index
// collapsed onto docker.io"
test("normalizeRegistryHost drops the scheme and path, lower-cases, and collapses every default-index alias", () => {
  assert.equal(normalizeRegistryHost("https://ghcr.io/myorg"), "ghcr.io");
  assert.equal(normalizeRegistryHost("http://Registry.Internal:5000"), "registry.internal:5000");
  assert.equal(normalizeRegistryHost("index.docker.io"), "docker.io");
  assert.equal(normalizeRegistryHost("https://index.docker.io/v1/"), "docker.io");
  assert.equal(normalizeRegistryHost("registry-1.docker.io"), "docker.io");
  assert.equal(normalizeRegistryHost("registry.hub.docker.com"), "docker.io");
});

// registries-service.md — "normalizeRegistryHost resolves an empty value to the default index,
// because that is how Docker's own configuration writes it"
test("normalizeRegistryHost resolves a value naming no host to the default index", () => {
  assert.equal(normalizeRegistryHost(""), "docker.io");
  assert.equal(normalizeRegistryHost("   "), "docker.io");
  assert.equal(normalizeRegistryHost("https://"), "docker.io");
  assert.equal(normalizeRegistryHost("/"), "docker.io");
});

test("isDockerHub recognises every alias of the default index and nothing else", () => {
  assert.equal(isDockerHub("docker.io"), true);
  assert.equal(isDockerHub("https://index.docker.io/v1/"), true);
  assert.equal(isDockerHub("ghcr.io"), false);
  assert.equal(isDockerHub("registry.internal:5000"), false);
});

// registries-service.md — "The default index is always part of the inventory, logged in or not,
// and comes first; the rest follow in alphabetical order of host."
test("listRegistries always lists the default index first, then the rest in alphabetical order", async () => {
  await writeDockerConfig({ auths: { "ghcr.io": {}, "registry.internal:5000": {}, "a-registry.example": {} } });

  const registries = await listRegistries();

  assert.equal(registries[0]!.host, "docker.io");
  assert.equal(registries[0]!.official, true);
  assert.deepEqual(
    registries.slice(1).map((registry) => registry.host),
    ["a-registry.example", "ghcr.io", "registry.internal:5000"],
  );
});

// registries-service.md — "Within each group, entries are ordered by host under the list-order rule
// (compareNames)": digit runs in a host read as numbers (REQ-23).
test("listRegistries reads digit runs in a host as numbers", async () => {
  await writeDockerConfig({ auths: { "registry-10.example": {}, "registry-2.example": {}, "registry-3.example": {} } });

  const registries = await listRegistries();

  assert.deepEqual(
    registries.slice(1).map((registry) => registry.host),
    ["registry-2.example", "registry-3.example", "registry-10.example"],
  );
});

// registries-service.md — "the official group being compared before anything else", "a registry
// carries no identifier other than its host, so the final comparison is that same host compared
// exactly, and the same configuration produces the same sequence on every read" (REQ-24, REQ-25,
// REQ-6).
//
// The two `registry-…` hosts tie under the name comparison (leading zeros), so only the exact
// comparison of that same host separates them; `a-registry.example` sorts ahead of the default
// index by name, so a flattened official group would show at once.
test("listRegistries keeps the default index first and produces one sequence for tying hosts, in either configuration order", async () => {
  const hosts = ["registry-1.example", "a-registry.example", "registry-01.example"];
  const expected = ["docker.io", "a-registry.example", "registry-01.example", "registry-1.example"];
  const authsFor = (order: string[]) => Object.fromEntries(order.map((host) => [host, {}]));

  await writeDockerConfig({ auths: authsFor(hosts) });
  const asConfigured = (await listRegistries()).map((registry) => registry.host);

  await writeDockerConfig({ auths: authsFor([...hosts].reverse()) });
  const reversed = (await listRegistries()).map((registry) => registry.host);

  assert.equal(asConfigured[0], "docker.io", "the default index comes first whatever its host sorts as");
  assert.deepEqual(asConfigured, expected);
  assert.deepEqual(reversed, expected, "the same configuration must come out the same way in either order");
});

// registries-service.md — "normalizeRegistryHost resolves an empty value to the default index,
// because that is how Docker's own configuration writes it": the inventory path must keep reading
// such a key as the default index, and must not gain the acting operations' refusal.
test("listRegistries still reads an empty configuration key as the default index", async () => {
  await writeDockerConfig({ auths: { "": { auth: authValue("octocat", "s3cret") } } });

  const registries = await listRegistries();

  assert.deepEqual(
    registries.map((registry) => registry.host),
    ["docker.io"],
  );
  assert.equal(registries[0]!.authenticated, true);
  assert.equal(registries[0]!.account, "octocat");
  assert.equal(registries[0]!.official, true);
  assert.equal(registries[0]!.serverUrl, "https://index.docker.io/v1/");
});

// The same, for the credential-store keys and the daemon's index configuration: a key naming no
// host is the default index there too, not a registry of its own.
test("listRegistries reads an empty credential-store key and an empty index key as the default index", async () => {
  await writeDockerConfig({ auths: { "": {} }, credsStore: "osxkeychain" });
  handler = helperListing({ osxkeychain: { "https://index.docker.io/v1/": "octocat" } });
  indexConfigs = { "https://index.docker.io/v1/": { Name: "docker.io", Secure: true, Official: true } };

  const registries = await listRegistries();

  assert.deepEqual(
    registries.map((registry) => registry.host),
    ["docker.io"],
  );
  assert.equal(registries[0]!.authenticated, true);
  assert.equal(registries[0]!.account, "octocat");
});

test("listRegistries lists the default index even when nothing at all is configured", async () => {
  await writeDockerConfig({});

  const registries = await listRegistries();

  assert.deepEqual(
    registries.map((registry) => registry.host),
    ["docker.io"],
  );
  assert.equal(registries[0]!.authenticated, false);
});

// registries-service.md — "serverUrl is the key Docker itself records the registry under —
// https://index.docker.io/v1/ for the default index, the host for anything else"
test("listRegistries reports the server URL Docker records each registry under", async () => {
  await writeDockerConfig({ auths: { "ghcr.io": {} } });

  const registries = await listRegistries();

  assert.equal(summaryFor(registries, "docker.io").serverUrl, "https://index.docker.io/v1/");
  assert.equal(summaryFor(registries, "ghcr.io").serverUrl, "ghcr.io");
});

// registries-service.md — "authenticated is true when a credential exists for the registry: either
// the configuration file holds one" and "account? is the username that credential is held under"
test("listRegistries reports a credential held in the configuration file as authenticated, under its username", async () => {
  await writeDockerConfig({ auths: { "ghcr.io": { auth: authValue("octocat", "ghp_the_secret_value") } } });

  const registry = summaryFor(await listRegistries(), "ghcr.io");

  assert.equal(registry.authenticated, true);
  assert.equal(registry.account, "octocat");
});

// registries-service.md — "The application never holds, stores or displays a credential (REQ-87)";
// "the rest is dropped on the spot and nothing keeps a reference to it"
test("listRegistries never carries the secret of a configuration-file credential in any field", async () => {
  const secret = "ghp_the_secret_value";
  await writeDockerConfig({ auths: { "ghcr.io": { auth: authValue("octocat", secret) } } });

  const registries = await listRegistries();

  assert.ok(!JSON.stringify(registries).includes(secret), "the secret must appear in no field of the inventory");
});

// registries-service.md — "credentialStore names the credential helper backing the registry (the
// per-registry credHelpers entry, else the global credsStore); absent when the credential sits in
// the Docker configuration file itself"
test("listRegistries names the per-registry credential helper in preference to the global one", async () => {
  await writeDockerConfig({
    auths: { "ghcr.io": {}, "registry.internal:5000": {} },
    credsStore: "osxkeychain",
    credHelpers: { "ghcr.io": "gh-helper" },
  });
  handler = helperListing({ "gh-helper": { "ghcr.io": "octocat" }, osxkeychain: { "registry.internal:5000": "operator" } });

  const registries = await listRegistries();

  assert.equal(summaryFor(registries, "ghcr.io").credentialStore, "gh-helper");
  assert.equal(summaryFor(registries, "registry.internal:5000").credentialStore, "osxkeychain");
});

test("listRegistries reports no credential store when the credential sits in the configuration file", async () => {
  await writeDockerConfig({ auths: { "ghcr.io": { auth: authValue("octocat", "s3cret") } } });

  assert.equal(summaryFor(await listRegistries(), "ghcr.io").credentialStore, undefined);
});

// registries-service.md — "authenticated is true when ... the configured credential store reports
// one", the account coming from the helper's `list` verb (server URL -> username, no secret)
test("listRegistries takes the account from the credential helper's list verb", async () => {
  await writeDockerConfig({ auths: { "ghcr.io": {} }, credsStore: "osxkeychain" });
  handler = helperListing({ osxkeychain: { "https://ghcr.io": "octocat" } });

  const registry = summaryFor(await listRegistries(), "ghcr.io");

  assert.equal(registry.authenticated, true);
  assert.equal(registry.account, "octocat");
  // The helper is asked to `list` — never to `get`, which would hand this process the password.
  const helperCall = callTo("docker-credential-osxkeychain", "list");
  assert.deepEqual(helperCall.args, ["list"]);
  assert.ok(!calls.some((call) => call.command.startsWith("docker-credential-") && call.args.includes("get")), "no helper may be asked for a credential");
});

// registries-service.md — "account? ... absent otherwise — including for an identity-token
// credential, which Docker records under the placeholder <token> and which names nobody"
test("listRegistries reports an identity-token credential as authenticated with no account", async () => {
  await writeDockerConfig({ auths: { "ghcr.io": { auth: authValue("<token>", ""), identitytoken: "an-identity-token" } } });

  const registry = summaryFor(await listRegistries(), "ghcr.io");

  assert.equal(registry.authenticated, true);
  assert.equal(registry.account, undefined);
});

// registries-service.md — "A credential helper that is absent from PATH, or refuses, contributes no
// account: an unknown account is not a failed inventory."
test("listRegistries still answers when the credential helper is absent from PATH", async () => {
  await writeDockerConfig({ auths: { "ghcr.io": {} }, credsStore: "no-such-helper" });
  handler = helperListing({});

  const registries = await listRegistries();

  const registry = summaryFor(registries, "ghcr.io");
  assert.equal(registry.account, undefined);
  assert.equal(registry.credentialStore, "no-such-helper");
});

// registries-service.md — "An unreadable or malformed Docker configuration file yields an empty
// one: the inventory still lists the default index rather than failing."
test("listRegistries yields the default index alone when the configuration file is malformed", async () => {
  await writeDockerConfig("{ this is not json");

  const registries = await listRegistries();

  assert.deepEqual(
    registries.map((registry) => registry.host),
    ["docker.io"],
  );
});

// registries-service.md — "An unreachable daemon costs the secure reading its authoritative source,
// not the inventory: the registries of the configuration file are still listed."
test("listRegistries still lists the configured registries when the daemon is unreachable", async () => {
  daemonReachable = false;
  await writeDockerConfig({ auths: { "ghcr.io": {} } });

  const registries = await listRegistries();

  assert.deepEqual(
    registries.map((registry) => registry.host),
    ["docker.io", "ghcr.io"],
  );
});

// registries-service.md — "secure is false when the registry is reached over plain http: the
// daemon's own registry configuration says so"
test("listRegistries marks a registry the daemon reports as insecure with secure false", async () => {
  await writeDockerConfig({ auths: { "registry.internal:5000": {} } });
  indexConfigs = { "registry.internal:5000": { Name: "registry.internal:5000", Secure: false, Official: false } };

  assert.equal(summaryFor(await listRegistries(), "registry.internal:5000").secure, false);
});

test("listRegistries marks a registry the daemon reports as secure with secure true", async () => {
  await writeDockerConfig({ auths: { "registry.internal:5000": {} } });
  indexConfigs = { "registry.internal:5000": { Name: "registry.internal:5000", Secure: true, Official: false } };

  assert.equal(summaryFor(await listRegistries(), "registry.internal:5000").secure, true);
});

// registries-service.md — "a registry on the loopback interface (localhost, *.localhost, 127.*,
// ::1) is taken as insecure by default, exactly as Docker does"
test("listRegistries takes a loopback registry the daemon says nothing about as insecure", async () => {
  await writeDockerConfig({ auths: { "localhost:5000": {}, "dev.localhost:5000": {}, "127.0.0.1:5000": {}, "ghcr.io": {} } });

  const registries = await listRegistries();

  assert.equal(summaryFor(registries, "localhost:5000").secure, false);
  assert.equal(summaryFor(registries, "dev.localhost:5000").secure, false);
  assert.equal(summaryFor(registries, "127.0.0.1:5000").secure, false);
  // Anything that is not on the loopback interface stays secure by default.
  assert.equal(summaryFor(registries, "ghcr.io").secure, true);
});

// registries-service.md — "The default index is always part of the inventory" and the daemon's
// index configuration also lists registries the configuration file knows nothing about
test("listRegistries lists a registry the daemon knows about even when the configuration file does not", async () => {
  await writeDockerConfig({});
  indexConfigs = { "registry.internal:5000": { Name: "registry.internal:5000", Secure: false, Official: false } };

  const registry = summaryFor(await listRegistries(), "registry.internal:5000");

  assert.equal(registry.authenticated, false);
  assert.equal(registry.secure, false);
});

// registries-service.md — "getRegistry(host) ... a host the installation is not configured for
// resolves to an unauthenticated summary rather than a failure, so a registry can be browsed
// before any login"
test("getRegistry resolves an unconfigured host to an unauthenticated summary rather than failing", async () => {
  await writeDockerConfig({});

  const registry = await getRegistry("https://registry.unknown:5000/some/path");

  assert.equal(registry.host, "registry.unknown:5000");
  assert.equal(registry.authenticated, false);
  assert.equal(registry.account, undefined);
  assert.equal(registry.official, false);
});

test("getRegistry returns the inventory entry of a configured host", async () => {
  await writeDockerConfig({ auths: { "ghcr.io": { auth: authValue("octocat", "s3cret") } } });

  const registry = await getRegistry("GHCR.IO");

  assert.equal(registry.host, "ghcr.io");
  assert.equal(registry.authenticated, true);
  assert.equal(registry.account, "octocat");
});

// registries-service.md — "It is written to the CLI's standard input on the way in"; "A secret never
// appears in argv (where ps would show it)" (REQ-87)
test("loginToRegistry hands the secret to the CLI on standard input and never in argv", async () => {
  const secret = "correct-horse-battery-staple";
  await writeDockerConfig({});
  handler = () => ({ stdout: "Login Succeeded", exitCode: 0 });

  await loginToRegistry({ host: "ghcr.io", username: "octocat", secret });

  const login = callTo("docker", "login");
  assert.ok(!login.args.includes(secret), `the secret must not be an argument: ${login.args.join(" ")}`);
  assert.ok(!login.args.join(" ").includes(secret), "the secret must appear nowhere in argv");
  assert.equal(login.stdin, secret);
  assert.ok(login.args.includes("--password-stdin"), "the CLI must be told to read the secret from standard input");
  assert.ok(login.args.includes("octocat"), "the username is the one argument that does belong on the command line");
});

// registries-service.md — "Resolves with the registry's resulting state (authenticated, with its
// account)" and "No secret is ever part of the result, in any field"
test("loginToRegistry resolves with the registry's resulting state and no secret in it", async () => {
  const secret = "correct-horse-battery-staple";
  handler = (command, args) => {
    if (command === "docker" && args[0] === "login") return { stdout: "Login Succeeded", exitCode: 0 };
    return helperListing({ osxkeychain: { "https://ghcr.io": "octocat" } })(command, args);
  };
  await writeDockerConfig({ auths: { "ghcr.io": {} }, credsStore: "osxkeychain" });

  const registry = await loginToRegistry({ host: "ghcr.io", username: "octocat", secret });

  assert.equal(registry.host, "ghcr.io");
  assert.equal(registry.authenticated, true);
  assert.equal(registry.account, "octocat");
  assert.ok(!JSON.stringify(registry).includes(secret), "the resulting state must carry no secret");
});

// registries-service.md — "Rejects with an empty username or an empty secret."
test("loginToRegistry rejects an empty username without running anything", async () => {
  await assert.rejects(() => loginToRegistry({ host: "ghcr.io", username: "   ", secret: "s3cret" }), DockerDaemonError);
  assert.ok(!calls.some((call) => call.args[0] === "login"), "nothing may be delegated for an empty username");
});

test("loginToRegistry rejects an empty secret without running anything", async () => {
  await assert.rejects(() => loginToRegistry({ host: "ghcr.io", username: "octocat", secret: "" }), DockerDaemonError);
  assert.ok(!calls.some((call) => call.args[0] === "login"), "nothing may be delegated for an empty secret");
});

// registries-service.md — "Rejects a host that is empty or starts with -."
test("loginToRegistry rejects a host that would be read as an option by the CLI", async () => {
  await assert.rejects(() => loginToRegistry({ host: "--config", username: "octocat", secret: "s3cret" }), DockerDaemonError);
  assert.ok(!calls.some((call) => call.args[0] === "login"), "nothing may be delegated for an option-shaped host");
});

// registries-service.md — "Rejects a host that names no registry — empty, blank, or reduced to
// nothing once its scheme and path are dropped ... Such a host is never resolved to the default
// index: a blank host is a refusal, not a login to Docker Hub (REQ-87)."
test("loginToRegistry rejects a host that names no registry instead of logging in to Docker Hub", async () => {
  const secret = "the-operators-real-password";
  for (const host of ["", "   ", "https://", "http://", "/", "https:///v1/"]) {
    calls.length = 0;
    await assert.rejects(
      () => loginToRegistry({ host, username: "octocat", secret }),
      DockerDaemonError,
      `"${host}" names no registry and must be refused`,
    );
    assert.equal(calls.length, 0, `nothing may be delegated for the host "${host}"`);
  }
});

test("loginToRegistry never hands the secret to the default index for a host that names no registry", async () => {
  const secret = "the-operators-real-password";
  handler = () => ({ stdout: "Login Succeeded", exitCode: 0 });

  await assert.rejects(() => loginToRegistry({ host: "  ", username: "octocat", secret }), DockerDaemonError);

  assert.ok(
    !calls.some((call) => call.args.includes("docker.io") || call.stdin === secret),
    `a blank host must not turn into a login to the default index: ${JSON.stringify(calls)}`,
  );
});

// registries-service.md — "A refusal by the registry rejects with the CLI's own message, with every
// occurrence of the secret replaced by a fixed marker first" (REQ-87)
test("loginToRegistry rejects a refusal with the CLI's own message, the secret replaced by a marker", async () => {
  const secret = "correct-horse-battery-staple";
  handler = () => ({ stderr: "Error response from daemon: login attempt failed with status: 401 Unauthorized", exitCode: 1 });

  await assert.rejects(
    () => loginToRegistry({ host: "ghcr.io", username: "octocat", secret }),
    (error: unknown) => {
      assert.ok(error instanceof DockerDaemonError, "expected a DockerDaemonError");
      assert.equal(error.code, "DaemonRejected");
      assert.match(error.message, /401 Unauthorized/);
      assert.ok(!error.message.includes(secret), "the refusal must not carry the secret");
      return true;
    },
  );
});

// The adversarial case the rule exists for: a CLI that echoes the secret back in its own error.
// registries-service.md — "everything leaving the CLI channel is redacted against the secret first"
test("loginToRegistry redacts the secret even when the CLI itself echoes it back in the failure", async () => {
  const secret = "correct-horse-battery-staple";
  handler = () => ({ stderr: `denied: the password "${secret}" was rejected for octocat (${secret})`, exitCode: 1 });

  await assert.rejects(
    () => loginToRegistry({ host: "ghcr.io", username: "octocat", secret }),
    (error: unknown) => {
      assert.ok(error instanceof DockerDaemonError);
      assert.ok(!error.message.includes(secret), `the echoed secret must be redacted, got: ${error.message}`);
      assert.match(error.message, /denied/);
      return true;
    },
  );
});

test("loginToRegistry redacts the secret echoed back on standard output too", async () => {
  const secret = "correct-horse-battery-staple";
  handler = () => ({ stdout: `refused: ${secret}`, stderr: "", exitCode: 1 });

  await assert.rejects(
    () => loginToRegistry({ host: "ghcr.io", username: "octocat", secret }),
    (error: unknown) => {
      assert.ok(!(error as Error).message.includes(secret), `the echoed secret must be redacted, got: ${(error as Error).message}`);
      return true;
    },
  );
});

// registries-service.md — "A non-zero exit or a spawn failure of the CLI rejects with a
// DockerDaemonError (docker-access, code DaemonRejected), so the REST layer maps it to 502."
test("loginToRegistry rejects with a DaemonRejected error when the CLI cannot be spawned, without the secret", async () => {
  const secret = "correct-horse-battery-staple";
  handler = () => ({ spawnError: `spawn docker ENOENT (${secret})`, exitCode: 1 });

  await assert.rejects(
    () => loginToRegistry({ host: "ghcr.io", username: "octocat", secret }),
    (error: unknown) => {
      assert.ok(error instanceof DockerDaemonError);
      assert.equal(error.code, "DaemonRejected");
      assert.ok(!error.message.includes(secret), "a spawn failure must not carry the secret either");
      return true;
    },
  );
});

// registries-service.md — "logoutFromRegistry(host) ... Drops the stored credential through the CLI
// channel and resolves with the resulting state (no longer authenticated)."
test("logoutFromRegistry delegates the drop to the CLI and resolves with the resulting state", async () => {
  await writeDockerConfig({});
  handler = () => ({ stdout: "Removing login credentials for ghcr.io", exitCode: 0 });

  const registry = await logoutFromRegistry("https://ghcr.io/");

  const logout = callTo("docker", "logout");
  assert.deepEqual(logout.args, ["logout", "ghcr.io"]);
  assert.equal(registry.host, "ghcr.io");
  assert.equal(registry.authenticated, false);
});

test("logoutFromRegistry rejects a host that would be read as an option by the CLI", async () => {
  await assert.rejects(() => logoutFromRegistry("-rf"), DockerDaemonError);
  assert.ok(!calls.some((call) => call.args[0] === "logout"), "nothing may be delegated for an option-shaped host");
});

// registries-service.md — "Refuses the same hosts as loginToRegistry, on the same rule: the two
// agree on what a usable host is, so neither ever acts on a registry the caller did not name."
test("logoutFromRegistry refuses exactly the hosts loginToRegistry refuses", async () => {
  for (const host of ["", "   ", "https://", "http://", "/", "-x"]) {
    calls.length = 0;
    await assert.rejects(() => logoutFromRegistry(host), DockerDaemonError, `"${host}" names no registry and must be refused`);
    assert.equal(calls.length, 0, `nothing may be delegated for the host "${host}"`);
  }
});

// The refusal is about a host naming no registry, not about anything with a scheme or a path: a
// reference that does name one still resolves and acts.
test("logoutFromRegistry still accepts a host written with a scheme and a path", async () => {
  handler = () => ({ stdout: "Removing login credentials", exitCode: 0 });

  const registry = await logoutFromRegistry("https://GHCR.io/myorg");

  assert.deepEqual(callTo("docker", "logout").args, ["logout", "ghcr.io"]);
  assert.equal(registry.host, "ghcr.io");
});

test("logoutFromRegistry rejects with a DaemonRejected error when the CLI refuses", async () => {
  handler = () => ({ stderr: "not logged in to ghcr.io", exitCode: 1 });

  await assert.rejects(
    () => logoutFromRegistry("ghcr.io"),
    (error: unknown) => {
      assert.ok(error instanceof DockerDaemonError);
      assert.equal(error.code, "DaemonRejected");
      assert.match(error.message, /not logged in/);
      return true;
    },
  );
});
