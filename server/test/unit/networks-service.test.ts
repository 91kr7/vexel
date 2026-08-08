import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DockerDaemonError } from "../../src/docker/errors.js";

// The service talks to the daemon only through the shared EngineClient: the
// mock stands in for it, so the IPAM merge, the attached-containers merge (list
// vs. inspect), the create/prune/attach/detach request shaping and
// daemon-failure propagation are the only behaviours under test.
let networksBody = "[]";
let containersBody = "[]";
let inspectBody = "{}";
let createResponseBody = "{}";
let pruneResponseBody = "{}";
let requestFailure: Error | undefined;
const requestedPaths: string[] = [];
// One entry per call, in order, mirroring requestedPaths: keeps the connect/
// disconnect/create request body inspectable even though attachContainer and
// detachContainer issue a follow-up GET whose own init has no body.
const requestInits: { method?: string; body?: string }[] = [];
let lastRequestInit: { method?: string; body?: string } | undefined;

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string, init?: { method?: string; body?: string }) => {
        requestedPaths.push(path);
        requestInits.push(init ?? {});
        lastRequestInit = init;
        if (requestFailure) throw requestFailure;
        if (path === "/networks") return { statusCode: 200, body: networksBody };
        if (path === "/containers/json?all=true") return { statusCode: 200, body: containersBody };
        if (path === "/networks/create") return { statusCode: 201, body: createResponseBody };
        if (path === "/networks/prune") return { statusCode: 200, body: pruneResponseBody };
        if (path.endsWith("/connect")) return { statusCode: 200, body: "{}" };
        if (path.endsWith("/disconnect")) return { statusCode: 200, body: "{}" };
        if (init?.method === "DELETE") return { statusCode: 204, body: "" };
        if (path.startsWith("/networks/")) return { statusCode: 200, body: inspectBody };
        throw new Error(`unexpected path: ${path}`);
      },
    }),
  },
});

const { listNetworks, getNetworkInspect, createNetwork, removeNetwork, pruneNetworks, attachContainer, detachContainer } =
  await import("../../src/networks/networks-service.js");

beforeEach(() => {
  networksBody = "[]";
  containersBody = "[]";
  inspectBody = "{}";
  createResponseBody = "{}";
  pruneResponseBody = "{}";
  requestFailure = undefined;
  requestedPaths.length = 0;
  requestInits.length = 0;
  lastRequestInit = undefined;
});

// networks-service.md — subnet/gateway/ipRange are undefined when the network carries no IPAM configuration
test("listNetworks leaves subnet, gateway and ipRange undefined for a network with no IPAM configuration", async () => {
  networksBody = JSON.stringify([{ Id: "net-a", Name: "net-a", Driver: "bridge", Scope: "local" }]);

  const networks = await listNetworks();

  assert.equal(networks[0]!.subnet, undefined);
  assert.equal(networks[0]!.gateway, undefined);
  assert.equal(networks[0]!.ipRange, undefined);
});

// networks-service.md — subnet/gateway/ipRange come from the network's own IPAM.Config[0]
test("listNetworks reads subnet, gateway and ipRange from the network's own IPAM.Config[0]", async () => {
  networksBody = JSON.stringify([
    {
      Id: "net-a",
      Name: "net-a",
      Driver: "bridge",
      Scope: "local",
      IPAM: { Config: [{ Subnet: "10.10.0.0/24", Gateway: "10.10.0.1", IPRange: "10.10.0.128/25" }] },
    },
  ]);

  const networks = await listNetworks();

  assert.equal(networks[0]!.subnet, "10.10.0.0/24");
  assert.equal(networks[0]!.gateway, "10.10.0.1");
  assert.equal(networks[0]!.ipRange, "10.10.0.128/25");
});

// networks-service.md — attachedContainers is derived from GET /containers/json's per-container
// NetworkSettings.Networks, empty for an unattached network
test("listNetworks merges attached container names from the container list, and leaves an unattached network empty", async () => {
  networksBody = JSON.stringify([
    { Id: "net-a", Name: "net-a", Driver: "bridge", Scope: "local" },
    { Id: "net-b", Name: "net-b", Driver: "bridge", Scope: "local" },
  ]);
  containersBody = JSON.stringify([
    { Names: ["/consumer-a"], NetworkSettings: { Networks: { "net-a": {} } } },
    { Names: ["/consumer-b"], NetworkSettings: { Networks: { "net-a": {} } } },
  ]);

  const networks = await listNetworks();

  const netA = networks.find((network) => network.name === "net-a")!;
  const netB = networks.find((network) => network.name === "net-b")!;
  assert.deepEqual(netA.attachedContainers.sort(), ["consumer-a", "consumer-b"]);
  assert.deepEqual(netB.attachedContainers, []);
});

// networks-service.md — every call rejects with a DockerDaemonError carrying the daemon's own message on failure
test("listNetworks rejects with the daemon's own error message on failure", async () => {
  requestFailure = new DockerDaemonError("DaemonRejected", "server error - please retry");

  await assert.rejects(() => listNetworks(), /server error - please retry/);
});

