import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contextsRouter } from "../../src/contexts/contexts-routes.js";
import type { ContextSummary } from "../../src/contexts/contexts-service.js";
import type { DaemonInfo } from "../../src/contexts/daemon-info-service.js";
import { defaultLocalSocket } from "../../src/docker/endpoint.js";
import { buildApp, startApp } from "../support/fixtures.js";
import { execFileAsync } from "../support/docker-cli.js";

const RUN_ID = `${process.pid}-${Date.now()}`;

// A Docker context is host-level configuration: it carries no label, so every
// fixture is recognised by its name alone and removed by the test that made it,
// pass or fail. No test here ever *selects* a context: `docker context use`
// rewrites machine-wide state the whole host sees at once, which no label can
// scope while the API files run in parallel, so the coverage of
// `POST /api/contexts/:name/use` lives in test/api/contexts-use-routes.test.ts.
function fixtureName(caseName: string): string {
  return `vexel-test-ctx-${caseName}-${RUN_ID}`;
}

async function removeContextQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["context", "rm", "-f", name]).catch(() => undefined);
}

async function fetchContexts(url: string): Promise<ContextSummary[]> {
  const response = await fetch(`${url}/api/contexts`);
  assert.equal(response.status, 200);
  return (await response.json()) as ContextSummary[];
}

async function postJson(url: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A TCP+TLS context of the kind this application no longer creates but must still list, select and dial: made outside the application, with real certificate files. */
async function createTlsContextQuietly(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vexel-test-ctx-tls-"));
  await execFileAsync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", join(dir, "key.pem"),
    "-out", join(dir, "cert.pem"),
    "-days", "1", "-subj", "/CN=vexel-test",
  ]);
  await execFileAsync("cp", [join(dir, "cert.pem"), join(dir, "ca.pem")]);
  await execFileAsync("docker", [
    "context", "create", name,
    "--docker", `host=tcp://198.51.100.7:2376,ca=${join(dir, "ca.pem")},cert=${join(dir, "cert.pem")},key=${join(dir, "key.pem")}`,
  ]);
  return dir;
}

/**
 * Removes any context this file left behind, whatever the run. A context carries
 * no label, so its name prefix is the only handle there is — and an aborted run
 * never reaches a test's own `finally`, which is exactly when a leftover appears.
 */
after(async () => {
  const { stdout } = await execFileAsync("docker", ["context", "ls", "--format", "{{.Name}}"]).catch(() => ({ stdout: "" }));
  const leftovers = stdout.split("\n").filter((name) => name.startsWith("vexel-test-ctx-"));
  for (const name of leftovers) await removeContextQuietly(name);
});

