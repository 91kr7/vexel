import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DockerDaemonError } from "../../src/docker/errors.js";
import { installEngineMock, type EngineCall } from "../support/engine-mock.js";

// The stacks of the swarm, listed from the namespace label with their services,
// and their removal (swarm/specs/swarm-stacks-service.md, REQ-83).
//
// The daemon is mocked, and it applies the label filter it is given exactly as
// a real one would: a service that asks for a collection without the namespace
// filter would therefore be handed every object on the daemon, which is what
// "nothing outside the stack is touched" has to be proved against.
const engine = installEngineMock();

const { listStacks, removeStack } = await import("../../src/swarm/swarm-stacks-service.js");

const NAMESPACE = "com.docker.stack.namespace";

function managerInfo(): unknown {
  return { Swarm: { NodeID: "self-node-id", LocalNodeState: "active", ControlAvailable: true, Error: "" } };
}

function inactiveInfo(): unknown {
  return { Swarm: { NodeID: "", LocalNodeState: "inactive", ControlAvailable: false, Error: "" } };
}

interface Labelled {
  ID: string;
  name: string;
  stack?: string;
}

function specObject(entry: Labelled): Record<string, unknown> {
  return {
    ID: entry.ID,
    Version: { Index: 1 },
    CreatedAt: "2026-01-01T00:00:00.000000000Z",
    Spec: {
      Name: entry.name,
      Labels: entry.stack ? { [NAMESPACE]: entry.stack } : {},
      TaskTemplate: { ContainerSpec: { Image: "alpine:3.20" } },
      Mode: { Replicated: { Replicas: 1 } },
      EndpointSpec: { Ports: [] },
    },
  };
}

function networkObject(entry: Labelled): Record<string, unknown> {
  return { Id: entry.ID, Name: entry.name, Labels: entry.stack ? { [NAMESPACE]: entry.stack } : {} };
}

/** The label filter the daemon was given, if any: `{"label":["key=value"]}`. */
function requestedLabels(call: EngineCall): string[] {
  const filters = call.query.get("filters");
  if (!filters) return [];
  const parsed = JSON.parse(filters) as { label?: string[] | Record<string, boolean> };
  const label = parsed.label;
  if (Array.isArray(label)) return label;
  if (label && typeof label === "object") return Object.keys(label);
  return [];
}

/** Answers a collection the way the daemon does: filtered by the label the caller asked for. */
function collection(entries: Labelled[], shape: (entry: Labelled) => Record<string, unknown>) {
  return (call: EngineCall) => {
    const wanted = requestedLabels(call)
      .filter((label) => label.startsWith(`${NAMESPACE}=`))
      .map((label) => label.slice(NAMESPACE.length + 1));
    const selected = wanted.length === 0 ? entries : entries.filter((entry) => entry.stack !== undefined && wanted.includes(entry.stack));
    return selected.map(shape);
  };
}

beforeEach(() => {
  engine.reset();
  engine.on("GET", "/info", () => managerInfo());
  engine.on("GET", "/services", collection([], specObject));
  engine.on("GET", "/secrets", collection([], specObject));
  engine.on("GET", "/configs", collection([], specObject));
  engine.on("GET", "/networks", collection([], networkObject));
});

// swarm-stacks-service.md — SwarmStack = name, serviceCount, services[], secretCount, configCount,
// networkCount; "services -> ... the service's own name as the daemon holds it (namespace
// included), ordered by name"
test("listStacks reports a stack with its services and the counts of what belongs to it", async () => {
  engine.on(
    "GET",
    "/services",
    collection(
      [
        { ID: "s2", name: "blog_worker", stack: "blog" },
        { ID: "s1", name: "blog_api", stack: "blog" },
      ],
      specObject,
    ),
  );
  engine.on("GET", "/secrets", collection([{ ID: "sec1", name: "blog_db_password", stack: "blog" }], specObject));
  engine.on("GET", "/configs", collection([{ ID: "cfg1", name: "blog_nginx", stack: "blog" }], specObject));
  engine.on(
    "GET",
    "/networks",
    collection(
      [
        { ID: "net1", name: "blog_default", stack: "blog" },
        { ID: "net2", name: "blog_back", stack: "blog" },
      ],
      networkObject,
    ),
  );

  const listing = await listStacks();

  assert.equal(listing.items.length, 1);
  const stack = listing.items[0]!;
  assert.equal(stack.name, "blog");
  assert.equal(stack.serviceCount, 2);
  assert.equal(stack.secretCount, 1);
  assert.equal(stack.configCount, 1);
  assert.equal(stack.networkCount, 2);
  assert.deepEqual(
    stack.services.map((service) => service.name),
    ["blog_api", "blog_worker"],
    "the services keep the daemon's own names, ordered by name",
  );
});

