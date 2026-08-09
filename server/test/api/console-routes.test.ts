import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ALPINE_IMAGE, ensureImage } from "../support/base-images.js";
import { buildApp, fixtureName, OWNER_LABEL, CASE_LABEL, RUN_ID, removeContainerQuietly, startApp } from "../support/fixtures.js";

const execFileAsync = promisify(execFile);

// The console writes its history to the local store, so this suite points the
// store at a directory of its own: the operator's `~/.vexel` is never the place
// a test's command history lands (CLAUDE.md, "Tests").
const dataDir = mkdtempSync(join(tmpdir(), "vexel-console-routes-"));
process.env.VEXEL_DATA_DIR = dataDir;
const historyFile = join(dataDir, "console-history.json");

const { consoleRouter } = await import("../../src/console/console-routes.js");

interface NdjsonEvent {
  type: "output" | "exit" | "error";
  stream?: "stdout" | "stderr";
  text?: string;
  exitCode?: number | null;
  message?: string;
}

interface CliRun {
  status: number;
  events: NdjsonEvent[];
}

/** Runs a line through the CLI channel and collects the ndjson stream to its end. */
async function runCli(url: string, command: string): Promise<CliRun> {
  const response = await fetch(`${url}/api/console/cli`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });
  if (response.status !== 200) {
    await response.text();
    return { status: response.status, events: [] };
  }
  const text = await response.text();
  return {
    status: response.status,
    events: text
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as NdjsonEvent),
  };
}

function outputOf(events: NdjsonEvent[], stream: "stdout" | "stderr"): string {
  return events
    .filter((event) => event.type === "output" && event.stream === stream)
    .map((event) => event.text ?? "")
    .join("");
}

