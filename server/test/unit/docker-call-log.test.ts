import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";
import { logCliCall, logSocketCall, setDockerCallLogSink } from "../../src/docker/call-log.js";
import { detectCliAvailability, resetCliAvailabilityCache, runCliCommand } from "../../src/docker/cli-runner.js";
import { hijack, requestBuffered, requestStream } from "../../src/docker/http-client.js";
import type { DockerEndpoint } from "../../src/docker/types.js";

const localEndpoint: DockerEndpoint = { kind: "unix", socketPath: "/var/run/docker.sock" };

/** Everything the log wrote during one check, in order. */
let lines: string[] = [];
/** The whole pass runs with the log silenced; each check restores what it found. */
let inheritedSetting: string | undefined;

beforeEach(() => {
  lines = [];
  inheritedSetting = process.env.VEXEL_DOCKER_LOG;
  delete process.env.VEXEL_DOCKER_LOG;
  setDockerCallLogSink((line) => lines.push(line));
});

afterEach(() => {
  setDockerCallLogSink(undefined);
  if (inheritedSetting === undefined) delete process.env.VEXEL_DOCKER_LOG;
  else process.env.VEXEL_DOCKER_LOG = inheritedSetting;
});

interface DaemonStub {
  socketPath: string;
  close: () => Promise<void>;
}

