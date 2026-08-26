import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installEngineMock } from "../support/engine-mock.js";

// The gate in front of the shared sampler: a count of the consumers being shown
// the figures, and nothing else deciding whether the daemon is asked for them
// (containers/specs/stats-demand-registry.md,
// plan-docker_management_app-containers_card_view/REQ-41, REQ-44, REQ-47, REQ-51, REQ-54).
//
// The daemon is mocked because the assertion is about traffic: how many stats
// requests leave for the daemon, and when they stop.
const engine = installEngineMock();

const { acquireStatsDemand, statsDemandCount, statsSamplingActive } = await import(
  "../../src/containers/stats-demand-registry.js"
);
const { stopStatsSampling } = await import("../../src/containers/containers-service.js");

const CONTAINER_ID = "abc123abc123";

function runningContainer(): unknown {
  return { Id: CONTAINER_ID, Names: ["/watched"], Image: "alpine:3.20", State: "running", Status: "Up 2 minutes", Ports: [] };
}

function statsFrame(): unknown {
  return {
    read: "2026-08-26T10:00:00.000000000Z",
    cpu_stats: { cpu_usage: { total_usage: 2_000_000_000 }, system_cpu_usage: 20_000_000_000, online_cpus: 2 },
    precpu_stats: { cpu_usage: { total_usage: 1_000_000_000 }, system_cpu_usage: 10_000_000_000, online_cpus: 2 },
    memory_stats: { usage: 1024, limit: 4096, stats: {} },
    networks: { eth0: { rx_bytes: 10, tx_bytes: 20 } },
  };
}

function statsRequests(): number {
  return engine.callsTo("GET", /^\/containers\/[^/]+\/stats$/).length;
}

/** Lets the pass the acquisition started reach the daemon before it is counted. */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  engine.reset();
  engine.on("GET", "/containers/json", () => [runningContainer()]);
  engine.on("GET", `/containers/${CONTAINER_ID}/stats`, () => statsFrame());
});

afterEach(() => {
  stopStatsSampling();
});

// stats-demand-registry.md — "Nothing here is called at process boot: a server with no consumer
// registered has a count of zero and issues no stats request of any kind" (REQ-44)
test("a freshly loaded server holds no consumer and samples nothing", async () => {
  assert.equal(statsDemandCount(), 0);
  assert.equal(statsSamplingActive(), false);

  await settle();
  assert.equal(statsRequests(), 0);
});

// stats-demand-registry.md — "when it rises from zero to one the sampler is started, and a sample is
// taken immediately rather than one interval later" (REQ-51)
test("the first consumer starts the sampler and is served a sample at once", async () => {
  const release = acquireStatsDemand();
  try {
    assert.equal(statsDemandCount(), 1);
    assert.equal(statsSamplingActive(), true);

    await settle();
    assert.equal(statsRequests(), 1);
  } finally {
    release();
  }
});

// stats-demand-registry.md — "It is a count, not a flag: two consumers are ordinary, one of them
// leaving does not stop the sampling the other is reading" (REQ-47)
test("two consumers are ordinary, and only the last one leaving stops the sampling", () => {
  const first = acquireStatsDemand();
  const second = acquireStatsDemand();
  try {
    assert.equal(statsDemandCount(), 2);

    first();
    assert.equal(statsDemandCount(), 1);
    assert.equal(statsSamplingActive(), true, "the second consumer is still being shown the figures");

    second();
    assert.equal(statsDemandCount(), 0);
    assert.equal(statsSamplingActive(), false);
  } finally {
    first();
    second();
  }
});

// stats-demand-registry.md — "the release is idempotent: calling it a second time (or a tenth)
// releases once and cannot take the count below what the other consumers hold" (REQ-54)
test("releasing the same consumer again releases once and never below what the others hold", () => {
  const first = acquireStatsDemand();
  const second = acquireStatsDemand();
  try {
    first();
    first();
    first();

    assert.equal(statsDemandCount(), 1);
    assert.equal(statsSamplingActive(), true);
  } finally {
    second();
  }

  assert.equal(statsDemandCount(), 0);
  assert.equal(statsSamplingActive(), false);
});

// stats-demand-registry.md — "statsSamplingActive() is true exactly while statsDemandCount() > 0,
// whatever the sequence of acquisitions and releases that led there" (REQ-47, REQ-54)
test("the sampler runs exactly while the count is positive, through a mixed sequence", () => {
  const releases: (() => void)[] = [];
  const expectAgreement = () => assert.equal(statsSamplingActive(), statsDemandCount() > 0);

  try {
    expectAgreement();
    releases.push(acquireStatsDemand());
    expectAgreement();
    releases.push(acquireStatsDemand());
    expectAgreement();
    releases[0]?.();
    expectAgreement();
    releases.push(acquireStatsDemand());
    expectAgreement();
    assert.equal(statsDemandCount(), 2);
    releases[1]?.();
    expectAgreement();
    releases[2]?.();
    expectAgreement();

    assert.equal(statsDemandCount(), 0);
    assert.equal(statsSamplingActive(), false);
  } finally {
    for (const release of releases) release();
  }
});

// stats-demand-registry.md — no route out leaves the sampler running with a count of zero, and
// nothing accumulates per cycle: an upward drift samples the daemon for ever and looks perfect
// (REQ-54)
test("repeated acquire and release cycles leave the count at zero and add exactly one pass each", async () => {
  const cycles = 5;

  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    const release = acquireStatsDemand();
    await settle();
    assert.equal(statsDemandCount(), 1, `cycle ${cycle} holds one consumer`);

    release();
    assert.equal(statsDemandCount(), 0, `cycle ${cycle} returns to zero`);
    assert.equal(statsSamplingActive(), false, `cycle ${cycle} leaves the daemon quiet`);
    assert.equal(statsRequests(), cycle, `cycle ${cycle} cost exactly one pass`);
  }
});
