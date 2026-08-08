import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { networksRouter } from "../../src/networks/networks-routes.js";
import type { NetworkInspect, NetworkSummary } from "../../src/networks/networks-service.js";
import {
  buildApp,
  createSleepingContainer,
  ownershipArgs,
  removeContainerQuietly,
  removeNetworkQuietly,
  startApp,
} from "../support/fixtures.js";

const execFileAsync = promisify(execFile);

async function createTestNetwork(name: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync("docker", ["network", "create", ...ownershipArgs(name), ...extraArgs, name]);
}

async function fetchList(url: string): Promise<NetworkSummary[]> {
  const response = await fetch(`${url}/api/networks`);
  return (await response.json()) as NetworkSummary[];
}

// plan-docker_management_app/REQ-72 — networks are listed with name, driver, scope, subnet and gateway
test("GET /api/networks lists a network with its driver, scope, subnet and gateway", async () => {
  const name = `vexel-test-list-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/networks", networksRouter));
  await createTestNetwork(name, ["--subnet", "10.199.10.0/24", "--gateway", "10.199.10.1"]);
  try {
    const networks = await fetchList(url);
    const found = networks.find((network) => network.name === name);
    assert.ok(found, "created network not found in the list");
    assert.equal(found!.driver, "bridge");
    assert.equal(found!.scope, "local");
    assert.equal(found!.subnet, "10.199.10.0/24");
    assert.equal(found!.gateway, "10.199.10.1");
  } finally {
    await removeNetworkQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-72 — the containers attached to a network are listed by name
test("GET /api/networks reports the container attached to a network by name", async () => {
  const networkName = `vexel-test-attached-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/networks", networksRouter));
  await createTestNetwork(networkName);
  const { name: containerName } = await createSleepingContainer("network-attached", ["--network", networkName]);
  try {
    const networks = await fetchList(url);
    const found = networks.find((network) => network.name === networkName);
    assert.ok(found, "attached network not found in the list");
    assert.deepEqual(found!.attachedContainers, [containerName]);
  } finally {
    await removeContainerQuietly(containerName);
    await removeNetworkQuietly(networkName);
    await close();
  }
});

// plan-docker_management_app/REQ-73 — a network can be inspected in full
test("GET /api/networks/:id/inspect returns the network's full inspect data, raw payload included", async () => {
  const name = `vexel-test-inspect-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/networks", networksRouter));
  await createTestNetwork(name, ["--driver", "bridge", "--subnet", "10.199.11.0/24", "--label", "team=vexel"]);
  try {
    const response = await fetch(`${url}/api/networks/${name}/inspect`);
    assert.equal(response.status, 200);
    const inspect = (await response.json()) as NetworkInspect;

    assert.equal(inspect.name, name);
    assert.equal(inspect.driver, "bridge");
    assert.equal(inspect.subnet, "10.199.11.0/24");
    assert.equal(inspect.labels.team, "vexel");
    assert.ok(inspect.raw && typeof inspect.raw === "object");
  } finally {
    await removeNetworkQuietly(name);
    await close();
  }
});

// networks-endpoints.md — an unknown id/name responds with the daemon's own 404 rejection
test("GET /api/networks/:id/inspect with an unknown id responds with the daemon's own rejection message", async () => {
  const { url, close } = await startApp(buildApp("/api/networks", networksRouter));
  try {
    const response = await fetch(`${url}/api/networks/does-not-exist-${Date.now()}/inspect`);
    assert.equal(response.status, 404);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-73 — a network can be created with a name, driver, subnet, gateway,
// IP range, options and labels
test("POST /api/networks creates a network carrying the given driver, IPAM configuration and labels", async () => {
  const name = `vexel-test-create-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/networks", networksRouter));
  try {
    const response = await fetch(`${url}/api/networks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        driver: "bridge",
        subnet: "10.199.12.0/24",
        gateway: "10.199.12.1",
        ipRange: "10.199.12.128/25",
        labels: { team: "vexel" },
      }),
    });
    assert.equal(response.status, 201);
    const created = (await response.json()) as NetworkSummary;
    assert.equal(created.name, name);
    assert.equal(created.driver, "bridge");
    assert.equal(created.subnet, "10.199.12.0/24");
    assert.equal(created.gateway, "10.199.12.1");
    assert.equal(created.labels.team, "vexel");

    const networks = await fetchList(url);
    assert.ok(networks.some((network) => network.name === name));
  } finally {
    await removeNetworkQuietly(name);
    await close();
  }
});

// networks-endpoints.md — a missing/blank name responds 400
test("POST /api/networks with a blank name responds 400 without creating a network", async () => {
  const { url, close } = await startApp(buildApp("/api/networks", networksRouter));
  try {
    const response = await fetch(`${url}/api/networks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string };
    assert.ok(typeof body.error === "string" && body.error.length > 0);
  } finally {
    await close();
  }
});

