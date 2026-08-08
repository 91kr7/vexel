import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { composeRouter } from "../../src/compose/compose-routes.js";
import type { ComposeFileReadResult, ComposeFileWriteResult, ComposeProjectSummary, ComposeValidationResult } from "../../src/compose/compose-discovery-service.js";
import { buildApp, startApp } from "../support/fixtures.js";
import { ALPINE_IMAGE, ensureImages } from "../support/base-images.js";

// A pruned daemon is a starting state like any other: the base images this
// file's fixtures are built on are ensured here, before the first test, so no
// test has to assume a warm daemon nor depend on another file having pulled
// them. They are shared infrastructure, not fixtures: nothing removes them.
await ensureImages([ALPINE_IMAGE]);

const execFileAsync = promisify(execFile);

/** Identifies this test process, so fixture project names never collide across a rerun. */
const RUN_ID = `${process.pid}-${Date.now()}`;
/** Base image the fixtures declare; `pull_policy: never` keeps every fixture offline, which is only safe because it is ensured above. */
const BASE_IMAGE = ALPINE_IMAGE;
const OWNER_LABEL = "vexel.test.run";
const CASE_LABEL = "vexel.test.case";

function projectName(caseName: string): string {
  return `vexel-test-compose-${caseName}-${RUN_ID}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

/** One service block, labelled for ownership, running a long-lived `sleep`. */
function serviceBlock(serviceName: string, caseName: string, extra = ""): string {
  return [
    `  ${serviceName}:`,
    `    image: ${BASE_IMAGE}`,
    "    pull_policy: never",
    '    command: ["sleep", "300"]',
    "    labels:",
    `      - "${OWNER_LABEL}=${RUN_ID}"`,
    `      - "${CASE_LABEL}=${caseName}"`,
    extra,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

interface ComposeFixture {
  dir: string;
  name: string;
  filePath: string;
}

/** Writes a single-file compose fixture declaring one service, without bringing it up. */
async function writeComposeFixture(caseName: string, yaml: string, filename = "docker-compose.yml"): Promise<ComposeFixture> {
  const dir = await mkdtemp(join(tmpdir(), "vexel-test-compose-"));
  const filePath = join(dir, filename);
  await writeFile(filePath, yaml, "utf8");
  return { dir, name: projectName(caseName), filePath };
}

async function bringUp(name: string, filePaths: string[]): Promise<void> {
  const args = filePaths.flatMap((path) => ["-f", path]);
  await execFileAsync("docker", ["compose", ...args, "-p", name, "up", "-d"]);
}

/**
 * Removes every container and network `docker compose` attached to a project,
 * addressed by its own project label rather than by re-reading the fixture's
 * compose file — several tests deliberately corrupt or remove that file, so
 * teardown must not depend on it surviving.
 */
async function removeComposeProjectQuietly(fixture: ComposeFixture): Promise<void> {
  const containers = await execFileAsync("docker", [
    "ps",
    "-aq",
    "--filter",
    `label=com.docker.compose.project=${fixture.name}`,
  ]).catch(() => ({ stdout: "" }));
  const containerIds = containers.stdout.split("\n").filter((id) => id.length > 0);
  if (containerIds.length > 0) {
    await execFileAsync("docker", ["rm", "-fv", ...containerIds]).catch(() => undefined);
  }
  const networks = await execFileAsync("docker", [
    "network",
    "ls",
    "-q",
    "--filter",
    `label=com.docker.compose.project=${fixture.name}`,
  ]).catch(() => ({ stdout: "" }));
  const networkIds = networks.stdout.split("\n").filter((id) => id.length > 0);
  if (networkIds.length > 0) {
    await execFileAsync("docker", ["network", "rm", ...networkIds]).catch(() => undefined);
  }
  await rm(fixture.dir, { recursive: true, force: true }).catch(() => undefined);
}

async function readNdjson(response: Response): Promise<{ type: string; [key: string]: unknown }[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

async function fetchProjects(url: string): Promise<ComposeProjectSummary[]> {
  const response = await fetch(`${url}/api/compose/projects`);
  return (await response.json()) as ComposeProjectSummary[];
}

// plan-docker_management_app/REQ-75 — compose projects are discovered and listed with project name,
// compose file path and overall/per-service state
test("GET /api/compose/projects lists a brought-up project with its file path, state and service", async () => {
  const fixture = await writeComposeFixture(
    "discovery",
    `services:\n${serviceBlock("web", "discovery")}\n`,
  );
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  try {
    await bringUp(fixture.name, [fixture.filePath]);

    const projects = await fetchProjects(url);
    const found = projects.find((project) => project.name === fixture.name);
    assert.ok(found, "brought-up project not found in the list");
    assert.deepEqual(found!.configFiles, [fixture.filePath]);
    assert.equal(found!.state, "running");
    assert.equal(found!.services.length, 1);
    assert.equal(found!.services[0]!.name, "web");
    assert.equal(found!.services[0]!.image, BASE_IMAGE);
    assert.equal(found!.services[0]!.state, "running");
    assert.equal(found!.services[0]!.replicas, 1);
  } finally {
    await removeComposeProjectQuietly(fixture);
    await close();
  }
});

// plan-docker_management_app/REQ-116 — the compose file path is discovered from the daemon's own
// label; it can carry several comma-separated paths when the project uses several `-f` files
test("GET /api/compose/projects reports every config file of a project brought up with several -f files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vexel-test-compose-"));
  const basePath = join(dir, "docker-compose.yml");
  const overridePath = join(dir, "docker-compose.override.yml");
  await writeFile(basePath, `services:\n${serviceBlock("web", "multi-file")}\n`, "utf8");
  await writeFile(overridePath, "services:\n  web:\n    environment:\n      - EXTRA=1\n", "utf8");
  const fixture: ComposeFixture = { dir, name: projectName("multi-file"), filePath: basePath };
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  try {
    await bringUp(fixture.name, [basePath, overridePath]);

    const projects = await fetchProjects(url);
    const found = projects.find((project) => project.name === fixture.name);
    assert.ok(found, "multi-file project not found in the list");
    assert.deepEqual(found!.configFiles, [basePath, overridePath]);
  } finally {
    await removeComposeProjectQuietly(fixture);
    await close();
  }
});

// plan-docker_management_app/REQ-76 — a stack can be brought up, and each of its services can be
// scaled, with the resulting state reflected in the list
test("POST /api/compose/projects/:name/up brings the stack up, reflected in the resulting project", async () => {
  const fixture = await writeComposeFixture("up", `services:\n${serviceBlock("web", "up")}\n`);
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  try {
    // The project must already be discoverable (docker compose ls) for the app's own
    // lifecycle endpoints to resolve its config files, so it is registered first without
    // starting its container (`create`), then brought up through the endpoint under test.
    await execFileAsync("docker", ["compose", "-f", fixture.filePath, "-p", fixture.name, "create"]);

    const response = await fetch(`${url}/api/compose/projects/${fixture.name}/up`, { method: "POST" });
    const events = await readNdjson(response);
    const result = events.at(-1);
    assert.equal(result?.type, "result");
    const project = result!.project as ComposeProjectSummary;
    assert.equal(project.name, fixture.name);
    assert.equal(project.state, "running");
    assert.equal(project.services[0]?.state, "running");
  } finally {
    await removeComposeProjectQuietly(fixture);
    await close();
  }
});

// plan-docker_management_app/REQ-76 — a stack can be brought down
test("POST /api/compose/projects/:name/down stops the stack's containers", async () => {
  const fixture = await writeComposeFixture("down", `services:\n${serviceBlock("web", "down")}\n`);
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  try {
    await bringUp(fixture.name, [fixture.filePath]);

    const response = await fetch(`${url}/api/compose/projects/${fixture.name}/down`, { method: "POST" });
    const events = await readNdjson(response);
    const result = events.at(-1);
    assert.equal(result?.type, "result");

    const { stdout } = await execFileAsync("docker", [
      "ps",
      "-q",
      "--filter",
      `label=com.docker.compose.project=${fixture.name}`,
    ]);
    assert.equal(stdout.trim(), "", "expected no running container after down");
  } finally {
    await removeComposeProjectQuietly(fixture);
    await close();
  }
});

// plan-docker_management_app/REQ-76 — a stack can be restarted
test("POST /api/compose/projects/:name/restart restarts the stack, resulting state running", async () => {
  const fixture = await writeComposeFixture("restart", `services:\n${serviceBlock("web", "restart")}\n`);
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  try {
    await bringUp(fixture.name, [fixture.filePath]);

    const response = await fetch(`${url}/api/compose/projects/${fixture.name}/restart`, { method: "POST" });
    const events = await readNdjson(response);
    const result = events.at(-1);
    assert.equal(result?.type, "result");
    const project = result!.project as ComposeProjectSummary;
    assert.equal(project.state, "running");
  } finally {
    await removeComposeProjectQuietly(fixture);
    await close();
  }
});

// plan-docker_management_app/REQ-76 — a service can be scaled to a chosen number of replicas, with
// the resulting state reflected in the list
test("POST /api/compose/projects/:name/services/:service/scale scales the service's replica count", async () => {
  const fixture = await writeComposeFixture("scale", `services:\n${serviceBlock("web", "scale")}\n`);
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  try {
    await bringUp(fixture.name, [fixture.filePath]);

    const response = await fetch(`${url}/api/compose/projects/${fixture.name}/services/web/scale`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ replicas: 2 }),
    });
    const events = await readNdjson(response);
    const result = events.at(-1);
    assert.equal(result?.type, "result");
    const project = result!.project as ComposeProjectSummary;
    const service = project.services.find((entry) => entry.name === "web");
    assert.equal(service?.replicas, 2);
  } finally {
    await removeComposeProjectQuietly(fixture);
    await close();
  }
});

// compose-endpoints.md — a missing/negative replicas count responds 400
test("POST /api/compose/projects/:name/services/:service/scale with a negative count responds 400", async () => {
  const fixture = await writeComposeFixture("scale-invalid", `services:\n${serviceBlock("web", "scale-invalid")}\n`);
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  try {
    await bringUp(fixture.name, [fixture.filePath]);

    const response = await fetch(`${url}/api/compose/projects/${fixture.name}/services/web/scale`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ replicas: -1 }),
    });
    assert.equal(response.status, 400);
  } finally {
    await removeComposeProjectQuietly(fixture);
    await close();
  }
});

// plan-docker_management_app/REQ-77 — the compose file of a project is read from its discovered path
test("GET /api/compose/projects/:name/files reads the project's own discovered compose file", async () => {
  const yaml = `services:\n${serviceBlock("web", "read")}\n`;
  const fixture = await writeComposeFixture("read", yaml);
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  try {
    await bringUp(fixture.name, [fixture.filePath]);

    const response = await fetch(`${url}/api/compose/projects/${fixture.name}/files`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as ComposeFileReadResult;
    assert.equal(body.ok, true);
    assert.ok(body.ok);
    assert.equal(body.files.length, 1);
    assert.equal(body.files[0]!.path, fixture.filePath);
    assert.equal(body.files[0]!.content, yaml);
  } finally {
    await removeComposeProjectQuietly(fixture);
    await close();
  }
});

// plan-docker_management_app/REQ-116 — a read is refused, with its reason stating the path resolves
// on the server's own machine, when the discovered path no longer exists
test("GET /api/compose/projects/:name/files refuses with a reason when the discovered file no longer exists", async () => {
  const fixture = await writeComposeFixture("read-missing", `services:\n${serviceBlock("web", "read-missing")}\n`);
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  try {
    await bringUp(fixture.name, [fixture.filePath]);
    await unlink(fixture.filePath);

    const response = await fetch(`${url}/api/compose/projects/${fixture.name}/files`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as ComposeFileReadResult;
    assert.equal(body.ok, false);
    assert.ok(!body.ok);
    assert.match(body.reason, /machine running the server/);
  } finally {
    await removeComposeProjectQuietly(fixture);
    await close();
  }
});

// plan-docker_management_app/REQ-116 — a read is refused, with its reason, when the discovered path
// is not a file
test("GET /api/compose/projects/:name/files refuses with a reason when the discovered path is a directory", async () => {
  const fixture = await writeComposeFixture("read-directory", `services:\n${serviceBlock("web", "read-directory")}\n`);
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  try {
    await bringUp(fixture.name, [fixture.filePath]);
    await unlink(fixture.filePath);
    await mkdir(fixture.filePath);

    const response = await fetch(`${url}/api/compose/projects/${fixture.name}/files`);
    const body = (await response.json()) as ComposeFileReadResult;
    assert.equal(body.ok, false);
    assert.ok(!body.ok);
    assert.match(body.reason, /file/i);
  } finally {
    await removeComposeProjectQuietly(fixture);
    await close();
  }
});

// plan-docker_management_app/REQ-77 — the compose file can be edited and saved back to its location
// on disk
test("POST /api/compose/projects/:name/files writes the new content back to the discovered path", async () => {
  const fixture = await writeComposeFixture("write", `services:\n${serviceBlock("web", "write")}\n`);
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  try {
    await bringUp(fixture.name, [fixture.filePath]);
    const updated = `services:\n${serviceBlock("web", "write")}\n    hostname: renamed\n`;

    const response = await fetch(`${url}/api/compose/projects/${fixture.name}/files`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: fixture.filePath, content: updated }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as ComposeFileWriteResult;
    assert.equal(body.ok, true);

    const onDisk = await readFile(fixture.filePath, "utf8");
    assert.equal(onDisk, updated);
  } finally {
    await removeComposeProjectQuietly(fixture);
    await close();
  }
});

// plan-docker_management_app/REQ-116 — no path is ever operator-typed: a write to a path that is not
// one of the project's own discovered compose files is refused, with its reason
test("POST /api/compose/projects/:name/files refuses to write outside the project's own discovered files", async () => {
  const fixture = await writeComposeFixture("write-foreign", `services:\n${serviceBlock("web", "write-foreign")}\n`);
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  const foreignPath = join(fixture.dir, "not-a-project-file.yml");
  try {
    await bringUp(fixture.name, [fixture.filePath]);
    await writeFile(foreignPath, "services: {}\n", "utf8");

    const response = await fetch(`${url}/api/compose/projects/${fixture.name}/files`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: foreignPath, content: "services: {}\n" }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as ComposeFileWriteResult;
    assert.equal(body.ok, false);
    assert.ok(!body.ok);
    assert.ok(body.reason.length > 0);

    const untouched = await readFile(foreignPath, "utf8");
    assert.equal(untouched, "services: {}\n");
  } finally {
    await removeComposeProjectQuietly(fixture);
    await close();
  }
});

// plan-docker_management_app/REQ-116 — a write is refused, with its reason, when the discovered path
// is not writable
test("POST /api/compose/projects/:name/files refuses with a reason when the discovered file is read-only", async () => {
  const fixture = await writeComposeFixture("write-readonly", `services:\n${serviceBlock("web", "write-readonly")}\n`);
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  try {
    await bringUp(fixture.name, [fixture.filePath]);
    await chmod(fixture.filePath, 0o444);

    const response = await fetch(`${url}/api/compose/projects/${fixture.name}/files`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: fixture.filePath, content: "services: {}\n" }),
    });
    const body = (await response.json()) as ComposeFileWriteResult;
    assert.equal(body.ok, false);
    assert.ok(!body.ok);
    assert.ok(body.reason.length > 0);
  } finally {
    await chmod(fixture.filePath, 0o644).catch(() => undefined);
    await removeComposeProjectQuietly(fixture);
    await close();
  }
});

// plan-docker_management_app/REQ-77 — the compose file can be validated on demand, showing valid with
// the services, volumes and networks it declares
test("POST /api/compose/projects/:name/validate reports valid with the declared services/volumes/networks", async () => {
  const yaml = [
    "services:",
    serviceBlock("web", "validate-valid", "    volumes:\n      - data:/data"),
    "volumes:",
    "  data: {}",
    "",
  ].join("\n");
  const fixture = await writeComposeFixture("validate-valid", yaml);
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  try {
    await bringUp(fixture.name, [fixture.filePath]);

    const response = await fetch(`${url}/api/compose/projects/${fixture.name}/validate`, { method: "POST" });
    assert.equal(response.status, 200);
    const body = (await response.json()) as ComposeValidationResult;
    assert.equal(body.valid, true);
    assert.deepEqual(body.errors, []);
    assert.deepEqual(body.services, ["web"]);
    assert.deepEqual(body.volumes, ["data"]);
  } finally {
    // The named volume must go after its container: removing it first, while
    // still mounted, silently fails and leaks the volume.
    await removeComposeProjectQuietly(fixture);
    await execFileAsync("docker", ["volume", "rm", "-f", `${fixture.name}_data`]).catch(() => undefined);
    await close();
  }
});

// plan-docker_management_app/REQ-77 — validating an invalid compose file shows invalid with the
// daemon's own error
test("POST /api/compose/projects/:name/validate reports invalid with the daemon's own error", async () => {
  const fixture = await writeComposeFixture("validate-invalid", `services:\n${serviceBlock("web", "validate-invalid")}\n`);
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  try {
    await bringUp(fixture.name, [fixture.filePath]);
    // Overwrite with a file docker compose config cannot resolve — bypasses the
    // app's own write endpoint so the write's own validation cannot interfere.
    await writeFile(fixture.filePath, "services:\n  web:\n    image: [this is not valid yaml\n", "utf8");

    const response = await fetch(`${url}/api/compose/projects/${fixture.name}/validate`, { method: "POST" });
    assert.equal(response.status, 200);
    const body = (await response.json()) as ComposeValidationResult;
    assert.equal(body.valid, false);
    assert.ok(body.errors.length > 0 && body.errors[0]!.length > 0);
    assert.deepEqual(body.services, []);
  } finally {
    await removeComposeProjectQuietly(fixture);
    await close();
  }
});

// plan-docker_management_app/REQ-78 — the aggregated live logs of every service of a stack are shown,
// each line labelled with the service it comes from
test("GET /api/compose/projects/:name/logs/stream aggregates every service's output, each line labelled", async () => {
  const caseName = "logs";
  // Built out by hand rather than through `serviceBlock` (which always runs
  // `sleep`), so each service's own stdout is distinguishable.
  const explicitYaml = [
    "services:",
    "  alpha:",
    `    image: ${BASE_IMAGE}`,
    "    pull_policy: never",
    '    command: ["sh", "-c", "for i in $(seq 1 40); do echo alpha-line-$i; sleep 0.2; done"]',
    "    labels:",
    `      - "${OWNER_LABEL}=${RUN_ID}"`,
    `      - "${CASE_LABEL}=${caseName}"`,
    "  beta:",
    `    image: ${BASE_IMAGE}`,
    "    pull_policy: never",
    '    command: ["sh", "-c", "for i in $(seq 1 40); do echo beta-line-$i; sleep 0.2; done"]',
    "    labels:",
    `      - "${OWNER_LABEL}=${RUN_ID}"`,
    `      - "${CASE_LABEL}=${caseName}"`,
    "",
  ].join("\n");
  const fixture = await writeComposeFixture(caseName, explicitYaml);
  const { url, close } = await startApp(buildApp("/api/compose", composeRouter));
  try {
    await bringUp(fixture.name, [fixture.filePath]);

    const response = await fetch(`${url}/api/compose/projects/${fixture.name}/logs/stream`);
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const services = new Set<string>();
    let buffer = "";
    const deadline = Date.now() + 15_000;
    while (services.size < 2 && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
        if (!dataLine) continue;
        const payload = JSON.parse(dataLine.slice("data: ".length)) as { service?: string };
        if (payload.service) services.add(payload.service);
      }
    }
    await reader.cancel().catch(() => undefined);
    assert.deepEqual([...services].sort(), ["alpha", "beta"]);
  } finally {
    await removeComposeProjectQuietly(fixture);
    await close();
  }
});