// networks-service.md — getNetworkInspect's attachedContainers is read from the inspect payload's own
// Containers map, authoritative unlike the listing
test("getNetworkInspect reads attached container names from its own Containers map, carrying the raw payload", async () => {
  const raw = {
    Id: "net-a",
    Name: "net-a",
    Driver: "bridge",
    Scope: "local",
    Containers: { "endpoint-1": { Name: "consumer-a" } },
  };
  inspectBody = JSON.stringify(raw);

  const inspect = await getNetworkInspect("net-a");

  assert.deepEqual(inspect.attachedContainers, ["consumer-a"]);
  assert.deepEqual(inspect.raw, raw);
});

// networks-endpoints.md — an unknown id/name propagates the daemon's own rejection
test("getNetworkInspect propagates the daemon's own rejection for an unknown id", async () => {
  requestFailure = new DockerDaemonError("NoSuchNetwork", "network does-not-exist not found", 404);

  await assert.rejects(() => getNetworkInspect("does-not-exist"), /not found/);
});

// networks-service.md — createNetwork posts the given name, driver, IPAM configuration, options and labels (REQ-73)
test("createNetwork posts the given name, driver, subnet/gateway/ipRange, options and labels to /networks/create", async () => {
  createResponseBody = JSON.stringify({ Id: "net-new" });
  inspectBody = JSON.stringify({ Id: "net-new", Name: "app-net", Driver: "bridge", Scope: "local" });

  await createNetwork({
    name: "app-net",
    driver: "bridge",
    subnet: "10.10.0.0/24",
    gateway: "10.10.0.1",
    ipRange: "10.10.0.128/25",
    options: { "com.docker.network.bridge.name": "br-app" },
    labels: { team: "vexel" },
  });

  const createIndex = requestedPaths.indexOf("/networks/create");
  assert.ok(createIndex >= 0, "expected a request to /networks/create");
  const body = JSON.parse(requestInits[createIndex]!.body!) as Record<string, unknown>;
  assert.equal(body.Name, "app-net");
  assert.equal(body.Driver, "bridge");
  assert.deepEqual(body.IPAM, { Config: [{ Subnet: "10.10.0.0/24", Gateway: "10.10.0.1", IPRange: "10.10.0.128/25" }] });
  assert.deepEqual(body.Options, { "com.docker.network.bridge.name": "br-app" });
  assert.deepEqual(body.Labels, { team: "vexel" });
});

// networks-service.md — an empty/blank driver defaults to the daemon's own default (bridge)
test("createNetwork omits the Driver field for a blank driver, letting the daemon default apply", async () => {
  createResponseBody = JSON.stringify({ Id: "net-new" });
  inspectBody = JSON.stringify({ Id: "net-new", Name: "app-net", Driver: "bridge", Scope: "local" });

  await createNetwork({ name: "app-net", driver: "   " });

  const createIndex = requestedPaths.indexOf("/networks/create");
  const body = JSON.parse(requestInits[createIndex]!.body!) as Record<string, unknown>;
  assert.equal(body.Driver, undefined);
});

// networks-service.md — removeNetwork issues a DELETE against the network's own path
test("removeNetwork issues a DELETE against the network's own path", async () => {
  await removeNetwork("net-a");

  assert.equal(requestedPaths.at(-1), "/networks/net-a");
  assert.equal(lastRequestInit?.method, "DELETE");
});

// networks-service.md — pruneNetworks prunes every network not currently used by a container, reporting removed names
test("pruneNetworks reports the removed network names from the daemon's own response", async () => {
  pruneResponseBody = JSON.stringify({ NetworksDeleted: ["orphan-1", "orphan-2"] });

  const result = await pruneNetworks();

  assert.equal(requestedPaths.at(-1), "/networks/prune");
  assert.deepEqual(result.removedNames, ["orphan-1", "orphan-2"]);
});

// networks-service.md — attachContainer posts the container under Container to /connect, then returns
// the network's updated inspect/attachment set (REQ-74)
test("attachContainer connects the given container and returns the network's updated inspect", async () => {
  inspectBody = JSON.stringify({
    Id: "net-a",
    Name: "net-a",
    Driver: "bridge",
    Scope: "local",
    Containers: { "endpoint-1": { Name: "consumer-a" } },
  });

  const result = await attachContainer("net-a", "consumer-a");

  const connectCallIndex = requestedPaths.indexOf("/networks/net-a/connect");
  assert.ok(connectCallIndex >= 0, "expected a request to /networks/net-a/connect");
  const connectBody = JSON.parse(requestInits[connectCallIndex]!.body!) as Record<string, unknown>;
  assert.equal(connectBody.Container, "consumer-a");
  assert.deepEqual(result.attachedContainers, ["consumer-a"]);
});

// networks-service.md — detachContainer posts the container under Container with Force to /disconnect,
// then returns the network's updated inspect/attachment set (REQ-74)
test("detachContainer force-disconnects the given container and returns the network's updated inspect", async () => {
  inspectBody = JSON.stringify({ Id: "net-a", Name: "net-a", Driver: "bridge", Scope: "local", Containers: {} });

  const result = await detachContainer("net-a", "consumer-a");

  const disconnectCallIndex = requestedPaths.indexOf("/networks/net-a/disconnect");
  assert.ok(disconnectCallIndex >= 0, "expected a request to /networks/net-a/disconnect");
  const disconnectBody = JSON.parse(requestInits[disconnectCallIndex]!.body!) as Record<string, unknown>;
  assert.equal(disconnectBody.Container, "consumer-a");
  assert.equal(disconnectBody.Force, true);
  assert.deepEqual(result.attachedContainers, []);
});