async function callApiChannel(url: string, command: string): Promise<{ status: number; payload: Record<string, unknown> }> {
  const response = await fetch(`${url}/api/console/api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });
  return { status: response.status, payload: (await response.json()) as Record<string, unknown> };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function historyFileText(): string {
  try {
    return readFileSync(historyFile, "utf-8");
  } catch {
    return "";
  }
}

// plan-docker_management_app/REQ-112 — an entry recognised as destructive is classified as such so
// the client can require the application's confirmation; console-endpoints.md — POST /classify
// answers { destructive, reason?, carriesSecret } and runs nothing
test("POST /api/console/classify judges a line without running it", async () => {
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    const destructive = await fetch(`${url}/api/console/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "cli", command: "docker system prune -a --force" }),
    });
    assert.equal(destructive.status, 200);
    const judgement = (await destructive.json()) as { destructive: boolean; reason?: string; carriesSecret: boolean };
    assert.equal(judgement.destructive, true);
    assert.ok((judgement.reason ?? "").length > 0);
    assert.equal(judgement.carriesSecret, false);

    const harmless = await fetch(`${url}/api/console/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "api", command: "GET /info" }),
    });
    assert.deepEqual(await harmless.json(), { destructive: false, carriesSecret: false });
  } finally {
    await close();
  }
});

// console-endpoints.md — "400 → command is not a string, or channel is neither cli nor api"
test("POST /api/console/classify rejects a malformed request", async () => {
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    for (const body of [{ channel: "cli" }, { channel: "shell", command: "docker ps" }, { command: 7, channel: "cli" }]) {
      const response = await fetch(`${url}/api/console/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.ok(((await response.json()) as { error?: string }).error);
    }
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-100 — an arbitrary Docker CLI command runs against the active
// context with its stdout and exit code streamed back
test("POST /api/console/cli runs a docker command and streams its stdout and exit code", async () => {
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    const { stdout: expected } = await execFileAsync("docker", ["version", "--format", "{{.Server.Version}}"]);
    const run = await runCli(url, "docker version --format {{.Server.Version}}");

    assert.equal(run.status, 200);
    assert.equal(outputOf(run.events, "stdout").trim(), expected.trim());
    const last = run.events[run.events.length - 1];
    assert.equal(last?.type, "exit");
    assert.equal(last?.exitCode, 0);
    // Exactly one terminal event.
    assert.equal(run.events.filter((event) => event.type === "exit" || event.type === "error").length, 1);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-100 — stderr and a non-zero exit code come back too
test("POST /api/console/cli streams stderr and the non-zero exit code of a command that failed", async () => {
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    const run = await runCli(url, `docker inspect vexel-console-absent-${RUN_ID}`);

    assert.equal(run.status, 200);
    assert.ok(outputOf(run.events, "stderr").length > 0, "nothing came back on stderr");
    const last = run.events[run.events.length - 1];
    assert.equal(last?.type, "exit");
    assert.notEqual(last?.exitCode, 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-100 / console-endpoints.md — "400 → command ... is not a runnable
// docker command line (the line is rejected before the stream opens)": the console is the Docker
// CLI, not a shell on the server
test("POST /api/console/cli refuses a line that is not a docker command, before opening a stream", async () => {
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    for (const command of ["rm -rf /tmp/vexel-console-probe", "sh -c 'docker ps'", "", 'docker ps "']) {
      const response = await fetch(`${url}/api/console/cli`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      assert.equal(response.status, 400, `expected ${command} to be refused`);
      const payload = (await response.json()) as { error?: string };
      assert.ok((payload.error ?? "").length > 0);
      assert.equal(response.headers.get("content-type")?.includes("ndjson"), false);
    }
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-100 / console-cli-service.md — "No shell is involved ... so a
// metacharacter cannot act on the server's filesystem": probed against the real docker binary, with
// a file this test created as the thing a shell would have destroyed
test("POST /api/console/cli hands the metacharacters to docker as literal arguments", async () => {
  const probeDir = mkdtempSync(join(tmpdir(), "vexel-console-shell-probe-"));
  const victim = join(probeDir, "victim.txt");
  const created = join(probeDir, "redirected.txt");
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    writeFileSync(victim, "still here", "utf-8");

    const chained = await runCli(url, `docker ps; rm -rf ${victim}`);
    assert.equal(chained.status, 200);
    assert.notEqual(chained.events[chained.events.length - 1]?.exitCode, 0);
    assert.equal(existsSync(victim), true, "a second command ran and removed the file");

    const redirected = await runCli(url, `docker version > ${created}`);
    assert.equal(redirected.status, 200);
    assert.equal(existsSync(created), false, "a redirection created a file on the server");
  } finally {
    await close();
    rmSync(probeDir, { recursive: true, force: true });
  }
});

// console-endpoints.md — "Closing the connection cancels the command", cancelled on the response
// closing rather than the request's
test("closing the CLI stream kills the process the console started", async () => {
  const marker = `vexel-console-cancel-${RUN_ID}`;
  const controller = new AbortController();
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    const streaming = fetch(`${url}/api/console/cli`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: `docker events --since 0 --filter label=${marker}` }),
      signal: controller.signal,
    }).catch(() => undefined);

    // The process must be there before its death can mean anything.
    let alive = false;
    for (let attempt = 0; attempt < 40 && !alive; attempt += 1) {
      await delay(250);
      alive = await isRunning(marker);
    }
    assert.equal(alive, true, "the console never started the command");

    controller.abort();
    await streaming;

    let stillAlive = true;
    for (let attempt = 0; attempt < 40 && stillAlive; attempt += 1) {
      await delay(250);
      stillAlive = await isRunning(marker);
    }
    assert.equal(stillAlive, false, "the process outlived the connection that started it");
  } finally {
    await execFileAsync("pkill", ["-f", marker]).catch(() => undefined);
    await close();
  }
});

/** Whether a process whose command line carries this marker is running. */
async function isRunning(marker: string): Promise<boolean> {
  const { stdout } = await execFileAsync("ps", ["-Ao", "args="]).catch(() => ({ stdout: "" }));
  return stdout.split("\n").some((line) => line.includes(marker) && !line.includes("ps -Ao"));
}

// plan-docker_management_app/REQ-101 — an arbitrary Engine API call is issued against the active
// daemon and its raw status and response body are shown
test("POST /api/console/api issues the Engine API call and answers the daemon's own status and body", async () => {
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    const { stdout: version } = await execFileAsync("docker", ["version", "--format", "{{.Server.Version}}"]);
    const { status, payload } = await callApiChannel(url, "GET /version");

    assert.equal(status, 200);
    assert.equal(payload.method, "GET");
    assert.equal(payload.status, 200);
    // console-api-service.md — "path in the answer is the path actually dialed, version prefix included"
    assert.match(String(payload.path), /^\/v\d+(\.\d+)?\/version$/);
    // "body is the response body verbatim — not parsed, not re-serialized"
    assert.equal(typeof payload.body, "string");
    assert.ok(String(payload.body).includes(version.trim()), "the daemon's own version is not in the body");
    assert.equal(JSON.parse(String(payload.body)).Version, version.trim());
  } finally {
    await close();
  }
});

// console-api-service.md — "status is the daemon's own status, error statuses included: a 404 ... is
// a result to show, not a failure to raise"; console-endpoints.md — "The endpoint answers 200 for a
// daemon 404"
test("POST /api/console/api answers 200 carrying a daemon 404 rather than failing", async () => {
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    const { status, payload } = await callApiChannel(url, `GET /containers/vexel-console-absent-${RUN_ID}/json`);

    assert.equal(status, 200);
    assert.equal(payload.status, 404);
    assert.ok(String(payload.body).length > 0, "the daemon's error body was dropped");
  } finally {
    await close();
  }
});

// docker-access/specs/engine-client.md — a path already carrying a version prefix is dialed as typed
test("POST /api/console/api dials a path that already carries a version prefix as typed", async () => {
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    const { stdout: apiVersion } = await execFileAsync("docker", ["version", "--format", "{{.Server.APIVersion}}"]);
    const typedPath = `/v${apiVersion.trim()}/_ping`;
    const { payload } = await callApiChannel(url, `GET ${typedPath}`);

    assert.equal(payload.path, typedPath);
    assert.equal(payload.status, 200);
  } finally {
    await close();
  }
});

