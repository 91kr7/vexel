import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DockerDaemonError } from "../../src/docker/errors.js";
import { installEngineMock } from "../support/engine-mock.js";

// The service inventory of the swarm, its creation, update, inspection with
// tasks and removal (swarm/specs/swarm-services-service.md, REQ-82).
//
// The daemon is mocked: a pinned digest, a global service, an unpublished port
// and a task whose node has not been assigned yet are all readings a real
// single-node cluster would not produce on demand.
const engine = installEngineMock();

const { listServices, getServiceDetail, createService, updateService, removeService } = await import(
  "../../src/swarm/swarm-services-service.js"
);

function managerInfo(): unknown {
  return { Swarm: { NodeID: "self-node-id", LocalNodeState: "active", ControlAvailable: true, Error: "" } };
}

function inactiveInfo(): unknown {
  return { Swarm: { NodeID: "", LocalNodeState: "inactive", ControlAvailable: false, Error: "" } };
}

interface RawServiceOverrides {
  ID?: string;
  name?: string;
  image?: string;
  labels?: Record<string, string>;
  mode?: Record<string, unknown>;
  ports?: Record<string, unknown>[];
  status?: { RunningTasks: number; DesiredTasks: number };
  env?: string[];
  index?: number;
  extraTaskTemplate?: Record<string, unknown>;
}

/** One `/services` entry, in the shape the Engine API returns. */
function rawService(overrides: RawServiceOverrides = {}): Record<string, unknown> {
  const {
    ID = "svc-1",
    name = "web",
    image = "nginx:1.25",
    labels = {},
    mode = { Replicated: { Replicas: 3 } },
    ports = [],
    status,
    env = [],
    index = 11,
    extraTaskTemplate = {},
  } = overrides;
  return {
    ID,
    Version: { Index: index },
    CreatedAt: "2026-01-01T00:00:00.000000000Z",
    UpdatedAt: "2026-02-01T00:00:00.000000000Z",
    Spec: {
      Name: name,
      Labels: labels,
      TaskTemplate: { ContainerSpec: { Image: image, Env: env }, ...extraTaskTemplate },
      Mode: mode,
      EndpointSpec: { Ports: ports },
    },
    Endpoint: { Ports: ports },
    ...(status ? { ServiceStatus: status } : {}),
  };
}

beforeEach(() => {
  engine.reset();
  engine.on("GET", "/info", () => managerInfo());
  engine.on("GET", "/services", () => []);
  engine.on("GET", "/nodes", () => []);
  engine.on("GET", "/tasks", () => []);
});

// swarm-services-service.md — "image -> without its pinned @sha256: digest, which the daemon appends
// to every deployed service"
test("listServices reports the image the operator recognises, without the pinned digest", async () => {
  engine.on("GET", "/services", () => [
    rawService({ image: "registry.example.com/team/api:2.1@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" }),
  ]);

  const [service] = (await listServices()).items;

  assert.equal(service!.image, "registry.example.com/team/api:2.1");
});

// swarm-services-service.md — mode, "replicasRunning / replicasDesired -> the counts the daemon
// reports", the stack label, and the version
test("listServices reports mode, the running and desired counts, and the stack the service belongs to", async () => {
  engine.on("GET", "/services", () => [
    rawService({
      name: "blog_web",
      labels: { "com.docker.stack.namespace": "blog" },
      status: { RunningTasks: 2, DesiredTasks: 3 },
      index: 42,
    }),
  ]);

  const [service] = (await listServices()).items;

  assert.equal(service!.name, "blog_web");
  assert.equal(service!.mode, "replicated");
  assert.equal(service!.replicasRunning, 2);
  assert.equal(service!.replicasDesired, 3);
  assert.equal(service!.stack, "blog");
  assert.equal(service!.version, 42);
});

// swarm-services-service.md — "replicasDesired falls back to the configured replica count when the
// daemon reports no status"
test("listServices falls back to the configured replica count when the daemon reports no status", async () => {
  engine.on("GET", "/services", () => [rawService({ mode: { Replicated: { Replicas: 5 } } })]);

  const [service] = (await listServices()).items;

  assert.equal(service!.replicasDesired, 5);
});

// swarm-services-service.md — "both are absent rather than zero when nothing is known"
test("listServices leaves both counts absent, not zero, when nothing is known", async () => {
  engine.on("GET", "/services", () => [rawService({ mode: { Global: {} } })]);

  const [service] = (await listServices()).items;

  assert.equal(service!.mode, "global");
  assert.equal(service!.replicasRunning, undefined);
  assert.equal(service!.replicasDesired, undefined);
});

