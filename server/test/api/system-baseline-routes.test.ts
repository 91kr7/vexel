import { test } from "node:test";
import assert from "node:assert/strict";
import { systemRouter } from "../../src/system/system-routes.js";
import type { BaselineReport } from "../../src/system/baseline-service.js";
import { CLIENT_MAX_API_VERSION } from "../../src/docker/engine-client.js";
import { parseEndpointUrl, setActiveEndpoint } from "../../src/docker/endpoint.js";
import { buildApp, startApp } from "../support/fixtures.js";
import { execFileAsync } from "../support/docker-cli.js";

// The baseline endpoint against the operator's own daemon (REQ-106,
// system-endpoints.md). It creates nothing and removes nothing: the reading is
// read-only by contract.
//
// Neither version is written into an assertion. The declared one is the Engine
// client's own maximum and the daemon's are asked of Docker itself — the same
// source the application reads — so this file states nothing about the machine
// it runs on, and keeps saying the truth when either side moves.

/** What Docker itself reports for the daemon behind the active context. */
async function daemonVersionsFromDocker(): Promise<{ version: string; apiVersion: string }> {
  const { stdout } = await execFileAsync("docker", ["version", "--format", "{{.Server.Version}}|{{.Server.APIVersion}}"]);
  const [version, apiVersion] = stdout.trim().split("|");
  return { version: version ?? "", apiVersion: apiVersion ?? "" };
}

/** The verdict baseline-service.md prescribes for a pair of `<major>.<minor>` readings. */
function expectedComparison(declared: string, daemon: string): "match" | "daemon-newer" | "daemon-older" | "unknown" {
  const parse = (value: string) => /^(\d+)\.(\d+)$/.exec(value.trim());
  const left = parse(declared);
  const right = parse(daemon);
  if (!left || !right) return "unknown";
  const difference = Number(right[1]) !== Number(left[1]) ? Number(right[1]) - Number(left[1]) : Number(right[2]) - Number(left[2]);
  if (difference === 0) return "match";
  return difference > 0 ? "daemon-newer" : "daemon-older";
}

// plan-docker_management_app/REQ-106 — the declared Engine API and CLI baseline is stated next to
// the daemon currently connected, so a mismatch is visible
test("GET /api/system/baseline states the declared baseline next to the connected daemon's own versions", async () => {
  const { url, close } = await startApp(buildApp("/api/system", systemRouter));
  try {
    const fromDocker = await daemonVersionsFromDocker();

    const response = await fetch(`${url}/api/system/baseline`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as BaselineReport;

    // The declared half is a property of the application, stated whatever the daemon says.
    assert.equal(body.declared.engineApiVersion, CLIENT_MAX_API_VERSION);
    assert.equal(typeof body.declared.cliVersion, "string");
    assert.ok(body.declared.cliVersion.length > 0);

    // The daemon half is the daemon Docker itself reports for the active context.
    assert.equal(body.daemonUnavailableDetail, undefined, "the daemon answered docker, so it must not be reported unavailable");
    assert.ok(body.daemon, "the daemon half must be present when the daemon is reachable");
    assert.equal(body.daemon?.version, fromDocker.version);
    assert.equal(body.daemon?.apiVersion, fromDocker.apiVersion);

    // The mismatch is visible: the verdict follows from the two readings themselves.
    assert.equal(body.comparison, expectedComparison(CLIENT_MAX_API_VERSION, fromDocker.apiVersion));
  } finally {
    await close();
  }
});

// system-endpoints.md — "an unreachable daemon is not an error here: the response is still 200,
// with daemonUnavailableDetail in place of daemon and comparison unknown"
test("GET /api/system/baseline answers 200 with the declared half when the daemon cannot be reached", async () => {
  const previousHost = process.env.DOCKER_HOST;
  const { url, close } = await startApp(buildApp("/api/system", systemRouter));
  try {
    // The active endpoint is process-wide state of this test process alone, and it is put back
    // below: an endpoint nothing listens on makes the daemon reading fail without touching the
    // operator's daemon. `DOCKER_HOST` outranks it, so it steps aside for the duration.
    delete process.env.DOCKER_HOST;
    setActiveEndpoint(parseEndpointUrl("tcp://127.0.0.1:1"));

    const response = await fetch(`${url}/api/system/baseline`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as BaselineReport;

    assert.equal(body.declared.engineApiVersion, CLIENT_MAX_API_VERSION);
    assert.equal(body.daemon, undefined);
    assert.equal(typeof body.daemonUnavailableDetail, "string");
    assert.ok((body.daemonUnavailableDetail ?? "").length > 0, "the reason the daemon could not be read must be stated");
    assert.equal(body.comparison, "unknown");
  } finally {
    setActiveEndpoint(undefined);
    if (previousHost !== undefined) process.env.DOCKER_HOST = previousHost;
    await close();
  }
});
