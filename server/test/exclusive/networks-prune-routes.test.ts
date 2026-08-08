import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { networksRouter } from "../../src/networks/networks-routes.js";
import type { NetworkSummary } from "../../src/networks/networks-service.js";
import { buildApp, ownershipArgs, removeNetworkQuietly, startApp } from "../support/fixtures.js";

const execFileAsync = promisify(execFile);

// Network prune exercises the daemon's own prune semantics (`POST
// /networks/prune`, networks-service.md), which act on every network not
// currently used by a container on the host — not only the fixture set up
// here. No labelling can scope it, so it lives apart and runs alone,
// mirroring the containers/images/volumes prune tests in this same folder.

async function createUnusedNetwork(name: string): Promise<void> {
  await execFileAsync("docker", ["network", "create", ...ownershipArgs(name), name]);
}

async function fetchList(url: string): Promise<NetworkSummary[]> {
  const response = await fetch(`${url}/api/networks`);
  return (await response.json()) as NetworkSummary[];
}

// plan-docker_management_app/REQ-73 — unused networks can be pruned
test("POST /api/networks/prune removes an unused network and reports it among the removed names", async () => {
  const name = `vexel-test-prune-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/networks", networksRouter));
  try {
    await createUnusedNetwork(name);
    const response = await fetch(`${url}/api/networks/prune`, { method: "POST" });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { removedNames: string[] };
    assert.ok(body.removedNames.includes(name), `expected ${name} among the pruned networks`);

    const networks = await fetchList(url);
    assert.ok(!networks.some((network) => network.name === name));
  } finally {
    await removeNetworkQuietly(name);
    await close();
  }
});