// swarm-services-service.md — "ports -> only the ports actually published"; "A port with no
// published port is not published and is left out of the reading"
test("listServices lists the published ports and leaves the unpublished ones out", async () => {
  engine.on("GET", "/services", () => [
    rawService({
      ports: [
        { Protocol: "tcp", TargetPort: 80, PublishedPort: 8080, PublishMode: "ingress" },
        { Protocol: "tcp", TargetPort: 9000 },
      ],
    }),
  ]);

  const [service] = (await listServices()).items;

  assert.equal(service!.ports.length, 1, "a port with no published port is not published");
  assert.equal(service!.ports[0]!.published, 8080);
  assert.equal(service!.ports[0]!.target, 80);
  assert.equal(service!.ports[0]!.protocol, "tcp");
});

// swarm-services-service.md — "ordered by name"
test("listServices orders the services by name", async () => {
  engine.on("GET", "/services", () => [
    rawService({ ID: "s3", name: "zebra" }),
    rawService({ ID: "s1", name: "api" }),
    rawService({ ID: "s2", name: "mail" }),
  ]);

  assert.deepEqual(
    (await listServices()).items.map((service) => service.name),
    ["api", "mail", "zebra"],
  );
});

// swarm-services-service.md — "off a manager: no items and the stated reason"
test("listServices degrades to a stated reason off a manager", async () => {
  engine.on("GET", "/info", () => inactiveInfo());

  const listing = await listServices();

  assert.deepEqual(listing.items, []);
  assert.ok((listing.unavailableReason ?? "").length > 0);
  assert.equal(engine.callsTo("GET", "/services").length, 0);
});

// swarm-services-service.md — getServiceDetail: env, labels, "tasks ... most recent first",
// "nodeHostname -> resolved from the node inventory", and the raw payload
test("getServiceDetail returns the service with its environment, labels, tasks and the raw payload", async () => {
  const service = rawService({
    ID: "svc-1",
    name: "api",
    env: ["MODE=production", "DSN=postgres://user:pw@host/db?a=1"],
    labels: { tier: "backend" },
  });
  engine.on("GET", "/services/svc-1", () => service);
  engine.on("GET", "/services", () => [service]);
  engine.on("GET", "/nodes", () => [
    { ID: "node-1", Description: { Hostname: "worker-alpha" }, Spec: { Role: "worker", Availability: "active" }, Status: { State: "ready" } },
  ]);
  engine.on("GET", "/tasks", () => [
    { ID: "task-old", Slot: 1, NodeID: "node-1", DesiredState: "shutdown", Status: { State: "shutdown", Timestamp: "2026-08-01T10:00:00.000Z" } },
    { ID: "task-new", Slot: 2, NodeID: "node-1", DesiredState: "running", Status: { State: "running", Timestamp: "2026-08-08T10:00:00.000Z" } },
  ]);

  const detail = await getServiceDetail("svc-1");

  assert.equal(detail.service.name, "api");
  assert.deepEqual(detail.env, ["MODE=production", "DSN=postgres://user:pw@host/db?a=1"]);
  assert.deepEqual(detail.labels, { tier: "backend" });
  assert.deepEqual(
    detail.tasks.map((task) => task.id),
    ["task-new", "task-old"],
    "the most recent task comes first",
  );
  assert.equal(detail.tasks[0]!.nodeHostname, "worker-alpha", "the node is named, not just identified");
  assert.equal(detail.tasks[0]!.state, "running");
  assert.equal(detail.tasks[0]!.desiredState, "running");
  assert.ok(detail.raw !== undefined, "the daemon's own payload is available for the full reading");
});

// swarm-services-service.md — "nodeHostname -> ... absent when the task is not on a node yet"; a
// failed task carries "the daemon's message"
test("getServiceDetail leaves the hostname absent for a task not yet on a node, and keeps a failure's message", async () => {
  const service = rawService({ ID: "svc-1" });
  engine.on("GET", "/services/svc-1", () => service);
  engine.on("GET", "/services", () => [service]);
  engine.on("GET", "/tasks", () => [
    { ID: "task-pending", DesiredState: "running", Status: { State: "rejected", Timestamp: "2026-08-08T10:00:00.000Z", Err: "no suitable node" } },
  ]);

  const detail = await getServiceDetail("svc-1");

  assert.equal(detail.tasks[0]!.nodeHostname, undefined);
  assert.match(detail.tasks[0]!.error ?? detail.tasks[0]!.message ?? "", /no suitable node/);
});

