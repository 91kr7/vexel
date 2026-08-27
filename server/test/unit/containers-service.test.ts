import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// The mock stands in for the shared EngineClient: a stubbed payload is what makes a genuine tie —
// or an unstable port order — constructible, which a real daemon cannot be asked for.
let containersBody = "[]";

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string) => {
        if (path === "/containers/json?all=true") return { statusCode: 200, body: containersBody };
        throw new Error(`unexpected path: ${path}`);
      },
    }),
  },
});

const { listContainers } = await import("../../src/containers/containers-service.js");

beforeEach(() => {
  containersBody = "[]";
});

interface RawFixture {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
}

function container(id: string, name: string): RawFixture {
  return { Id: id, Names: [`/${name}`], Image: "fixture:latest", State: "running", Status: "Up 1 second" };
}

/** Name and id together: the id is what the order falls back to, so an assertion that ignores it cannot see the tiebreak. */
function sequenceOf(containers: { name: string; id: string }[]): string[] {
  return containers.map((entry) => `${entry.name}#${entry.id}`);
}

async function listFrom(payload: RawFixture[]): Promise<string[]> {
  containersBody = JSON.stringify(payload);
  return sequenceOf(await listContainers());
}

// containers-service.md — "Ordered by container name under the list-order rule (compareNames)":
// app-2 before app-10, Redis next to redis-cache (REQ-8)
test("listContainers orders an out-of-order payload by container name, digits as numbers and case ignored", async () => {
  const payload = [
    container("c-1", "app-10"),
    container("c-2", "redis-cache"),
    container("c-3", "app-2"),
    container("c-4", "Redis"),
    container("c-5", "beta"),
  ];

  const names = (await listFrom(payload)).map((entry) => entry.split("#")[0]);

  assert.deepEqual(names, ["app-2", "app-10", "beta", "Redis", "redis-cache"]);
});

// containers-service.md — "two containers whose names differ only in case ... separated by their
// ids", and the same sequence whatever order the daemon supplied (REQ-5, REQ-12)
test("listContainers separates two containers whose names differ only in case by their ids, both ways round", async () => {
  const upper = container("c-2", "Data");
  const lower = container("c-1", "data");

  const forwards = await listFrom([upper, lower]);
  const backwards = await listFrom([lower, upper]);

  assert.deepEqual(forwards, ["data#c-1", "Data#c-2"]);
  assert.deepEqual(backwards, forwards);
});

// containers-service.md — "two containers whose names differ only in ... leading zeros separated by
// their ids" (REQ-5, REQ-12)
test("listContainers separates two containers whose names differ only in leading zeros by their ids, both ways round", async () => {
  const padded = container("c-a", "app-01");
  const plain = container("c-b", "app-1");

  const forwards = await listFrom([plain, padded]);
  const backwards = await listFrom([padded, plain]);

  assert.deepEqual(forwards, ["app-01#c-a", "app-1#c-b"]);
  assert.deepEqual(backwards, forwards);
});

// containers-service.md — one sequence whatever order the daemon supplied (REQ-6, REQ-12).
test("listContainers produces one sequence whichever order the daemon supplied the containers in", async () => {
  const payload = [
    container("c-5", "app-1"),
    container("c-1", "Data"),
    container("c-3", "app-10"),
    container("c-2", "data"),
    container("c-4", "app-01"),
    container("c-6", "app-2"),
  ];

  const forwards = await listFrom(payload);
  const backwards = await listFrom([...payload].reverse());

  assert.deepEqual(forwards, ["app-01#c-4", "app-1#c-5", "app-2#c-6", "app-10#c-3", "Data#c-1", "data#c-2"]);
  assert.deepEqual(backwards, forwards);
});

// containers-service.md — "The same containers produce the same sequence on every read" (REQ-12)
test("listContainers returns the identical sequence when read again with nothing changed", async () => {
  const payload = [container("c-2", "Data"), container("c-1", "data"), container("c-3", "app-2")];

  const first = await listFrom(payload);
  const second = await listFrom(payload);

  assert.deepEqual(second, first);
});

/** A raw port entry as the daemon reports one: one per host binding, so the host IP is part of it. */
interface RawPort {
  IP?: string;
  PrivatePort: number;
  PublicPort?: number;
  Type: string;
}

function withPorts(id: string, name: string, ports: RawPort[]): RawFixture & { Ports: RawPort[] } {
  return { ...container(id, name), Ports: ports };
}