function startDaemonStub(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<DaemonStub> {
  const socketPath = join(tmpdir(), `vexel-call-log-test-${randomUUID()}.sock`);
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(socketPath, () => {
      resolve({
        socketPath,
        close: () =>
          new Promise((closeResolve) => {
            server.close(() => {
              try {
                unlinkSync(socketPath);
              } catch {
                // best-effort cleanup
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

/** A socket path nothing listens on: the call fails, having been logged first. */
function unreachableEndpoint(): DockerEndpoint {
  return { kind: "unix", socketPath: join(tmpdir(), `vexel-no-daemon-${randomUUID()}.sock`) };
}

// docker-access/specs/call-log.md — the line is written before the daemon is asked anything
test("a buffered Engine API call is logged before the daemon receives the request", async () => {
  const events: string[] = [];
  setDockerCallLogSink((line) => events.push(`logged: ${line}`));
  const stub = await startDaemonStub((req, res) => {
    events.push(`received: ${req.url}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });

  try {
    await requestBuffered({ kind: "unix", socketPath: stub.socketPath }, { path: "/v1.43/containers/json?all=1" });
  } finally {
    await stub.close();
  }

  assert.equal(events.length, 2);
  assert.match(events[0], /^logged: /);
  assert.match(events[1], /^received: /);
  assert.match(
    events[0],
    new RegExp(`^logged: \\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z \\[docker socket\\] GET /v1\\.43/containers/json\\?all=1 → unix://${stub.socketPath}$`),
  );
});

// docker-access/specs/call-log.md — a stream is marked, and logged before the socket is even dialed
test("a streamed Engine API call is marked (stream) and logged even when the endpoint cannot be reached", async () => {
  await assert.rejects(() => requestStream(unreachableEndpoint(), { path: "/v1.43/containers/abc/logs?follow=1" }));

  assert.equal(lines.length, 1);
  assert.match(lines[0], /\[docker socket\] GET \/v1\.43\/containers\/abc\/logs\?follow=1 \(stream\) → unix:\/\//);
});

// docker-access/specs/call-log.md — a hijacked call is marked
test("a hijacked Engine API call is marked (hijack), with POST as its default method", async () => {
  await assert.rejects(() => hijack(unreachableEndpoint(), { path: "/v1.43/exec/abc/start" }));

  assert.equal(lines.length, 1);
  assert.match(lines[0], /\[docker socket\] POST \/v1\.43\/exec\/abc\/start \(hijack\) → unix:\/\//);
});

// docker-access/specs/call-log.md — the endpoint is named the way DOCKER_HOST names it
test("the endpoint is named as a URL, TLS and ssh forms included", () => {
  logSocketCall({ kind: "tcp", host: "10.0.0.4", port: 2375 }, { method: "GET", path: "/_ping", mode: "request" });
  logSocketCall(
    { kind: "tcp", host: "10.0.0.5", port: 2376, tls: { ca: "ca.pem", cert: "cert.pem", key: "key.pem" } },
    { method: "GET", path: "/_ping", mode: "request" },
  );
  logSocketCall({ kind: "ssh", destination: "user@box" }, { method: "GET", path: "/_ping", mode: "request" });

  assert.match(lines[0], /→ tcp:\/\/10\.0\.0\.4:2375$/);
  assert.match(lines[1], /→ tcp:\/\/10\.0\.0\.5:2376 \(tls\)$/);
  assert.match(lines[2], /→ ssh:\/\/user@box$/);
});

// docker-access/specs/call-log.md — the CLI line is written before the process exists
test("a CLI run is logged before the process is spawned, naming the command, its arguments and the endpoint", async () => {
  const handle = runCliCommand("echo", ["compose", "up", "-d"], localEndpoint);

  // Nothing has been awaited yet: the line is already there, and the child cannot
  // have produced anything at all.
  assert.equal(lines.length, 1);
  assert.match(lines[0], /\[docker cli\] echo compose up -d → unix:\/\/\/var\/run\/docker\.sock$/);

  await handle.done;
});

// docker-access/specs/call-log.md — standard input is the secret channel and is never written
test("what a CLI run is handed on standard input never reaches the log", async () => {
  const handle = runCliCommand("cat", [], localEndpoint, { stdin: "hunter2" });

  await handle.done;

  assert.equal(lines.length, 1);
  assert.ok(!lines[0].includes("hunter2"), lines[0]);
});

// docker-access/specs/call-log.md — the availability probe is a call too, and dials no daemon
test("the CLI availability probe logs each program it runs, with no endpoint", async () => {
  resetCliAvailabilityCache();
  try {
    await detectCliAvailability();
  } finally {
    resetCliAvailabilityCache();
  }

  const probeLines = lines.filter((line) => line.includes("[docker cli] docker"));
  assert.ok(
    probeLines.some((line) => line.endsWith("[docker cli] docker --version")),
    probeLines.join("\n"),
  );
  assert.ok(
    probeLines.every((line) => !line.includes("→")),
    "the probe contacts no endpoint, so no line may name one",
  );
});

// docker-access/specs/call-log.md — a credential in argv is blanked, both spellings
test("credentials passed in argv are redacted, the flag that carried them left in place", () => {
  logCliCall("docker", ["login", "registry.example.com", "--username", "sam", "--password", "hunter2"]);
  logCliCall("docker", ["login", "registry.example.com", "-u", "sam", "-p", "hunter2"]);
  logCliCall("docker", ["login", "registry.example.com", "--password=hunter2"]);
  logCliCall("docker", ["buildx", "imagetools", "create", "--token", "hunter2"]);

  for (const line of lines) {
    assert.ok(!line.includes("hunter2"), line);
    assert.ok(line.includes("***"), line);
  }
  assert.ok(lines[0].includes("--username sam"), lines[0]);
  assert.ok(lines[0].endsWith("--password ***"), lines[0]);
  assert.ok(lines[2].endsWith("--password=***"), lines[2]);
});

// docker-access/specs/call-log.md — -p is a password only for login; elsewhere it is a published port
test("-p keeps its value outside docker login, where it publishes a port rather than carrying a secret", () => {
  logCliCall("docker", ["run", "-d", "-p", "8080:80", "alpine:3.20"]);

  assert.ok(lines[0].endsWith("run -d -p 8080:80 alpine:3.20"), lines[0]);
});

// docker-access/specs/call-log.md — --password-stdin stays readable: it is how one sees the secret stayed out of argv
test("--password-stdin is left as it is, carrying no value of its own", () => {
  logCliCall("docker", ["login", "registry.example.com", "--username", "sam", "--password-stdin"]);

  assert.ok(lines[0].endsWith("login registry.example.com --username sam --password-stdin"), lines[0]);
});

// docker-access/specs/call-log.md — an argument that would be ambiguous unquoted is quoted
test("an argument containing whitespace is quoted so the line reads back unambiguously", () => {
  logCliCall("docker", ["run", "alpine:3.20", "sh", "-c", "echo one two"]);

  assert.ok(lines[0].endsWith("sh -c 'echo one two'"), lines[0]);
});

// docker-access/specs/call-log.md — a very long call is cut, and says by how much
test("an oversized path is truncated and the line says how much was left out", () => {
  const path = `/v1.43/images/json?filters=${"a".repeat(600)}`;
  logSocketCall(localEndpoint, { method: "GET", path, mode: "request" });

  assert.ok(lines[0].includes("… (+"), lines[0]);
  assert.ok(lines[0].length < path.length, "the line must be shorter than the path it reports");
});

// docker-access/specs/call-log.md — VEXEL_DOCKER_LOG=off silences both channels
test("VEXEL_DOCKER_LOG=off silences the log on both channels, and is read per call", async () => {
  process.env.VEXEL_DOCKER_LOG = "off";

  await assert.rejects(() => requestStream(unreachableEndpoint(), { path: "/v1.43/containers/json" }));
  await runCliCommand("echo", ["silenced"], localEndpoint).done;
  assert.deepEqual(lines, []);

  // Read per call: turning it back on inside the same process is enough.
  delete process.env.VEXEL_DOCKER_LOG;
  await runCliCommand("echo", ["heard"], localEndpoint).done;
  assert.equal(lines.length, 1);
});

// docker-access/specs/call-log.md — any other value leaves the log on
test("a value other than off leaves the log on", () => {
  process.env.VEXEL_DOCKER_LOG = "on";
  logSocketCall(localEndpoint, { method: "GET", path: "/_ping", mode: "request" });

  assert.equal(lines.length, 1);
});
