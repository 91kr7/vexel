import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DockerDaemonError } from "../../src/docker/errors.js";
import { installEngineMock } from "../support/engine-mock.js";

// The swarm's secrets and configs: listed, created, inspected as metadata and
// removed (swarm/specs/swarm-secrets-service.md, REQ-84).
//
// The daemon is mocked, and — like a real one — it hands a *config's* data back
// on every read. That is precisely the case the contract turns on: the daemon
// would return it, and this service must not.
const engine = installEngineMock();

const { listSwarmData, getSwarmDataMetadata, createSwarmData, removeSwarmData } = await import(
  "../../src/swarm/swarm-secrets-service.js"
);

const NAMESPACE = "com.docker.stack.namespace";
const CONFIG_CONTENT = "server { listen 80; } # the content of a config, which must never come back";

function managerInfo(): unknown {
  return { Swarm: { NodeID: "self-node-id", LocalNodeState: "active", ControlAvailable: true, Error: "" } };
}

function inactiveInfo(): unknown {
  return { Swarm: { NodeID: "", LocalNodeState: "inactive", ControlAvailable: false, Error: "" } };
}

interface RawDataOverrides {
  ID?: string;
  name?: string;
  stack?: string;
  /** A config's data, which the daemon returns base64-encoded. */
  data?: string;
}

function rawData(overrides: RawDataOverrides = {}): Record<string, unknown> {
  const { ID = "obj-1", name = "db_password", stack, data } = overrides;
  return {
    ID,
    Version: { Index: 3 },
    CreatedAt: "2026-01-01T00:00:00.000000000Z",
    UpdatedAt: "2026-02-01T00:00:00.000000000Z",
    Spec: {
      Name: name,
      Labels: stack ? { [NAMESPACE]: stack } : {},
      ...(data === undefined ? {} : { Data: Buffer.from(data, "utf8").toString("base64") }),
    },
  };
}

beforeEach(() => {
  engine.reset();
  engine.on("GET", "/info", () => managerInfo());
  engine.on("GET", "/secrets", () => []);
  engine.on("GET", "/configs", () => []);
});

// swarm-secrets-service.md — SwarmDataItem = kind, id, name, createdAt, updatedAt, version, labels,
// stack; "ordered by name"
test("listSwarmData reports each secret with its name, age and the stack it belongs to, ordered by name", async () => {
  engine.on("GET", "/secrets", () => [
    rawData({ ID: "s2", name: "zeta_token" }),
    rawData({ ID: "s1", name: "alpha_password", stack: "alpha" }),
  ]);

  const listing = await listSwarmData("secret");

  assert.deepEqual(
    listing.items.map((item) => item.name),
    ["alpha_password", "zeta_token"],
  );
  const first = listing.items[0]!;
  assert.equal(first.kind, "secret");
  assert.equal(first.id, "s1");
  assert.equal(first.createdAt, "2026-01-01T00:00:00.000000000Z");
  assert.equal(first.version, 3);
  assert.equal(first.stack, "alpha");
});

// swarm-secrets-service.md — "No value ever leaves this service — not in a listing ... a config's
// data, which the daemon *does* return, is stripped here for the same reason" (REQ-84)
test("listSwarmData strips a config's data, which the daemon hands back", async () => {
  engine.on("GET", "/configs", () => [rawData({ ID: "c1", name: "nginx_conf", data: CONFIG_CONTENT })]);

  const listing = await listSwarmData("config");

  const serialised = JSON.stringify(listing);
  assert.equal(listing.items[0]!.name, "nginx_conf");
  assert.ok(!serialised.includes(CONFIG_CONTENT), `a config's data must not be listed: ${serialised}`);
  assert.ok(
    !serialised.includes(Buffer.from(CONFIG_CONTENT, "utf8").toString("base64")),
    "not even the encoded form of the data may be listed",
  );
});

// swarm-secrets-service.md — getSwarmDataMetadata: "the same metadata as the listing, for one
// object; never any data"
test("getSwarmDataMetadata answers metadata only, never the data the daemon returns", async () => {
  engine.on("GET", "/configs/c1", () => rawData({ ID: "c1", name: "nginx_conf", stack: "blog", data: CONFIG_CONTENT }));

  const item = await getSwarmDataMetadata("config", "c1");

  assert.equal(item.id, "c1");
  assert.equal(item.name, "nginx_conf");
  assert.equal(item.stack, "blog");
  const serialised = JSON.stringify(item);
  assert.ok(!serialised.includes(CONFIG_CONTENT), `an inspection must carry no data: ${serialised}`);
  assert.ok(!serialised.includes(Buffer.from(CONFIG_CONTENT, "utf8").toString("base64")));
});