// swarm-services-service.md — getServiceDetail "rejects if the daemon is not a manager"
test("getServiceDetail rejects off a manager", async () => {
  engine.on("GET", "/info", () => inactiveInfo());

  await assert.rejects(getServiceDetail("svc-1"), /not part of a swarm/i);
});

// swarm-services-service.md — createService "rejects on an empty name or image"
test("createService rejects an empty name and an empty image, without asking the daemon", async () => {
  await assert.rejects(createService({ name: "  ", image: "alpine:3.20", mode: "replicated" }));
  await assert.rejects(createService({ name: "api", image: "", mode: "replicated" }));

  assert.equal(engine.callsTo("POST", "/services/create").length, 0);
});

// swarm-services-service.md — "replicas applies to replicated mode only; global runs one task per
// node"; "env is exchanged as KEY=value strings ... so a value containing = survives the round trip"
test("createService composes the service from arguments, replicas for a replicated one and env as KEY=value", async () => {
  const created = rawService({ ID: "svc-new", name: "api", image: "alpine:3.20" });
  engine.on("POST", "/services/create", () => ({ ID: "svc-new" }));
  engine.on("GET", "/services/svc-new", () => created);
  engine.on("GET", "/services", () => [created]);

  await createService({
    name: "api",
    image: "alpine:3.20",
    mode: "replicated",
    replicas: 2,
    env: ["DSN=postgres://user@host/db?a=1"],
    ports: [{ published: 8080, target: 80, protocol: "tcp" }],
  });

  const body = engine.callsTo("POST", "/services/create")[0]!.json as {
    Name?: string;
    TaskTemplate?: { ContainerSpec?: { Image?: string; Env?: string[] } };
    Mode?: { Replicated?: { Replicas?: number }; Global?: unknown };
    EndpointSpec?: { Ports?: { PublishedPort?: number; TargetPort?: number }[] };
  };
  assert.equal(body.Name, "api");
  assert.equal(body.TaskTemplate?.ContainerSpec?.Image, "alpine:3.20");
  assert.deepEqual(body.TaskTemplate?.ContainerSpec?.Env, ["DSN=postgres://user@host/db?a=1"]);
  assert.equal(body.Mode?.Replicated?.Replicas, 2);
  assert.equal(body.EndpointSpec?.Ports?.[0]?.PublishedPort, 8080);
  assert.equal(body.EndpointSpec?.Ports?.[0]?.TargetPort, 80);
});

// swarm-services-service.md — "effect: the service exists, carrying the given labels"; "A service
// can be created with labels, as a secret and a config can: labels are how a caller ... proves an
// object is theirs"
test("createService sends the labels it was given, so the service can be recognised later", async () => {
  const created = rawService({ ID: "svc-labelled", name: "api", labels: { "vexel.test.run": "run-1", owner: "team" } });
  engine.on("POST", "/services/create", () => ({ ID: "svc-labelled" }));
  engine.on("GET", "/services/svc-labelled", () => created);
  engine.on("GET", "/services", () => [created]);

  await createService({ name: "api", image: "alpine:3.20", mode: "replicated", labels: { "vexel.test.run": "run-1", owner: "team" } });

  const body = engine.callsTo("POST", "/services/create")[0]!.json as { Labels?: Record<string, string> };
  assert.deepEqual(body.Labels, { "vexel.test.run": "run-1", owner: "team" });
});

// swarm-services-service.md — "an empty set is sent as none"
test("createService sends no labels when it was given none", async () => {
  const created = rawService({ ID: "svc-plain", name: "api" });
  engine.on("POST", "/services/create", () => ({ ID: "svc-plain" }));
  engine.on("GET", "/services/svc-plain", () => created);
  engine.on("GET", "/services", () => [created]);

  await createService({ name: "api", image: "alpine:3.20", mode: "replicated", labels: {} });

  const body = engine.callsTo("POST", "/services/create")[0]!.json as { Labels?: Record<string, string> };
  assert.ok(body.Labels === undefined || Object.keys(body.Labels).length === 0, `an empty set is no labels: ${JSON.stringify(body.Labels)}`);
});