// swarm-stacks-service.md — "a stack exists as soon as one object carries its namespace, even with
// no service left"
test("listStacks lists a stack that has only a secret left", async () => {
  engine.on("GET", "/secrets", collection([{ ID: "sec1", name: "ghost_token", stack: "ghost" }], specObject));

  const listing = await listStacks();

  assert.deepEqual(
    listing.items.map((stack) => stack.name),
    ["ghost"],
  );
  assert.equal(listing.items[0]!.serviceCount, 0);
  assert.deepEqual(listing.items[0]!.services, []);
});

// swarm-stacks-service.md — "An object without the namespace label is never part of any stack";
// "ordered by stack name"
test("listStacks ignores objects carrying no namespace, and orders the stacks by name", async () => {
  engine.on(
    "GET",
    "/services",
    collection(
      [
        { ID: "s1", name: "zulu_api", stack: "zulu" },
        { ID: "s2", name: "standalone-api" },
        { ID: "s3", name: "alpha_api", stack: "alpha" },
      ],
      specObject,
    ),
  );

  const listing = await listStacks();

  assert.deepEqual(
    listing.items.map((stack) => stack.name),
    ["alpha", "zulu"],
  );
  const everyService = listing.items.flatMap((stack) => stack.services.map((service) => service.name));
  assert.ok(!everyService.includes("standalone-api"), "a service with no namespace belongs to no stack");
});

// swarm-stacks-service.md — stacks and their nested services are "ordered by name under the
// list-order rule (compareNames)": digit runs read as numbers, case does not split the list (REQ-23).
test("listStacks reads digit runs in a stack and in a service name as numbers", async () => {
  engine.on(
    "GET",
    "/services",
    collection(
      [
        { ID: "s1", name: "app-10_web-10", stack: "app-10" },
        { ID: "s2", name: "app-2_web-10", stack: "app-2" },
        { ID: "s3", name: "app-2_web-2", stack: "app-2" },
        { ID: "s4", name: "APP-3_web", stack: "APP-3" },
      ],
      specObject,
    ),
  );

  const listing = await listStacks();

  assert.deepEqual(
    listing.items.map((stack) => stack.name),
    ["app-2", "APP-3", "app-10"],
  );
  assert.deepEqual(
    listing.items[0]!.services.map((service) => service.name),
    ["app-2_web-2", "app-2_web-10"],
  );
});

// swarm-stacks-service.md — a stack's final comparison is "that same name compared exactly", a
// nested service's is the service id, and "the same stacks produce the same sequence on every read,
// whatever order the daemon listed the underlying services in" (REQ-24, REQ-25, REQ-6).
//
// Both the stack names and the service names below tie under the name comparison, so only the final
// comparison separates them; the nesting must survive it.
test("listStacks produces one sequence for tying stack and service names, whatever order the daemon listed them in", async () => {
  const daemonOrder = [
    { ID: "s-y", name: "app-01_web-1", stack: "app-01" },
    { ID: "s-x", name: "app-01_web-01", stack: "app-01" },
    { ID: "s-w", name: "App-1_api", stack: "App-1" },
  ];
  const read = async () => {
    const listing = await listStacks();
    return listing.items.map((stack) => ({ stack: stack.name, services: stack.services.map((service) => service.id) }));
  };
  const expected = [
    { stack: "App-1", services: ["s-w"] },
    { stack: "app-01", services: ["s-x", "s-y"] },
  ];

  engine.on("GET", "/services", collection(daemonOrder, specObject));
  const asListed = await read();

  engine.on("GET", "/services", collection([...daemonOrder].reverse(), specObject));
  const reversed = await read();

  assert.deepEqual(asListed, expected);
  assert.deepEqual(reversed, expected, "the same stacks must come out the same way in either input order");
});