// swarm-secrets-service.md — "rejects if the daemon is not a manager"
test("getSwarmDataMetadata rejects off a manager", async () => {
  engine.on("GET", "/info", () => inactiveInfo());

  await assert.rejects(getSwarmDataMetadata("secret", "s1"), /not part of a swarm/i);
});

// swarm-secrets-service.md — "off a manager: no items and the stated reason"
test("listSwarmData degrades to a stated reason off a manager", async () => {
  engine.on("GET", "/info", () => inactiveInfo());

  const listing = await listSwarmData("secret");

  assert.deepEqual(listing.items, []);
  assert.ok((listing.unavailableReason ?? "").length > 0);
  assert.equal(engine.callsTo("GET", "/secrets").length, 0);
});

// swarm-secrets-service.md — createSwarmData "rejects on an empty name or an empty value"
test("createSwarmData rejects an empty name and an empty value, without asking the daemon", async () => {
  await assert.rejects(createSwarmData("secret", { name: "  ", value: "a-value" }));
  await assert.rejects(createSwarmData("secret", { name: "db_password", value: "" }));

  assert.equal(engine.callsTo("POST", "/secrets/create").length, 0);
});

// swarm-secrets-service.md — "The value is base64-encoded on its way to the daemon"; "The value
// travels in a request body, never in a path or a query string"; the answer is "the created
// object's metadata only — never the value it was just given" (REQ-84)
test("createSwarmData sends the value once, encoded, in the body — and answers with metadata alone", async () => {
  const value = "c0rrect-horse-battery-staple";
  engine.on("POST", "/secrets/create", () => ({ ID: "s-new" }));
  engine.on("GET", "/secrets/s-new", () => rawData({ ID: "s-new", name: "db_password" }));
  engine.on("GET", "/secrets", () => [rawData({ ID: "s-new", name: "db_password" })]);

  const created = await createSwarmData("secret", { name: "db_password", value, labels: { owner: "team" } });

  const request = engine.callsTo("POST", "/secrets/create")[0]!;
  assert.ok(!request.path.includes(value), "the value must never travel in a path or a query string");
  const body = request.json as { Name?: string; Data?: string; Labels?: Record<string, string> };
  assert.equal(body.Name, "db_password");
  assert.equal(body.Data, Buffer.from(value, "utf8").toString("base64"), "the daemon takes the value base64-encoded");
  assert.deepEqual(body.Labels, { owner: "team" });

  const serialised = JSON.stringify(created);
  assert.equal(created.name, "db_password");
  assert.ok(!serialised.includes(value), `a creation must not answer with the value it was given: ${serialised}`);
  assert.ok(!serialised.includes(body.Data!), "not even the encoded form of the value may come back");
});

// swarm-secrets-service.md — "rejects ... on a name already taken, and on any other daemon refusal,
// with the daemon's own message"; the refusal must carry no value either (REQ-84)
test("createSwarmData reports the daemon's refusal, with the value nowhere in it", async () => {
  const value = "another-secret-value-0987";
  engine.on("POST", "/secrets/create", () => {
    throw new DockerDaemonError("DaemonRejected", "secret 'db_password' already exists", undefined, 409);
  });

  await assert.rejects(createSwarmData("secret", { name: "db_password", value }), (error: Error) => {
    assert.match(error.message, /already exists/);
    assert.ok(!error.message.includes(value), "a refusal must not echo the value back");
    return true;
  });
});

// swarm-secrets-service.md — removeSwarmData: "the object is gone from the cluster's store";
// "rejects if the daemon is not a manager, and with the daemon's message when a service still uses
// it"
test("removeSwarmData removes the object, rejects off a manager, and reports a refusal", async () => {
  engine.on("DELETE", "/secrets/s1", () => ({}));
  await removeSwarmData("secret", "s1");
  assert.equal(engine.callsTo("DELETE", "/secrets/s1").length, 1);

  engine.on("DELETE", "/configs/c1", () => {
    throw new DockerDaemonError("DaemonRejected", "config 'nginx_conf' is in use by service 'blog_web'", undefined, 503);
  });
  await assert.rejects(removeSwarmData("config", "c1"), /in use by service/);

  engine.on("GET", "/info", () => inactiveInfo());
  await assert.rejects(removeSwarmData("secret", "s1"), /not part of a swarm/i);
  assert.equal(engine.callsTo("DELETE", "/secrets/s1").length, 1, "nothing is sent where it cannot be served");
});
