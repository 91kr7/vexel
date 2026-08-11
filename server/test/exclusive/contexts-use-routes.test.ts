import { test, after } from "node:test";
import assert from "node:assert/strict";
import { contextsRouter } from "../../src/contexts/contexts-routes.js";
import type { ContextSummary } from "../../src/contexts/contexts-service.js";
import { resolveActiveEndpoint, setActiveEndpoint } from "../../src/docker/endpoint.js";
import { buildApp, startApp } from "../support/fixtures.js";
import { execFileAsync } from "../support/docker-cli.js";

const RUN_ID = `${process.pid}-${Date.now()}`;
const FIXTURE_PREFIX = "vexel-test-ctx-use-";

// `POST /api/contexts/:name/use` runs `docker context use`, which rewrites the
// operator's own Docker configuration: the active context is machine-wide state
// every other process sees at once — the docker CLI, buildx (whose current
// builder is keyed on the context name) and any concurrently running test file.
// It cannot be scoped by a label or an environment variable, so it lives apart
// and runs alone, like the prune tests in this same folder (CLAUDE.md,
// "Destructive-by-nature tests ... cannot be scoped, so they live apart").
//
// Even alone, the switch is made as invisible as it can be: the fixture context
// points at the very daemon that was already active, and the operator's own
// active context is read at run time and restored whether the test passes or
// fails — here in the test's `finally`, and again in the `after` below for the
// run that never reaches it.

function fixtureName(caseName: string): string {
  return `${FIXTURE_PREFIX}${caseName}-${RUN_ID}`;
}

async function removeContextQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["context", "rm", "-f", name]).catch(() => undefined);
}

async function currentContextName(): Promise<string> {
  const { stdout } = await execFileAsync("docker", ["context", "show"]);
  return stdout.trim();
}

async function currentContextEndpoint(): Promise<string> {
  const { stdout } = await execFileAsync("docker", [
    "context",
    "inspect",
    await currentContextName(),
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]);
  return stdout.trim();
}

async function useContextQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["context", "use", name]).catch(() => undefined);
}

/**
 * The daemon reading of the active context, asked for until it answers or the
 * deadline passes.
 *
 * Not read once, and the retry is not politeness: `docker context use` rewrites
 * the operator's own Docker configuration, Docker Desktop watches that file, and
 * it re-establishes the socket it serves when the file changes — so the first
 * read after a switch can lose its connection ("socket hang up") on a daemon
 * that is healthy either side of it. The application never shows that: a switch
 * announces a re-read (use-contexts.md) and the panel fills on the next one,
 * which is why the e2e spec covering this same requirement gives the reading a
 * 20s budget of its own. A single immediate read asserted the platform's
 * timing rather than REQ-94.
 */
async function pollDaemonInfo(url: string): Promise<{ status: number; body: string }> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const response = await fetch(`${url}/api/contexts/daemon-info`);
    const body = await response.text();
    if (response.ok || Date.now() > deadline) return { status: response.status, body };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function fetchContexts(url: string): Promise<ContextSummary[]> {
  const response = await fetch(`${url}/api/contexts`);
  assert.equal(response.status, 200);
  return (await response.json()) as ContextSummary[];
}

async function postUse(url: string, name: string): Promise<Response> {
  return fetch(`${url}/api/contexts/${name}/use`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

/** The context Docker had selected before this file switched it: the operator's own, never a constant. */
let operatorActiveContext: string | undefined;

/**
 * Puts the machine back as it was found, for the run that never reached a
 * test's own `finally`: the operator's context is selected again before any
 * fixture is removed, and every context this file could have left behind is
 * recognised by its name prefix — a context carries no label.
 */
after(async () => {
  if (operatorActiveContext) {
    const current = await currentContextName().catch(() => "");
    if (current.startsWith(FIXTURE_PREFIX)) await useContextQuietly(operatorActiveContext);
  }
  const { stdout } = await execFileAsync("docker", ["context", "ls", "--format", "{{.Name}}"]).catch(() => ({ stdout: "" }));
  const leftovers = stdout.split("\n").filter((name) => name.startsWith(FIXTURE_PREFIX));
  for (const name of leftovers) await removeContextQuietly(name);
  setActiveEndpoint(undefined);
});

// plan-docker_management_app/REQ-93 — selecting another context re-points every screen of the
// application at the newly selected daemon: at this level, the access layer every area reads its
// target from now names that context's endpoint, and the daemon of the active context answers.
// contexts-endpoints.md — "POST /api/contexts/:name/use ... 200 -> the resulting context (now
// active)"; contexts-service.md — activateContext "publishes its resolved endpoint to the Docker
// access layer".
test("POST /api/contexts/:name/use makes the context active and re-points the access layer at its daemon", async () => {
  const name = fixtureName("use");
  const { url, close } = await startApp(buildApp("/api/contexts", contextsRouter));
  try {
    const sameDaemonEndpoint = await currentContextEndpoint();
    operatorActiveContext = await currentContextName();
    await execFileAsync("docker", ["context", "create", name, "--docker", `host=${sameDaemonEndpoint}`]);

    const response = await postUse(url, name);
    assert.equal(response.status, 200);
    const used = (await response.json()) as ContextSummary;
    assert.equal(used.name, name);
    assert.equal(used.active, true);

    // contexts-service.md — "active marks the one context Docker currently has selected; at most
    // one is active": the inventory now names this one, and no other.
    const contexts = await fetchContexts(url);
    assert.deepEqual(
      contexts.filter((context) => context.active).map((context) => context.name),
      [name],
    );

    // docker-access/specs/active-endpoint.md — every area dials the endpoint of the active context.
    const active = resolveActiveEndpoint();
    assert.equal(active.kind, "unix");
    assert.equal(active.kind === "unix" ? `unix://${active.socketPath}` : "", sameDaemonEndpoint);

    // REQ-94 — the daemon of the (newly) active context answers.
    const info = await pollDaemonInfo(url);
    // The body carries the reason the daemon could not be read, and the status
    // alone does not: a bare `502 !== 200` says the switch broke something
    // without saying what, which is the one thing worth knowing here.
    assert.equal(info.status, 200, `daemon-info answered ${info.status} for the newly active ${name} (${sameDaemonEndpoint}): ${info.body}`);
  } finally {
    if (operatorActiveContext) await useContextQuietly(operatorActiveContext);
    await removeContextQuietly(name);
    // The process-wide active endpoint is global state like the context itself.
    setActiveEndpoint(undefined);
    await close();
  }
});