// console-endpoints.md — "400 → command ... does not follow the entry grammar", nothing being dialed
test("POST /api/console/api refuses an entry that does not follow the grammar", async () => {
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    for (const command of ["containers/json", "GET containers/json", "", "  "]) {
      const response = await fetch(`${url}/api/console/api`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      assert.equal(response.status, 400, `expected "${command}" to be refused`);
    }
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-101 — the call carries a method, a path, a query and a body;
// console-api-service.md — "A body given on the entry line travels as typed". The container this
// creates is the test's own fixture, labelled and removed either way.
test("POST /api/console/api sends the method, query and body of the entry, creating what was asked for", async () => {
  const caseName = "api-channel-body";
  const name = fixtureName(caseName);
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    await ensureImage(ALPINE_IMAGE);
    const body = JSON.stringify({
      Image: ALPINE_IMAGE,
      Cmd: ["true"],
      Labels: { [OWNER_LABEL]: RUN_ID, [CASE_LABEL]: caseName },
    });
    const { status, payload } = await callApiChannel(url, `POST /containers/create?name=${name} '${body}'`);

    assert.equal(status, 200);
    assert.equal(payload.method, "POST");
    assert.equal(payload.status, 201, `the daemon answered ${payload.status}: ${String(payload.body)}`);

    // The daemon really did create it, under the name the query carried.
    const { stdout } = await execFileAsync("docker", ["inspect", name, "--format", "{{.Config.Image}}"]);
    assert.equal(stdout.trim(), ALPINE_IMAGE);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-101 / console-api-service.md — "A body given on the entry line
// travels as typed — it is the raw rest of the line after the path, its quotes and its spacing
// intact": the form the starting-point chip offers, typed unquoted, must reach the daemon as JSON.
// The container it creates is this test's own fixture, labelled and removed either way.
test("POST /api/console/api sends an unquoted JSON body to the daemon exactly as typed", async () => {
  const caseName = "api-channel-unquoted-body";
  const name = fixtureName(caseName);
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    await ensureImage(ALPINE_IMAGE);
    // Typed the way the console's own starting point shows it: no wrapping quotes, spacing of its own.
    const command =
      `POST /containers/create?name=${name} ` +
      `{"Image": "${ALPINE_IMAGE}", "Cmd": ["true"], "Labels": {"${OWNER_LABEL}": "${RUN_ID}", "${CASE_LABEL}": "${caseName}"}}`;
    const { status, payload } = await callApiChannel(url, command);

    assert.equal(status, 200);
    assert.equal(payload.status, 201, `the daemon answered ${payload.status}: ${String(payload.body)}`);

    const { stdout } = await execFileAsync("docker", ["inspect", name, "--format", "{{.Config.Image}}|{{index .Config.Labels \"vexel.test.run\"}}"]);
    assert.equal(stdout.trim(), `${ALPINE_IMAGE}|${RUN_ID}`);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-102, REQ-114 / console-endpoints.md — the history is appended per
// entry and read back oldest first
test("the history endpoints append an entry and read the history back oldest first", async () => {
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    const marker = `history-${Date.now()}`;
    await fetch(`${url}/api/console/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "cli", command: `docker ps --filter label=${marker}-first`, status: "exit 0", succeeded: true, output: "one" }),
    });
    const appended = await fetch(`${url}/api/console/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "api", command: `GET /info?${marker}-second`, status: "HTTP 200", succeeded: true, output: "two" }),
    });
    assert.equal(appended.status, 200);

    const read = await fetch(`${url}/api/console/history`);
    assert.equal(read.status, 200);
    const { entries } = (await read.json()) as { entries: { command: string; output?: string; status?: string }[] };
    const mine = entries.filter((entry) => entry.command.includes(marker));
    assert.deepEqual(
      mine.map((entry) => entry.command),
      [`docker ps --filter label=${marker}-first`, `GET /info?${marker}-second`],
    );
    // REQ-102 — "copying any entry with its output" is what the stored output makes survive
    assert.equal(mine[0]?.output, "one");
    assert.equal(mine[1]?.status, "HTTP 200");
  } finally {
    await close();
  }
});

// console-history-store.md — the credential rule is enforced inside the store, "so no route can
// persist one by omission": the route is asked to store one directly
test("POST /api/console/history refuses to persist a command that could carry a credential", async () => {
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    const before = await fetch(`${url}/api/console/history`);
    const { entries: existing } = (await before.json()) as { entries: unknown[] };

    const response = await fetch(`${url}/api/console/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "cli",
        command: "docker login -p hunter2-route-probe registry.example.com",
        status: "exit 0",
        succeeded: true,
      }),
    });

    assert.equal(response.status, 200);
    const { entries } = (await response.json()) as { entries: unknown[] };
    assert.equal(entries.length, existing.length, "the credential-carrying entry was appended");
    assert.ok(!historyFileText().includes("hunter2-route-probe"), "the credential reached the history file");
  } finally {
    await close();
  }
});

// console-history-store.md — the credential rule "covers both channels": an Engine API body is as
// good a place for a password as a CLI flag, and the store is what refuses it
test("POST /api/console/history refuses to persist an API body that could carry a credential", async () => {
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    const before = await fetch(`${url}/api/console/history`);
    const { entries: existing } = (await before.json()) as { entries: unknown[] };

    const response = await fetch(`${url}/api/console/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "api",
        command: 'POST /auth {"Username":"u","Password":"hunter2-api-route-probe"}',
        status: "HTTP 200",
        succeeded: true,
      }),
    });

    assert.equal(response.status, 200);
    const { entries } = (await response.json()) as { entries: unknown[] };
    assert.equal(entries.length, existing.length, "the credential-carrying API entry was appended");
    assert.ok(!historyFileText().includes("hunter2-api-route-probe"), "the credential reached the history file");
  } finally {
    await close();
  }
});