// plan-docker_management_app/REQ-92 — Docker contexts are listed with name, endpoint and which one
// is active
test("GET /api/contexts lists a created context with its name, description, endpoint and kind, not active", async () => {
  const name = fixtureName("list");
  const { url, close } = await startApp(buildApp("/api/contexts", contextsRouter));
  try {
    await execFileAsync("docker", ["context", "create", name, "--docker", "host=ssh://operator@build-host", "--description", "a listed fixture"]);

    const contexts = await fetchContexts(url);
    const found = contexts.find((context) => context.name === name);

    assert.ok(found, "the created context is not listed");
    assert.equal(found!.endpoint, "ssh://operator@build-host");
    assert.equal(found!.kind, "ssh");
    assert.equal(found!.description, "a listed fixture");
    assert.equal(found!.active, false);
    // "active marks the one context Docker currently has selected; at most one is active"
    assert.ok(contexts.filter((context) => context.active).length <= 1, "more than one context is marked active");
  } finally {
    await removeContextQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-92 — "whatever their endpoint kind"; contexts-service.md — "a
// TCP+TLS one created outside the application included: none is filtered out, and none is marked
// unsupported", with tls true when it carries TLS material
test("GET /api/contexts lists an externally created TCP+TLS context, with kind tcp and TLS material", async () => {
  const name = fixtureName("tls");
  const { url, close } = await startApp(buildApp("/api/contexts", contextsRouter));
  let certDir: string | undefined;
  try {
    certDir = await createTlsContextQuietly(name);

    const contexts = await fetchContexts(url);
    const found = contexts.find((context) => context.name === name);

    assert.ok(found, "an externally created TCP+TLS context must be listed like any other");
    assert.equal(found!.kind, "tcp");
    assert.equal(found!.endpoint, "tcp://198.51.100.7:2376");
    assert.equal(found!.tls, true);
  } finally {
    await removeContextQuietly(name);
    if (certDir) await rm(certDir, { recursive: true, force: true });
    await close();
  }
});

// plan-docker_management_app/REQ-92 — a context can be created for a local socket;
// contexts-service.md — "the endpoint is the default Docker socket of the machine running the
// server; the operator supplies no path"
test("POST /api/contexts creates a local-socket context pointing at the machine's own default socket", async () => {
  const name = fixtureName("create-local");
  const { url, close } = await startApp(buildApp("/api/contexts", contextsRouter));
  try {
    const response = await postJson(url, "/api/contexts", { name, kind: "local" });
    assert.equal(response.status, 201);
    const created = (await response.json()) as ContextSummary;

    const platformDefault = defaultLocalSocket();
    const expectedSocket = platformDefault.kind === "unix" ? platformDefault.socketPath : "";
    assert.equal(created.name, name);
    assert.equal(created.kind, "local");
    assert.equal(created.endpoint, `unix://${expectedSocket}`);

    const contexts = await fetchContexts(url);
    assert.ok(contexts.some((context) => context.name === name), "the created context is not listed");
  } finally {
    await removeContextQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-92 — a context can be created for an SSH endpoint;
// contexts-service.md — "the endpoint is ssh://<host>, the destination as typed (user@host)"
test("POST /api/contexts creates an SSH context whose endpoint is ssh://<destination>", async () => {
  const name = fixtureName("create-ssh");
  const { url, close } = await startApp(buildApp("/api/contexts", contextsRouter));
  try {
    const response = await postJson(url, "/api/contexts", { name, kind: "ssh", host: "operator@build-host" });
    assert.equal(response.status, 201);
    const created = (await response.json()) as ContextSummary;

    assert.equal(created.kind, "ssh");
    assert.equal(created.endpoint, "ssh://operator@build-host");
  } finally {
    await removeContextQuietly(name);
    await close();
  }
});

// contexts-service.md — "an ssh:// prefix the operator typed being accepted and not doubled"
test("POST /api/contexts accepts an ssh:// prefix the operator typed without doubling it", async () => {
  const name = fixtureName("create-ssh-prefixed");
  const { url, close } = await startApp(buildApp("/api/contexts", contextsRouter));
  try {
    const response = await postJson(url, "/api/contexts", { name, kind: "ssh", host: "ssh://operator@build-host" });
    assert.equal(response.status, 201);
    const created = (await response.json()) as ContextSummary;

    assert.equal(created.endpoint, "ssh://operator@build-host");
  } finally {
    await removeContextQuietly(name);
    await close();
  }
});

// contexts-endpoints.md — "400 -> name missing or blank"
test("POST /api/contexts with a blank name is rejected with 400", async () => {
  const { url, close } = await startApp(buildApp("/api/contexts", contextsRouter));
  try {
    const response = await postJson(url, "/api/contexts", { name: "   ", kind: "local" });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// contexts-endpoints.md — "400 -> kind absent or anything other than local/ssh, the message stating
// that a TCP+TLS context is created from the console and is then listed and usable like any other"
test("POST /api/contexts with a tcp kind is rejected with 400, pointing at the console", async () => {
  const name = fixtureName("create-tcp");
  const { url, close } = await startApp(buildApp("/api/contexts", contextsRouter));
  try {
    const response = await postJson(url, "/api/contexts", { name, kind: "tcp", host: "tcp://198.51.100.7:2376" });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string };
    assert.match(body.error ?? "", /console/i);

    const contexts = await fetchContexts(url);
    assert.ok(!contexts.some((context) => context.name === name), "a refused creation must create nothing");
  } finally {
    await removeContextQuietly(name);
    await close();
  }
});

test("POST /api/contexts with no kind at all is rejected with 400", async () => {
  const { url, close } = await startApp(buildApp("/api/contexts", contextsRouter));
  try {
    const response = await postJson(url, "/api/contexts", { name: fixtureName("no-kind") });

    assert.equal(response.status, 400);
  } finally {
    await close();
  }
});

// contexts-endpoints.md — "400 -> kind is ssh and host is missing or blank"
test("POST /api/contexts with the ssh kind and no destination is rejected with 400", async () => {
  const name = fixtureName("ssh-no-host");
  const { url, close } = await startApp(buildApp("/api/contexts", contextsRouter));
  try {
    const response = await postJson(url, "/api/contexts", { name, kind: "ssh", host: "  " });

    assert.equal(response.status, 400);
    const contexts = await fetchContexts(url);
    assert.ok(!contexts.some((context) => context.name === name), "a refused creation must create nothing");
  } finally {
    await removeContextQuietly(name);
    await close();
  }
});

// contexts-service.md — "Rejects with Docker's own message on a name collision";
// contexts-endpoints.md — "Any Docker/CLI-side failure on the above -> 502 ... Docker's own message"
test("POST /api/contexts with a colliding name answers 502 with Docker's own message", async () => {
  const name = fixtureName("collision");
  const { url, close } = await startApp(buildApp("/api/contexts", contextsRouter));
  try {
    await execFileAsync("docker", ["context", "create", name, "--docker", "host=ssh://operator@build-host"]);

    const response = await postJson(url, "/api/contexts", { name, kind: "ssh", host: "operator@build-host" });

    assert.equal(response.status, 502);
    const body = (await response.json()) as { error?: string };
    assert.match(body.error ?? "", /already exists/i);
  } finally {
    await removeContextQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-92 — a context can be removed
test("DELETE /api/contexts/:name removes the context so it no longer appears in the inventory", async () => {
  const name = fixtureName("remove");
  const { url, close } = await startApp(buildApp("/api/contexts", contextsRouter));
  try {
    await execFileAsync("docker", ["context", "create", name, "--docker", "host=ssh://operator@build-host"]);

    const response = await fetch(`${url}/api/contexts/${name}`, { method: "DELETE" });
    assert.equal(response.status, 204);

    const contexts = await fetchContexts(url);
    assert.ok(!contexts.some((context) => context.name === name));
  } finally {
    await removeContextQuietly(name);
    await close();
  }
});

// contexts-service.md — "removeContext ... Rejects with Docker's own message when the context cannot
// be removed"
test("DELETE /api/contexts/:name for an unknown context answers with Docker's own message", async () => {
  const { url, close } = await startApp(buildApp("/api/contexts", contextsRouter));
  try {
    const response = await fetch(`${url}/api/contexts/${fixtureName("unknown")}`, { method: "DELETE" });

    assert.ok(response.status >= 400, `expected an error status, got ${response.status}`);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-94 — the daemon of the active context reports its version, Engine
// API version, BuildKit version, storage driver, cgroup driver, OS/architecture, root directory and
// container counts. Cross-checked against what the daemon itself reports, never against a constant.
test("GET /api/contexts/daemon-info reports what the active context's daemon says about itself", async () => {
  const { url, close } = await startApp(buildApp("/api/contexts", contextsRouter));
  try {
    const response = await fetch(`${url}/api/contexts/daemon-info`);
    assert.equal(response.status, 200);
    const info = (await response.json()) as DaemonInfo;

    const { stdout: versions } = await execFileAsync("docker", [
      "version",
      "--format",
      "{{.Server.Version}}|{{.Server.APIVersion}}|{{.Server.MinAPIVersion}}",
    ]);
    const [daemonVersion, daemonApiVersion, daemonMinApiVersion] = versions.trim().split("|");
    const { stdout: infos } = await execFileAsync("docker", [
      "info",
      "--format",
      "{{.Driver}}|{{.CgroupDriver}}|{{.CgroupVersion}}|{{.OSType}}|{{.KernelVersion}}|{{.Architecture}}|{{.DockerRootDir}}|{{.OperatingSystem}}",
    ]);
    const [driver, cgroupDriver, cgroupVersion, osType, kernelVersion, architecture, rootDir, operatingSystem] = infos.trim().split("|");

    assert.equal(info.version, daemonVersion);
    // daemon-info-service.md — "the daemon's Engine API version, not the version this application
    // negotiated down to"
    assert.equal(info.apiVersion, daemonApiVersion);
    assert.equal(info.minApiVersion, daemonMinApiVersion);
    assert.equal(info.storageDriver, driver);
    assert.equal(info.cgroupDriver, cgroupDriver);
    assert.equal(info.cgroupVersion, cgroupVersion);
    assert.equal(info.osType, osType);
    assert.equal(info.kernelVersion, kernelVersion);
    assert.equal(info.architecture, architecture);
    assert.equal(info.rootDirectory, rootDir);
    assert.equal(info.operatingSystem, operatingSystem);

    // Counts move while other suites run against the same daemon, so the contract — four numbers,
    // the total covering the states — is what is asserted, never a value.
    assert.equal(typeof info.containers.total, "number");
    assert.equal(typeof info.containers.running, "number");
    assert.equal(typeof info.containers.paused, "number");
    assert.equal(typeof info.containers.stopped, "number");
    assert.ok(info.containers.total >= info.containers.running);
  } finally {
    await close();
  }
});

// daemon-info-service.md — "buildkitVersion is the version the local buildx plugin reports; absent
// when the plugin is not installed, which is not a failure of the reading"
test("GET /api/contexts/daemon-info reports the local buildx plugin's version, or omits it when there is no plugin", async () => {
  const { url, close } = await startApp(buildApp("/api/contexts", contextsRouter));
  try {
    const buildx = await execFileAsync("docker", ["buildx", "version"]).catch(() => undefined);

    const response = await fetch(`${url}/api/contexts/daemon-info`);
    assert.equal(response.status, 200);
    const info = (await response.json()) as DaemonInfo;

    if (buildx) {
      const reported = buildx.stdout.trim();
      assert.ok(typeof info.buildkitVersion === "string" && info.buildkitVersion.length > 0, "expected a BuildKit version");
      const versionToken = reported.split(/\s+/).find((token) => token.startsWith("v")) ?? "";
      assert.ok(reported.includes(info.buildkitVersion!) || info.buildkitVersion === versionToken, `expected ${info.buildkitVersion} in "${reported}"`);
    } else {
      assert.equal(info.buildkitVersion, undefined);
    }
  } finally {
    await close();
  }
});