// swarm-stacks-service.md — "off a manager: no items and the stated reason"
test("listStacks degrades to a stated reason off a manager", async () => {
  engine.on("GET", "/info", () => inactiveInfo());

  const listing = await listStacks();

  assert.deepEqual(listing.items, []);
  assert.ok((listing.unavailableReason ?? "").length > 0);
});

// swarm-stacks-service.md — removeStack: "every service, secret, config and network belonging to
// that stack is gone; nothing outside the stack is touched"; "the four lists name what was actually
// removed"; "Removal follows the same order the CLI uses — services first, then secrets, configs and
// networks"
test("removeStack removes the stack's own objects, in order, and names what went", async () => {
  engine.on(
    "GET",
    "/services",
    collection(
      [
        { ID: "s1", name: "blog_api", stack: "blog" },
        { ID: "s9", name: "other_api", stack: "other" },
      ],
      specObject,
    ),
  );
  engine.on("GET", "/secrets", collection([{ ID: "sec1", name: "blog_password", stack: "blog" }], specObject));
  engine.on("GET", "/configs", collection([{ ID: "cfg1", name: "blog_nginx", stack: "blog" }], specObject));
  engine.on(
    "GET",
    "/networks",
    collection(
      [
        { ID: "net1", name: "blog_default", stack: "blog" },
        { ID: "net9", name: "bridge" },
      ],
      networkObject,
    ),
  );
  engine.on("DELETE", /^\/(services|secrets|configs|networks)\/.+$/, () => ({}));

  const result = await removeStack("blog");

  assert.deepEqual(result.removedServices, ["blog_api"]);
  assert.deepEqual(result.removedSecrets, ["blog_password"]);
  assert.deepEqual(result.removedConfigs, ["blog_nginx"]);
  assert.deepEqual(result.removedNetworks, ["blog_default"]);

  const removals = engine.calls.filter((call) => call.method === "DELETE").map((call) => call.pathname);
  assert.deepEqual(removals, ["/services/s1", "/secrets/sec1", "/configs/cfg1", "/networks/net1"]);
  assert.ok(
    !removals.some((path) => path.endsWith("/s9") || path.endsWith("/net9")),
    "an object outside the stack is never removed by a stack removal",
  );
});

// swarm-stacks-service.md — removeStack "rejects when the name is empty"
test("removeStack rejects an empty name without removing anything", async () => {
  await assert.rejects(removeStack("   "));

  assert.equal(engine.calls.filter((call) => call.method === "DELETE").length, 0);
});

// swarm-stacks-service.md — "rejects ... when the daemon is not a manager"
test("removeStack rejects off a manager", async () => {
  engine.on("GET", "/info", () => inactiveInfo());

  await assert.rejects(removeStack("blog"), /not part of a swarm/i);
  assert.equal(engine.calls.filter((call) => call.method === "DELETE").length, 0);
});

// swarm-stacks-service.md — "rejects ... with the daemon's own message when a removal is refused —
// the objects removed before the refusal stay removed"
test("removeStack reports the daemon's refusal and leaves what it had already removed removed", async () => {
  engine.on("GET", "/services", collection([{ ID: "s1", name: "blog_api", stack: "blog" }], specObject));
  engine.on("GET", "/secrets", collection([{ ID: "sec1", name: "blog_password", stack: "blog" }], specObject));
  engine.on("DELETE", "/services/s1", () => ({}));
  engine.on("DELETE", "/secrets/sec1", () => {
    throw new DockerDaemonError("DaemonRejected", "secret 'blog_password' is in use by service", undefined, 503);
  });

  await assert.rejects(removeStack("blog"), /in use by service/);

  assert.equal(engine.callsTo("DELETE", "/services/s1").length, 1, "what was removed before the refusal stays removed");
});
