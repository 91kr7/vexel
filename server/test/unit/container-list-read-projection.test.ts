import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { installEngineMock } from "../support/engine-mock.js";

// What the container endpoint answers with, now that the projection happens
// when the listing is read rather than when it is held
// (plan-docker_management_app-refresh_cache/REQ-39, REQ-40).
//
// The daemon is mocked because the payloads this needs — a dual-stack
// duplicate, an exposure that is not a mapping, an internal container — cannot
// be asked of a real one, and because the number of listings that reach it is
// itself part of what is asserted.
const engine = installEngineMock();

const { listContainers, readContainerList, startStatsSampling, stopStatsSampling, STATS_SAMPLE_INTERVAL_MS } =
  await import("../../src/containers/containers-service.js");
const { resetRefreshCache } = await import("../../src/refresh-cache/refresh-cache.js");

const APP_2_ID = "a".repeat(64);
const APP_10_ID = "b".repeat(64);
const INTERNAL_ID = "c".repeat(64);

/** The daemon's own listing entries, in an order of the daemon's own. */
function daemonListing(): unknown[] {
  return [
    {
      Id: APP_10_ID,
      Names: ["/app-10"],
      Image: "alpine:3.20",
      State: "exited",
      Status: "Exited (0) 2 hours ago",
      Ports: [],
    },
    {
      Id: APP_2_ID,
      Names: ["/app-2"],
      Image: "alpine:3.20",
      State: "running",
      Status: "Up 3 minutes",
      Ports: [
        { PrivatePort: 443, PublicPort: 8443, Type: "tcp" },
        // The same publication reported once per IP stack, as the daemon reports it.
        { PrivatePort: 80, PublicPort: 8080, Type: "tcp" },
        { PrivatePort: 80, PublicPort: 8080, Type: "tcp" },
        // Exposed and bound to nothing on the host: not a mapping.
        { PrivatePort: 7777, Type: "tcp" },
      ],
    },
    {
      Id: INTERNAL_ID,
      Names: ["/internal-extraction"],
      Image: "alpine:3.20",
      State: "running",
      Status: "Up 1 second",
      Ports: [],
      Labels: { "vexel.internal-container": "true" },
    },
  ];
}

/** One stats frame, as `GET /containers/{id}/stats?stream=false` answers. */
function statsFrame(): unknown {
  return {
    read: "2026-08-29T10:00:00.000000000Z",
    cpu_stats: { cpu_usage: { total_usage: 2_000_000_000 }, system_cpu_usage: 20_000_000_000, online_cpus: 4 },
    precpu_stats: { cpu_usage: { total_usage: 1_000_000_000 }, system_cpu_usage: 10_000_000_000 },
    memory_stats: { usage: 600 * 1024 * 1024, limit: 2048 * 1024 * 1024, stats: { cache: 100 * 1024 * 1024 } },
    networks: { eth0: { rx_bytes: 1000, tx_bytes: 2000 } },
  };
}

/** Container listings that have reached the daemon since the last reset. */
function containerListCalls(): number {
  return engine.calls.filter((call) => call.path === "/containers/json?all=true").length;
}

async function settle(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

async function advance(milliseconds: number): Promise<void> {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 5_000) {
    mock.timers.tick(Math.min(5_000, milliseconds - elapsed));
    await settle();
  }
}

/** The endpoint's body as a client receives it: what JSON carries, and nothing a key set on the object would add. */
async function endpointBody(): Promise<Record<string, unknown>[]> {
  return JSON.parse(JSON.stringify((await readContainerList()).value)) as Record<string, unknown>[];
}

beforeEach(() => {
  resetRefreshCache();
  engine.reset();
  engine.on("GET", "/containers/json", () => daemonListing());
  engine.on("GET", /^\/containers\/[^/]+\/stats$/, () => statsFrame());
});

afterEach(() => {
  stopStatsSampling();
});