test("createService asks for a global service when that is the mode, with no replica count", async () => {
  const created = rawService({ ID: "svc-global", name: "agent", mode: { Global: {} } });
  engine.on("POST", "/services/create", () => ({ ID: "svc-global" }));
  engine.on("GET", "/services/svc-global", () => created);
  engine.on("GET", "/services", () => [created]);

  await createService({ name: "agent", image: "alpine:3.20", mode: "global", replicas: 4 });

  const body = engine.callsTo("POST", "/services/create")[0]!.json as { Mode?: { Global?: unknown; Replicated?: unknown } };
  assert.ok(body.Mode?.Global !== undefined, "a global service runs one task per node");
  assert.equal(body.Mode?.Replicated, undefined, "a replica count does not apply to a global service");
});

// swarm-services-service.md — createService "rejects ... if the daemon is not a manager"
test("createService rejects off a manager", async () => {
  engine.on("GET", "/info", () => inactiveInfo());

  await assert.rejects(createService({ name: "api", image: "alpine:3.20", mode: "replicated" }), /not part of a swarm/i);
  assert.equal(engine.callsTo("POST", "/services/create").length, 0);
});

// swarm-services-service.md — "An update sends the service's whole current spec with the requested
// fields changed, at the version the service carries right now: a partial spec would drop mounts,
// networks, secrets, restart policy and everything else"
test("updateService sends the whole current spec with only the asked-for change, at the current version", async () => {
  const stored = rawService({
    ID: "svc-1",
    name: "api",
    image: "alpine:3.19",
    index: 77,
    env: ["KEEP=me"],
    labels: { "vexel.test.run": "run-1" },
    extraTaskTemplate: {
      Networks: [{ Target: "app-net" }],
      RestartPolicy: { Condition: "any" },
      Mounts: [{ Type: "volume", Source: "data", Target: "/data" }],
    },
  });
  engine.on("GET", "/services/svc-1", () => stored);
  engine.on("GET", "/services", () => [stored]);
  engine.on("POST", "/services/svc-1/update", () => ({}));

  await updateService("svc-1", { image: "alpine:3.20" });

  const request = engine.callsTo("POST", "/services/svc-1/update")[0]!;
  assert.equal(request.query.get("version"), "77");
  const spec = request.json as {
    Name?: string;
    Labels?: Record<string, string>;
    TaskTemplate?: { ContainerSpec?: { Image?: string; Env?: string[] }; Networks?: unknown; RestartPolicy?: unknown; Mounts?: unknown };
  };
  assert.equal(spec.TaskTemplate?.ContainerSpec?.Image, "alpine:3.20");
  assert.equal(spec.Name, "api");
  // swarm-services-panel.md — "an update preserves the labels the service already carries".
  assert.deepEqual(spec.Labels, { "vexel.test.run": "run-1" }, "an update must not drop the labels the service was created with");
  assert.deepEqual(spec.TaskTemplate?.ContainerSpec?.Env, ["KEEP=me"], "an untouched field keeps its value");
  assert.deepEqual(spec.TaskTemplate?.Networks, [{ Target: "app-net" }], "the update must not drop the service's networks");
  assert.deepEqual(spec.TaskTemplate?.RestartPolicy, { Condition: "any" }, "the update must not drop the restart policy");
  assert.deepEqual(spec.TaskTemplate?.Mounts, [{ Type: "volume", Source: "data", Target: "/data" }], "the update must not drop the mounts");
});

// swarm-services-service.md — "changing replicas on a global service is refused -> error
// ReplicasNotApplicable"
test("updateService refuses a replica count asked of a global service", async () => {
  const stored = rawService({ ID: "svc-global", name: "agent", mode: { Global: {} } });
  engine.on("GET", "/services/svc-global", () => stored);
  engine.on("GET", "/services", () => [stored]);
  engine.on("POST", "/services/svc-global/update", () => ({}));

  await assert.rejects(updateService("svc-global", { replicas: 3 }), (error: Error) => {
    assert.match(`${error.name}: ${error.message}`, /replica/i, "the refusal must name what does not apply");
    return true;
  });
  assert.equal(engine.callsTo("POST", "/services/svc-global/update").length, 0, "nothing may be sent for a change that cannot apply");
});

// swarm-services-service.md — removeService "effect: the service and its tasks are gone"; "rejects
// if the daemon is not a manager"
test("removeService removes the service, and rejects off a manager", async () => {
  engine.on("DELETE", "/services/svc-1", () => ({}));

  await removeService("svc-1");
  assert.equal(engine.callsTo("DELETE", "/services/svc-1").length, 1);

  engine.on("GET", "/info", () => inactiveInfo());
  await assert.rejects(removeService("svc-1"), /not part of a swarm/i);
  assert.equal(engine.callsTo("DELETE", "/services/svc-1").length, 1, "nothing is sent where it cannot be served");
});