async function portsFrom(ports: RawPort[]): Promise<string[]> {
  containersBody = JSON.stringify([withPorts("c-1", "app", ports)]);
  const [listed] = await listContainers();
  return listed.ports.map((port) => `${port.type}:${port.publicPort ?? "-"}->${port.privatePort}`);
}

// containers-service.md — `ports` carries no duplicates where the daemon's own answer does
// (plan-docker_management_app-containers_card_view/REQ-5, REQ-12).
test("listContainers reports a port published on both IP stacks exactly once", async () => {
  const dualStack = await portsFrom([
    { IP: "0.0.0.0", PrivatePort: 5432, PublicPort: 49_153, Type: "tcp" },
    { IP: "::", PrivatePort: 5432, PublicPort: 49_153, Type: "tcp" },
  ]);

  assert.deepEqual(dualStack, ["tcp:49153->5432"]);
});

// containers-service.md — the dedup collapses only what the shape cannot tell apart (REQ-5, REQ-12).
test("listContainers keeps mappings that differ in anything the shape carries", async () => {
  const distinct = await portsFrom([
    { IP: "0.0.0.0", PrivatePort: 5432, PublicPort: 49_153, Type: "tcp" },
    { IP: "0.0.0.0", PrivatePort: 5432, PublicPort: 49_154, Type: "tcp" },
    { IP: "0.0.0.0", PrivatePort: 5432, PublicPort: 49_153, Type: "udp" },
  ]);

  assert.deepEqual(distinct, ["tcp:49153->5432", "udp:49153->5432", "tcp:49154->5432"]);
});

// containers-service.md — `ports` carries "the container's publications on the host and only
// those": an entry the daemon returns with no public port is an exposure and is not a mapping.
test("listContainers drops an entry the daemon returns with no public port", async () => {
  const published = await portsFrom([
    { PrivatePort: 7777, Type: "tcp" },
    { IP: "0.0.0.0", PrivatePort: 5432, PublicPort: 49_153, Type: "tcp" },
  ]);

  assert.deepEqual(published, ["tcp:49153->5432"]);
});

// containers-service.md — a container that only exposes therefore publishes nothing at all.
test("listContainers reports no port for a container that exposes without publishing", async () => {
  assert.deepEqual(await portsFrom([{ PrivatePort: 7777, Type: "tcp" }]), []);
});

// containers-service.md — the order is imposed and total: private port, then public, then protocol
// (plan-docker_management_app-containers_card_view/REQ-5, REQ-15).
test("listContainers orders a container's ports by private port, then public port, then protocol", async () => {
  const ordered = await portsFrom([
    { IP: "0.0.0.0", PrivatePort: 8080, PublicPort: 32_770, Type: "tcp" },
    { IP: "0.0.0.0", PrivatePort: 80, PublicPort: 32_769, Type: "udp" },
    { IP: "0.0.0.0", PrivatePort: 80, PublicPort: 32_769, Type: "tcp" },
    { IP: "0.0.0.0", PrivatePort: 80, PublicPort: 32_768, Type: "tcp" },
  ]);

  assert.deepEqual(ordered, ["tcp:32768->80", "tcp:32769->80", "udp:32769->80", "tcp:32770->8080"]);
});

// containers-service.md — the daemon's rotation between reads cannot be seen through the imposed
// order (plan-docker_management_app-containers_card_view/REQ-5, REQ-15).
test("listContainers returns one sequence whichever rotation the daemon supplies the ports in", async () => {
  const reported: RawPort[] = [
    { IP: "0.0.0.0", PrivatePort: 5432, PublicPort: 49_153, Type: "tcp" },
    { IP: "0.0.0.0", PrivatePort: 6379, PublicPort: 49_154, Type: "tcp" },
    { IP: "0.0.0.0", PrivatePort: 8080, PublicPort: 49_155, Type: "tcp" },
    { IP: "0.0.0.0", PrivatePort: 9090, PublicPort: 49_156, Type: "tcp" },
  ];
  const rotate = (by: number): RawPort[] => [...reported.slice(by), ...reported.slice(0, by)];

  const reads = [await portsFrom(rotate(0)), await portsFrom(rotate(1)), await portsFrom(rotate(3))];

  for (const read of reads) assert.deepEqual(read, reads[0]);
  // …and the first two of them — the pair the card draws — are the same pair every time.
  assert.deepEqual(reads[0].slice(0, 2), ["tcp:49153->5432", "tcp:49154->6379"]);
});