// plan-docker_management_app/REQ-73 — a network can be removed
test("DELETE /api/networks/:id removes the network so it no longer appears in the list", async () => {
  const name = `vexel-test-remove-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/networks", networksRouter));
  await createTestNetwork(name);
  try {
    const response = await fetch(`${url}/api/networks/${name}`, { method: "DELETE" });
    assert.equal(response.status, 204);

    const networks = await fetchList(url);
    assert.ok(!networks.some((network) => network.name === name));
  } finally {
    await removeNetworkQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-74 — a container can be attached to a network, and the attachment
// list updates accordingly
test("POST /api/networks/:id/attach attaches a container, reflected in the network's attachment list", async () => {
  const networkName = `vexel-test-attach-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/networks", networksRouter));
  await createTestNetwork(networkName);
  const { name: containerName } = await createSleepingContainer("attach-target");
  try {
    const response = await fetch(`${url}/api/networks/${networkName}/attach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ containerId: containerName }),
    });
    assert.equal(response.status, 200);
    const inspect = (await response.json()) as NetworkInspect;
    assert.deepEqual(inspect.attachedContainers, [containerName]);

    const networks = await fetchList(url);
    const found = networks.find((network) => network.name === networkName);
    assert.deepEqual(found!.attachedContainers, [containerName]);
  } finally {
    await removeContainerQuietly(containerName);
    await removeNetworkQuietly(networkName);
    await close();
  }
});

// networks-endpoints.md — a missing/blank containerId responds 400
test("POST /api/networks/:id/attach with a blank containerId responds 400", async () => {
  const networkName = `vexel-test-attach-invalid-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/networks", networksRouter));
  await createTestNetwork(networkName);
  try {
    const response = await fetch(`${url}/api/networks/${networkName}/attach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ containerId: "" }),
    });
    assert.equal(response.status, 400);
  } finally {
    await removeNetworkQuietly(networkName);
    await close();
  }
});

// plan-docker_management_app/REQ-74 — a container can be detached from a network, and the attachment
// list updates accordingly
test("POST /api/networks/:id/detach detaches a container, removing it from the network's attachment list", async () => {
  const networkName = `vexel-test-detach-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/networks", networksRouter));
  await createTestNetwork(networkName);
  const { name: containerName } = await createSleepingContainer("detach-target", ["--network", networkName]);
  try {
    const response = await fetch(`${url}/api/networks/${networkName}/detach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ containerId: containerName }),
    });
    assert.equal(response.status, 200);
    const inspect = (await response.json()) as NetworkInspect;
    assert.deepEqual(inspect.attachedContainers, []);

    const networks = await fetchList(url);
    const found = networks.find((network) => network.name === networkName);
    assert.deepEqual(found!.attachedContainers, []);
  } finally {
    await removeContainerQuietly(containerName);
    await removeNetworkQuietly(networkName);
    await close();
  }
});

// networks-endpoints.md — a missing/blank containerId responds 400
test("POST /api/networks/:id/detach with a blank containerId responds 400", async () => {
  const networkName = `vexel-test-detach-invalid-${Date.now()}`;
  const { url, close } = await startApp(buildApp("/api/networks", networksRouter));
  await createTestNetwork(networkName);
  try {
    const response = await fetch(`${url}/api/networks/${networkName}/detach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ containerId: "" }),
    });
    assert.equal(response.status, 400);
  } finally {
    await removeNetworkQuietly(networkName);
    await close();
  }
});
