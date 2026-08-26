import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { installEngineMock } from "../support/engine-mock.js";

// The shared per-container sampler: its cadence, its startability, the rule that
// passes never overlap, and the age past which a reading reaches no consumer
// (containers/specs/containers-service.md,
// plan-docker_management_app-containers_card_view/REQ-39, REQ-40, REQ-41, REQ-52, REQ-58).
//
// The daemon is mocked because what is measured here is the *traffic*: the
// number of stats requests reaching the Engine API over a window, which is the
// only observation that tells a gated sampler from an ungated one. The clock is
// mocked for the same reason — a real 10-second interval measured three times
// over is half a minute of waiting per assertion.
const engine = installEngineMock();

const { listContainers, startStatsSampling, stopStatsSampling, isStatsSamplingActive, STATS_SAMPLE_INTERVAL_MS } =
  await import("../../src/containers/containers-service.js");

const CONTAINER_ID = "c0ffee0000000000";

/** A running container as `GET /containers/json` reports one. */
function runningContainer(id = CONTAINER_ID): unknown {
  return {
    Id: id,
    Names: ["/sampled-one"],
    Image: "alpine:3.20",
    State: "running",
    Status: "Up 1 minute",
    Ports: [],
  };
}

/** One stats frame, as `GET /containers/{id}/stats?stream=false` answers. */
function statsFrame(): unknown {
  return {
    read: "2026-08-26T10:00:00.000000000Z",
    cpu_stats: { cpu_usage: { total_usage: 2_000_000_000 }, system_cpu_usage: 20_000_000_000, online_cpus: 4 },
    precpu_stats: { cpu_usage: { total_usage: 1_000_000_000 }, system_cpu_usage: 10_000_000_000, online_cpus: 4 },
    memory_stats: { usage: 600 * 1024 * 1024, limit: 2048 * 1024 * 1024, stats: { cache: 100 * 1024 * 1024 } },
    networks: { eth0: { rx_bytes: 1000, tx_bytes: 2000 } },
  };
}

/** Stats requests that have reached the daemon since the last reset. */
function statsRequests(): number {
  return engine.callsTo("GET", /^\/containers\/[^/]+\/stats$/).length;
}

/** Lets the pending pass run its awaits out; the fake clock does not advance microtasks. */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

async function advance(milliseconds: number): Promise<void> {
  mock.timers.tick(milliseconds);
  await settle();
}

beforeEach(() => {
  engine.reset();
  engine.on("GET", "/containers/json", () => [runningContainer()]);
  engine.on("GET", `/containers/${CONTAINER_ID}/stats`, () => statsFrame());
  mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"] });
});

afterEach(() => {
  stopStatsSampling();
  mock.timers.reset();
});

// containers-service.md — "STATS_SAMPLE_INTERVAL_MS: 10000 ... and the period the subscription
// endpoint writes at" (REQ-39)
test("the sampling interval is ten seconds", () => {
  assert.equal(STATS_SAMPLE_INTERVAL_MS, 10_000);
});

// containers-service.md — "The sampler runs only while it is started, and nothing here starts it"
// (REQ-41, REQ-44)
test("no stats request reaches the daemon while the sampler has not been started", async () => {
  await advance(STATS_SAMPLE_INTERVAL_MS * 3);

  assert.equal(statsRequests(), 0);
  assert.equal(isStatsSamplingActive(), false);
});

// containers-service.md — "starts the CPU/memory sampler and takes a sample immediately, so a
// consumer that has just arrived waits ... rather than for a whole interval" (REQ-51)
test("starting the sampler asks the daemon at once rather than one interval later", async () => {
  startStatsSampling();
  await settle();

  assert.equal(statsRequests(), 1);
  assert.equal(isStatsSamplingActive(), true);
});

// The cadence measured as traffic: one request per running container per interval, and none in
// between — the delivered three seconds would have issued three more inside the same window
// (REQ-39, REQ-57)
test("a started sampler asks the daemon once per ten seconds and not once between them", async () => {
  startStatsSampling();
  await settle();

  await advance(STATS_SAMPLE_INTERVAL_MS - 1);
  assert.equal(statsRequests(), 1);

  await advance(1);
  assert.equal(statsRequests(), 2);

  await advance(STATS_SAMPLE_INTERVAL_MS);
  assert.equal(statsRequests(), 3);
});

// containers-service.md — "stopStatsSampling(): stops it: no further stats request reaches the
// daemon" (REQ-41, REQ-58)
test("stopping the sampler ends the traffic to the daemon", async () => {
  startStatsSampling();
  await settle();
  const beforeStop = statsRequests();

  stopStatsSampling();
  await advance(STATS_SAMPLE_INTERVAL_MS * 4);

  assert.equal(statsRequests(), beforeStop);
  assert.equal(isStatsSamplingActive(), false);
});