// console-endpoints.md — "400 → command is not a string, or channel is neither cli nor api"
test("POST /api/console/history rejects a malformed entry", async () => {
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    for (const body of [{ channel: "cli" }, { channel: "shell", command: "docker ps" }]) {
      const response = await fetch(`${url}/api/console/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400, JSON.stringify(body));
    }
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-114 — the history survives a restart: a router loaded afresh still
// answers with what was appended before
test("a freshly loaded console router still answers with the history appended before the restart", async () => {
  const marker = `restart-${Date.now()}`;
  const before = await startApp(buildApp("/api/console", consoleRouter));
  try {
    await fetch(`${before.url}/api/console/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "cli", command: `docker ps --filter label=${marker}`, status: "exit 0", succeeded: true }),
    });
  } finally {
    await before.close();
  }

  const { consoleRouter: restarted } = await import(`../../src/console/console-routes.js?restart=${Date.now()}`);
  const after = await startApp(buildApp("/api/console", restarted as typeof consoleRouter));
  try {
    const response = await fetch(`${after.url}/api/console/history`);
    const { entries } = (await response.json()) as { entries: { command: string }[] };
    assert.ok(
      entries.some((entry) => entry.command === `docker ps --filter label=${marker}`),
      "the entry appended before the restart is gone",
    );
  } finally {
    await after.close();
  }
});

// plan-docker_management_app/REQ-103 / the batch's promise — the commands no screen of its own
// carries must stay reachable here: accepted, classified non-destructive and dispatched. None is
// executed: establishing that the console does not block them is the point.
test("the commands this console exists to keep reachable are accepted and classified non-destructive", async () => {
  const { url, close } = await startApp(buildApp("/api/console", consoleRouter));
  try {
    const reachable = [
      "docker build -t vexel-console-unbuilt:latest .",
      "docker stack deploy -c docker-compose.yml vexel-console-undeployed",
      "docker buildx build --cache-to type=local,dest=./cache .",
      'docker context create vexel-console-uncreated --docker "host=tcp://host:2376,ca=./ca.pem,cert=./cert.pem,key=./key.pem"',
    ];
    for (const command of reachable) {
      const response = await fetch(`${url}/api/console/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "cli", command }),
      });
      assert.equal(response.status, 200, command);
      const judgement = (await response.json()) as { destructive: boolean; reason?: string };
      assert.equal(judgement.destructive, false, `${command} was classified destructive`);
      assert.equal(judgement.reason, undefined, command);
    }
  } finally {
    await close();
  }
});