// containers-service.md — readContainerList answers "the held response projected into
// ContainerSummary and ordered when it is read … Field for field, value for value and in the same
// order as listContainers answers" (REQ-39).
test("the held listing is projected into the very body the direct daemon read answers", async () => {
  const fromTheHeldListing = (await readContainerList()).value;
  const fromTheDaemonDirectly = await listContainers();

  assert.deepEqual(fromTheHeldListing, fromTheDaemonDirectly);
});

// REQ-39 — "What /api/containers returns does not change: the same fields, the same values, the
// same order": the summary's own fields (containers-service.md), the name-then-id order, the ports
// collapsed once and ordered, the exposure that is not a mapping, and the internal container
// excluded (REQ-41).
test("the endpoint's body carries the summary's own fields, values and order", async () => {
  const body = await endpointBody();

  assert.deepEqual(
    body.map((container) => container.name),
    ["app-2", "app-10"],
    "the listing is not ordered by name, or the internal container was not excluded",
  );

  const appTwo = body[0]!;
  assert.deepEqual(Object.keys(appTwo).sort(), ["id", "image", "name", "ports", "shortId", "state", "status"]);
  assert.equal(appTwo.id, APP_2_ID);
  assert.equal(appTwo.shortId, APP_2_ID.slice(0, 12));
  assert.equal(appTwo.image, "alpine:3.20");
  assert.equal(appTwo.state, "running");
  assert.equal(appTwo.status, "Up 3 minutes");
  assert.deepEqual(appTwo.ports, [
    { privatePort: 80, publicPort: 8080, type: "tcp" },
    { privatePort: 443, publicPort: 8443, type: "tcp" },
  ]);
});

// REQ-40 — "The sampled CPU, memory and network figures are merged onto the container listing once,
// when it is read": a sample taken after the listing was held still reaches the caller, and reaching
// it costs no second listing (containers-service.md — "A sample taken after the listing was held
// still reaches the caller").
test("a sample taken after the listing was held reaches the caller, without the listing being read again", async () => {
  const beforeAnySample = (await readContainerList()).value.find((container) => container.name === "app-2")!;
  assert.equal(beforeAnySample.cpuPercent, undefined, "a container the sampler has never read carries figures");
  const listingsSoFar = containerListCalls();

  startStatsSampling();
  await settle();

  const afterTheSample = (await readContainerList()).value.find((container) => container.name === "app-2")!;
  assert.equal(typeof afterTheSample.cpuPercent, "number");
  assert.equal(typeof afterTheSample.memoryUsageBytes, "number");
  assert.equal(typeof afterTheSample.memoryLimitBytes, "number");
  assert.equal(typeof afterTheSample.onlineCpus, "number");
  assert.equal(typeof afterTheSample.networkRxBytes, "number");
  assert.equal(typeof afterTheSample.networkTxBytes, "number");
  assert.equal(
    containerListCalls(),
    listingsSoFar,
    "the listing was fetched again to carry the sample instead of being projected at read time",
  );
});

// REQ-40 — "every container still carries figures no older than the sampler's own interval": the
// bound applies to the held listing too, so a reading taken before the sampler stopped is not
// redisplayed through it (containers-service.md — "A reading older than three intervals reaches no
// consumer").
test("figures older than the sampler's own bound reach no caller, though the same listing is still held", async () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  try {
    startStatsSampling();
    await settle();
    stopStatsSampling();
    const sampled = (await readContainerList()).value.find((container) => container.name === "app-2")!;
    assert.equal(typeof sampled.cpuPercent, "number", "the sampler produced no figure to age");

    await advance(STATS_SAMPLE_INTERVAL_MS * 3 + 1_000);

    const stale = (await readContainerList()).value.find((container) => container.name === "app-2")!;
    assert.equal(stale.cpuPercent, undefined);
    assert.equal(stale.memoryUsageBytes, undefined);
    assert.equal(stale.networkRxBytes, undefined);
  } finally {
    mock.timers.reset();
  }
});