// containers-service.md — both calls are idempotent: a second start is a no-op, and two timers
// would show as a doubled request count (REQ-54)
test("a second start while the sampler runs adds neither a sample nor a second timer", async () => {
  startStatsSampling();
  await settle();
  startStatsSampling();
  await settle();

  assert.equal(statsRequests(), 1);

  await advance(STATS_SAMPLE_INTERVAL_MS);
  assert.equal(statsRequests(), 2);
});

test("stopping a sampler that is already stopped is a no-op", async () => {
  stopStatsSampling();
  stopStatsSampling();

  assert.equal(isStatsSamplingActive(), false);

  startStatsSampling();
  await settle();
  assert.equal(statsRequests(), 1);
});

// containers-service.md — "A tick arriving while the previous pass is still out is dropped, so a
// pass slower than the interval gains no second pass beside it and no backlog builds up" (REQ-40)
test("a pass slower than the interval gains no second pass beside it and no backlog", async () => {
  const held: (() => void)[] = [];
  engine.on("GET", `/containers/${CONTAINER_ID}/stats`, async () => {
    await new Promise<void>((resolve) => held.push(resolve));
    return statsFrame();
  });

  try {
    startStatsSampling();
    await settle();
    assert.equal(statsRequests(), 1, "the first pass is out");

    await advance(STATS_SAMPLE_INTERVAL_MS * 4);
    assert.equal(statsRequests(), 1, "four ticks passed while one pass was out: none started beside it");

    held.shift()?.();
    await settle();

    // No backlog: the four dropped ticks do not run once the slow pass returns.
    assert.equal(statsRequests(), 1);

    await advance(STATS_SAMPLE_INTERVAL_MS);
    assert.equal(statsRequests(), 2, "the next tick after the pass returned samples once");
  } finally {
    // A pass left hanging would stay in flight for the whole file and silence
    // every later sample.
    stopStatsSampling();
    for (const release of held.splice(0)) release();
    await settle();
  }
});

// containers-service.md — "present only for a running container whose latest sample is less than
// 30 seconds old; all six come from one sample and are absent together" (REQ-52)
test("a reading taken less than three intervals ago is reported with all six of its figures", async () => {
  engine.on("GET", "/containers/json", () => [runningContainer()]);
  startStatsSampling();
  await settle();
  stopStatsSampling();

  await advance(STATS_SAMPLE_INTERVAL_MS * 3 - 1_000);
  const [summary] = await listContainers();

  assert.equal(typeof summary?.cpuPercent, "number");
  assert.equal(typeof summary?.memoryUsageBytes, "number");
  assert.equal(typeof summary?.memoryLimitBytes, "number");
  assert.equal(typeof summary?.onlineCpus, "number");
  assert.equal(typeof summary?.networkRxBytes, "number");
  assert.equal(typeof summary?.networkTxBytes, "number");
});

// containers-service.md — "A reading older than three intervals reaches no consumer ... what stops
// a number measured before the gate closed from being redisplayed on return" (REQ-52)
test("a reading older than three intervals reaches no consumer, all six figures withheld together", async () => {
  startStatsSampling();
  await settle();
  stopStatsSampling();

  await advance(STATS_SAMPLE_INTERVAL_MS * 3 + 1_000);
  const [summary] = await listContainers();

  assert.equal(summary?.cpuPercent, undefined);
  assert.equal(summary?.memoryUsageBytes, undefined);
  assert.equal(summary?.memoryLimitBytes, undefined);
  assert.equal(summary?.onlineCpus, undefined);
  assert.equal(summary?.networkRxBytes, undefined);
  assert.equal(summary?.networkTxBytes, undefined);
  // The container itself is still listed: what is withheld is the reading, not the row.
  assert.equal(summary?.id, CONTAINER_ID);
});

// containers-service.md — the reading a shut gate left behind is never handed back as current when
// the gate reopens; only a fresh pass restores it (REQ-52)
test("a stale reading is not redisplayed on return, and a fresh pass restores it", async () => {
  startStatsSampling();
  await settle();
  stopStatsSampling();
  await advance(STATS_SAMPLE_INTERVAL_MS * 3 + 1_000);

  const [whileStale] = await listContainers();
  assert.equal(whileStale?.cpuPercent, undefined);

  startStatsSampling();
  await settle();
  const [afterFreshSample] = await listContainers();

  assert.equal(typeof afterFreshSample?.cpuPercent, "number");
});
