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

const {
  containerListCache,
  listContainers,
  readContainerList,
  startStatsSampling,
  stopStatsSampling,
  isStatsSamplingActive,
  STATS_SAMPLE_INTERVAL_MS,
} = await import("../../src/containers/containers-service.js");
const { resetRefreshCache } = await import("../../src/refresh-cache/refresh-cache.js");

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
  // The refresh cache is process-wide and its refreshers outlive the case that
  // started them, so a held listing has to be a state a case sets rather than
  // one it inherits (plan-docker_management_app-refresh_cache/REQ-47, REQ-48,
  // REQ-50). Reset and not fill: the cases above hold nothing, and that is what
  // makes them exercise the fallback.
  resetRefreshCache();
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

// --- The set the sampler asks statistics for, and where it comes from
// (plan-docker_management_app-refresh_cache/REQ-47 to REQ-51).
//
// The same measurement as above, pointed at a second call: the container
// listing. The two listings share a pathname and differ only by their query, so
// `engine.callsTo` — which strips the query — cannot tell them apart; the two
// counters below do.

/** The sampler's own listing: the daemon's running-only query, no `all`. */
function ownListingCalls(): number {
  return engine.calls.filter((call) => call.pathname === "/containers/json" && call.query.get("all") !== "true").length;
}

/** Reads of the listing the server holds: `GET /containers/json?all=true`. */
function heldListingCalls(): number {
  return engine.calls.filter((call) => call.path === "/containers/json?all=true").length;
}

/** Stats requests for one container since the last reset. */
function statsRequestsFor(id: string): number {
  return engine.calls.filter((call) => call.method === "GET" && call.pathname === `/containers/${id}/stats`).length;
}

/** A listing entry in a given state, as the daemon reports one. */
function containerInState(state: string, id: string): unknown {
  return {
    Id: id,
    Names: [`/c-${state}`],
    Image: "alpine:3.20",
    State: state,
    Status: state,
    Ports: [],
    Labels: {},
    Mounts: [],
    NetworkSettings: { Networks: {} },
  };
}

/**
 * The daemon answering both listings: `?all=true` — the query the held listing
 * is read with — carries every container, the running-only query carries the
 * ones the daemon calls running.
 */
function serveListings(all: unknown[], running: unknown[]): void {
  engine.on("GET", "/containers/json", (call) => (call.query.get("all") === "true" ? all : running));
}

/** One container per state the daemon reports, keyed by that state. */
const STATE_IDS: Record<string, string> = {
  running: "1111111111111111",
  paused: "2222222222222222",
  restarting: "3333333333333333",
  created: "4444444444444444",
  exited: "5555555555555555",
  dead: "6666666666666666",
};

// REQ-47 — while a listing is held, the sampling passes cost no container listing of their own,
// and the statistics keep going out on every one of them.
test("with a listing held, several sampling passes ask the daemon for no container listing of their own", async () => {
  serveListings([runningContainer()], [runningContainer()]);
  await readContainerList();
  assert.notEqual(containerListCache.peek(), undefined, "nothing is held: the case measures the fallback instead");

  startStatsSampling();
  await settle();
  assert.equal(statsRequests(), 1, "the first pass took no sample");

  await advance(STATS_SAMPLE_INTERVAL_MS);
  assert.equal(statsRequests(), 2);

  await advance(STATS_SAMPLE_INTERVAL_MS);
  assert.equal(statsRequests(), 3, "the stats calls stopped going out on every pass");

  assert.equal(ownListingCalls(), 0, "the sampler fetched a container listing of its own while one was held");
});

// REQ-48 — with nothing held, the pass reads the listing itself and samples on that same pass; it
// is never skipped for want of a held listing.
test("with nothing held, the sampler reads the listing itself and samples on that same pass", async () => {
  serveListings([runningContainer()], [runningContainer()]);
  assert.equal(containerListCache.peek(), undefined, "a listing is held: the case measures the wrong path");

  startStatsSampling();
  await settle();
  assert.equal(ownListingCalls(), 1, "the pass read no listing of its own with nothing held");
  assert.equal(statsRequests(), 1, "the pass was skipped for want of a held listing");

  await advance(STATS_SAMPLE_INTERVAL_MS);
  assert.equal(ownListingCalls(), 2);
  assert.equal(statsRequests(), 2, "the next pass was skipped as well");
});

// REQ-49 — the set is the three states the daemon reports as running, one statistics call each, and
// none for a container in any other state. A predicate narrowed to `State === "running"` fails here.
test("a held listing is sampled by state: the running, paused and restarting ones, and no others", async () => {
  const wholeListing = Object.entries(STATE_IDS).map(([state, id]) => containerInState(state, id));
  const runningOnes = ["running", "paused", "restarting"].map((state) => containerInState(state, STATE_IDS[state]!));
  serveListings(wholeListing, runningOnes);
  engine.on("GET", /^\/containers\/[^/]+\/stats$/, () => statsFrame());

  await readContainerList();
  startStatsSampling();
  await settle();

  for (const state of ["running", "paused", "restarting"]) {
    assert.equal(statsRequestsFor(STATE_IDS[state]!), 1, `the ${state} container was not asked for statistics exactly once`);
  }
  for (const state of ["created", "exited", "dead"]) {
    assert.equal(statsRequestsFor(STATE_IDS[state]!), 0, `the ${state} container was asked for statistics`);
  }
  assert.equal(statsRequests(), 3, "the pass asked for statistics beyond the three containers the daemon calls running");
  assert.equal(ownListingCalls(), 0, "the set was read from the daemon rather than derived from the held listing");
});

// REQ-50 — sampling is not asking for the container listing: with nobody else asking, the passes
// neither start a refresher nor keep one alive. An implementation reading with `read()` passes the
// REQ-47 case above and fails here.
test("sampling alone puts the container listing under no refresh and reaches the daemon with no held-listing read", async () => {
  serveListings([runningContainer()], [runningContainer()]);

  startStatsSampling();
  await settle();
  // One interval at a time: the fake clock fires every tick of a longer jump
  // before a single await runs, so the passes behind the first would be dropped
  // as overlapping ones rather than taken.
  for (let pass = 0; pass < 3; pass += 1) await advance(STATS_SAMPLE_INTERVAL_MS);

  assert.equal(statsRequests(), 4, "the sampler did not run: the case would pass on a sampler doing nothing");
  assert.equal(heldListingCalls(), 0, "sampling read the held container listing, which registers demand for it");
  assert.equal(containerListCache.isRefreshing(), false, "sampling put the container listing under refresh");
});

// REQ-51 — a listing just marked changed, with the read covering that change still in flight, delays
// no pass and costs no sample. This is where `read()` waits and `peek()` does not.
test("a listing marked changed with its read in flight costs no sample", async () => {
  const openReads: (() => void)[] = [];
  let holdTheHeldRead = false;
  engine.on("GET", "/containers/json", async (call) => {
    if (call.query.get("all") === "true" && holdTheHeldRead) {
      await new Promise<void>((resolve) => openReads.push(resolve));
    }
    return [runningContainer()];
  });

  try {
    await readContainerList();
    startStatsSampling();
    await settle();
    assert.equal(statsRequests(), 1, "the first pass is out");

    // "The held value predates the change" is measured in whole milliseconds,
    // and the mocked clock stands still unless it is moved: without this the
    // held value carries the very instant of the change and a `read()` answers
    // from it without waiting, which is the case being told apart here.
    await advance(5);

    // The application states the listing has changed; the mocked daemon keeps
    // the read covering that change open for the rest of the case.
    holdTheHeldRead = true;
    containerListCache.markChanged();
    await settle();
    assert.equal(openReads.length, 1, "no read of the listing is in flight: the case measures nothing");

    await advance(STATS_SAMPLE_INTERVAL_MS);
    assert.equal(statsRequests(), 2, "the pass waited for the listing to be read again");

    await advance(STATS_SAMPLE_INTERVAL_MS);
    assert.equal(statsRequests(), 3, "a pass was lost while the read was in flight");
  } finally {
    for (const release of openReads.splice(0)) release();
    await settle();
  }
});

// --- The state the six figures are answered against
// (plan-docker_management_app-containers_card_view-stopped-container-no-sample/REQ-1 to REQ-5).
//
// Each case stops the sampler before the listing changes state, so the periodic drop of a cached
// sample cannot be what makes it pass: the reading is still held, and still fresh.

const STOPPED_ID = "7777777777777777";
const SYSTEM_CPU_DELTA = 10_000_000_000;
const ONLINE_CPUS = 4;
const DEFAULT_MEMORY = { usage: 600 * 1024 * 1024, limit: 2048 * 1024 * 1024, cache: 100 * 1024 * 1024 };
/** What a paused container reports, measured on the operator's daemon (REQ-4, "Values fixed here"). */
const PAUSED_MEMORY = { usage: 831_488, limit: 18_830_254_080, cache: 0 };

/** A stats frame that yields a given `cpuPercent` under the service's own formula. */
function statsFrameAtCpuPercent(percent: number, memory = DEFAULT_MEMORY): unknown {
  const cpuDelta = (percent * SYSTEM_CPU_DELTA) / (ONLINE_CPUS * 100);
  return {
    read: "2026-08-31T10:00:00.000000000Z",
    cpu_stats: {
      cpu_usage: { total_usage: 1_000_000_000 + cpuDelta },
      system_cpu_usage: 1_000_000_000 + SYSTEM_CPU_DELTA,
      online_cpus: ONLINE_CPUS,
    },
    precpu_stats: { cpu_usage: { total_usage: 1_000_000_000 }, system_cpu_usage: 1_000_000_000, online_cpus: ONLINE_CPUS },
    memory_stats: { usage: memory.usage, limit: memory.limit, stats: { cache: memory.cache } },
    networks: { eth0: { rx_bytes: 1000, tx_bytes: 2000 } },
  };
}

const SIX_FIGURES = [
  "cpuPercent",
  "memoryUsageBytes",
  "memoryLimitBytes",
  "onlineCpus",
  "networkRxBytes",
  "networkTxBytes",
] as const;

// A CPU percentage is the result of a division, so it is compared as a measurement and not as a bit
// pattern: the fixture builds the counters from the percentage and the service divides them back,
// and that round trip is exact for 12 and lands on 7.000000000000001 for 7. The tolerance is far
// below the tenth of a point the card prints, and it still tells one figure from another, from a
// measured zero and from no reading at all. The other five figures are counters taken from the
// frame as they are, so they are compared exactly.
const CPU_PERCENT_TOLERANCE = 1e-9;

/** Asserts the container was answered with a given CPU percentage. */
function assertCpuPercent(actual: number | undefined, expected: number, message: string): void {
  assert.equal(typeof actual, "number", `${message} (no CPU percentage at all)`);
  assert.ok(Math.abs((actual ?? Number.NaN) - expected) <= CPU_PERCENT_TOLERANCE, `${message} (expected ${expected}, answered ${actual})`);
}

/** Asserts the CPU percentage answered is not a given one; no reading at all is not that one either. */
function assertCpuPercentIsNot(actual: number | undefined, refused: number, message: string): void {
  assert.ok(actual === undefined || Math.abs(actual - refused) > CPU_PERCENT_TOLERANCE, message);
}

// REQ-1, REQ-2 — the figures reach only a container the same listing puts in the running set.
test("a container the listing reports as exited is answered with none of the six figures, fresh sample or not", async () => {
  serveListings([containerInState("running", STOPPED_ID)], [containerInState("running", STOPPED_ID)]);
  engine.on("GET", /^\/containers\/[^/]+\/stats$/, () => statsFrameAtCpuPercent(4));

  startStatsSampling();
  await settle();
  stopStatsSampling();

  const [whileRunning] = await listContainers();
  assert.equal(typeof whileRunning?.cpuPercent, "number", "the case would pass on a sampler doing nothing");

  serveListings([containerInState("exited", STOPPED_ID)], []);
  const [afterItStopped] = await listContainers();

  assert.equal(afterItStopped?.state, "exited");
  for (const figure of SIX_FIGURES) {
    assert.equal(afterItStopped?.[figure], undefined, `the answer states exited and a measured ${figure} at once`);
  }
  assert.equal(afterItStopped?.id, STOPPED_ID, "what is withheld is the reading, not the row");
});

// REQ-3 — what a stopped container loses is any reading, not only a zero.
test("a container measured at 12 per cent is answered with no figure at all once the listing calls it exited", async () => {
  serveListings([containerInState("running", STOPPED_ID)], [containerInState("running", STOPPED_ID)]);
  engine.on("GET", /^\/containers\/[^/]+\/stats$/, () => statsFrameAtCpuPercent(12));

  startStatsSampling();
  await settle();
  stopStatsSampling();

  const [whileRunning] = await listContainers();
  assertCpuPercent(whileRunning?.cpuPercent, 12, "the container was never reported at 12 per cent: the case measures nothing");

  serveListings([containerInState("exited", STOPPED_ID)], []);
  const [afterItStopped] = await listContainers();

  assert.equal(afterItStopped?.cpuPercent, undefined, "the last figure measured outlived the container it was measured on");
  assert.equal(afterItStopped?.memoryUsageBytes, undefined);
  assert.equal(afterItStopped?.memoryLimitBytes, undefined);
});

// REQ-4, REQ-1 — the daemon's running set keeps its figures, a measured zero included.
test("a paused and a restarting container keep all six figures, and a measured zero keeps its capacity", async () => {
  const wholeListing = Object.entries(STATE_IDS).map(([state, id]) => containerInState(state, id));
  const runningOnes = ["running", "paused", "restarting"].map((state) => containerInState(state, STATE_IDS[state]!));
  serveListings(wholeListing, runningOnes);
  const pausedStatsPath = `/containers/${STATE_IDS.paused}/stats`;
  engine.on("GET", /^\/containers\/[^/]+\/stats$/, (call) =>
    call.pathname === pausedStatsPath ? statsFrameAtCpuPercent(0, PAUSED_MEMORY) : statsFrameAtCpuPercent(7),
  );

  startStatsSampling();
  await settle();
  stopStatsSampling();

  const listed = new Map((await listContainers()).map((summary) => [summary.id, summary] as const));

  for (const state of ["running", "paused", "restarting"]) {
    const summary = listed.get(STATE_IDS[state]!);
    for (const figure of SIX_FIGURES) {
      assert.equal(typeof summary?.[figure], "number", `the ${state} container lost its ${figure}`);
    }
  }

  const paused = listed.get(STATE_IDS.paused!);
  assertCpuPercent(paused?.cpuPercent, 0, "the paused container was not answered with the zero it was measured at");
  assert.equal(paused?.memoryLimitBytes, PAUSED_MEMORY.limit, "a measured zero lost the capacity it is stated against");
  assert.equal(paused?.memoryUsageBytes, PAUSED_MEMORY.usage);

  for (const state of ["created", "exited", "dead"]) {
    const summary = listed.get(STATE_IDS[state]!);
    assert.notEqual(summary, undefined, `the ${state} container is not listed at all`);
    for (const figure of SIX_FIGURES) {
      assert.equal(summary?.[figure], undefined, `the ${state} container carries a ${figure}`);
    }
  }
});

// REQ-2 — the same rule on the listing the endpoint answers with, which is what serves a card.
test("the listing the endpoint answers with withholds the figures of a container it reports as exited", async () => {
  engine.on("GET", "/containers/json", (call) =>
    call.query.get("all") === "true" ? [containerInState("exited", STOPPED_ID)] : [containerInState("running", STOPPED_ID)],
  );
  engine.on("GET", /^\/containers\/[^/]+\/stats$/, () => statsFrameAtCpuPercent(9));

  startStatsSampling();
  await settle();
  stopStatsSampling();
  assert.equal(statsRequestsFor(STOPPED_ID), 1, "the container was never sampled: the case would pass on an empty cache");

  const [summary] = (await readContainerList()).value;

  assert.equal(summary?.state, "exited");
  for (const figure of SIX_FIGURES) {
    assert.equal(summary?.[figure], undefined, `the endpoint's listing states exited and a measured ${figure} at once`);
  }
});

// REQ-5 — a container the sampler has never read is still answered with no figures.
test("a running container the sampler has never read is answered with none of the six figures", async () => {
  serveListings([runningContainer()], [runningContainer()]);

  const [summary] = await listContainers();

  assert.equal(statsRequests(), 0, "the sampler ran: the container was not left unread");
  assert.equal(summary?.state, "running");
  for (const figure of SIX_FIGURES) {
    assert.equal(summary?.[figure], undefined, `an unsampled container carries a ${figure}`);
  }
});

// --- The answer a pass refuses
// (plan-docker_management_app-containers_card_view-stopped-container-no-sample/REQ-8 to REQ-11).
//
// The daemon does not fail the statistics call of a container that has just stopped: it answers 200
// with an empty frame. Read as figures, that frame is a container using nothing. Each case below
// keeps the listing calling the container `running`, so the projection of REQ-1 cannot be what
// withholds the figures — what is measured here is what the pass stored, and what it dropped.

const RESTARTED_ID = "8888888888888888";

/**
 * The frame the daemon answers for a container that is no longer running, as measured on Docker
 * 29.7.2: no memory limit, every CPU counter zero, no `system_cpu_usage`, no `networks`.
 */
function emptyStatsFrame(): unknown {
  return {
    read: "0001-01-01T00:00:00Z",
    preread: "0001-01-01T00:00:00Z",
    pids_stats: {},
    num_procs: 0,
    storage_stats: {},
    cpu_stats: { cpu_usage: { total_usage: 0, usage_in_kernelmode: 0, usage_in_usermode: 0 } },
    precpu_stats: { cpu_usage: { total_usage: 0, usage_in_kernelmode: 0, usage_in_usermode: 0 } },
    memory_stats: {},
  };
}

/** The listing calls the container running, whichever query it is asked with. */
function serveRunning(id: string): void {
  serveListings([containerInState("running", id)], [containerInState("running", id)]);
}

// REQ-8, REQ-9, REQ-11 — an answer reporting no memory limit is not a measurement: nothing is
// stored for that container, and the pass asks the daemon for nothing more than the one call it
// makes for everyone else.
test("an answer reporting no memory limit stores nothing and costs the daemon no second call", async () => {
  serveRunning(RESTARTED_ID);
  engine.on("GET", /^\/containers\/[^/]+\/stats$/, () => emptyStatsFrame());

  startStatsSampling();
  await settle();
  assert.equal(statsRequestsFor(RESTARTED_ID), 1, "the container was never sampled: the case would pass on a sampler doing nothing");

  const [summary] = await listContainers();
  assert.equal(summary?.state, "running", "the listing calls it stopped: the projection withholds the figures on its own");
  for (const figure of SIX_FIGURES) {
    assert.equal(summary?.[figure], undefined, `the empty frame was stored as a measured ${figure}`);
  }

  await advance(STATS_SAMPLE_INTERVAL_MS);
  assert.equal(statsRequestsFor(RESTARTED_ID), 2, "the refused answer was retried, or cost the next pass");
});

// REQ-9 — the mark is the missing memory limit and nothing else, so no real reading is refused: a
// complete frame is stored and answered with the figures it carries.
test("a complete frame is stored, and answered with the six figures it carries", async () => {
  serveRunning(RESTARTED_ID);
  engine.on("GET", /^\/containers\/[^/]+\/stats$/, () => statsFrameAtCpuPercent(12));

  startStatsSampling();
  await settle();
  stopStatsSampling();

  const [summary] = await listContainers();

  assertCpuPercent(summary?.cpuPercent, 12, "the complete frame was not answered with the percentage it carries");
  assert.equal(summary?.memoryLimitBytes, DEFAULT_MEMORY.limit);
  // The page cache is subtracted from the raw usage, as `docker stats` reports it.
  assert.equal(summary?.memoryUsageBytes, DEFAULT_MEMORY.usage - DEFAULT_MEMORY.cache);
  assert.equal(summary?.onlineCpus, ONLINE_CPUS);
  assert.equal(summary?.networkRxBytes, 1000);
  assert.equal(summary?.networkTxBytes, 2000);
});

// REQ-8, REQ-10 — the container the listing calls running whose answer is empty: it is the one
// stopped and started again inside an interval, and it carries no figure until a pass measures it.
test("a container answering with an empty frame carries none of the six figures, and carries them on the pass that measures it", async () => {
  serveRunning(RESTARTED_ID);
  let stopped = true;
  engine.on("GET", /^\/containers\/[^/]+\/stats$/, () => (stopped ? emptyStatsFrame() : statsFrameAtCpuPercent(12)));

  startStatsSampling();
  await settle();

  const [whileRefused] = await listContainers();
  assert.equal(whileRefused?.state, "running");
  assertCpuPercentIsNot(whileRefused?.cpuPercent, 0, "the zero measured while the container was stopped reached the card");
  for (const figure of SIX_FIGURES) {
    assert.equal(whileRefused?.[figure], undefined, `the empty frame was answered with a ${figure}`);
  }

  stopped = false;
  await advance(STATS_SAMPLE_INTERVAL_MS);
  const [afterAMeasuredPass] = await listContainers();

  assertCpuPercent(afterAMeasuredPass?.cpuPercent, 12, "the container was not measured on the pass that answered with a frame");
  for (const figure of SIX_FIGURES) {
    assert.equal(typeof afterAMeasuredPass?.[figure], "number", `the measured pass left the ${figure} unanswered`);
  }
});

// REQ-8, REQ-10 — the refused answer says the process the earlier reading measured is gone, so that
// reading is dropped rather than left standing, and no zero takes its place.
test("an empty answer drops the reading the container had, and puts no zero in its place", async () => {
  serveRunning(RESTARTED_ID);
  let stopped = false;
  engine.on("GET", /^\/containers\/[^/]+\/stats$/, () => (stopped ? emptyStatsFrame() : statsFrameAtCpuPercent(12)));

  startStatsSampling();
  await settle();
  const [measured] = await listContainers();
  assertCpuPercent(measured?.cpuPercent, 12, "the container was never measured: the case measures nothing");

  // One interval later that reading is still well inside the staleness bound, so what the listing
  // reports next is the refusal's doing and not the age of the sample.
  stopped = true;
  await advance(STATS_SAMPLE_INTERVAL_MS);
  const [afterTheRefusal] = await listContainers();

  assertCpuPercentIsNot(afterTheRefusal?.cpuPercent, 0, "the empty frame was stored as a measured zero");
  for (const figure of SIX_FIGURES) {
    assert.equal(afterTheRefusal?.[figure], undefined, `the refused answer left the ${figure} of the earlier reading standing`);
  }
});

// REQ-8, REQ-10, REQ-11 — the whole cycle the operator sees: measured, stopped and started again
// inside one interval, measured again. In between the card carries neither the zero of the empty
// frame nor the figure taken before the container stopped, and the pass keeps its cadence.
test("a container measured, then answering empty, then measured again carries no figure in between and its own after", async () => {
  serveRunning(RESTARTED_ID);
  let answer: unknown = statsFrameAtCpuPercent(12);
  engine.on("GET", /^\/containers\/[^/]+\/stats$/, () => answer);

  startStatsSampling();
  await settle();
  const [whileRunning] = await listContainers();
  assertCpuPercent(whileRunning?.cpuPercent, 12, "the container was never measured: the case measures nothing");

  // It stops. The listing is a few hundred milliseconds old and still calls it running, so the pass
  // asks for its statistics and the daemon answers with the empty frame.
  answer = emptyStatsFrame();
  await advance(STATS_SAMPLE_INTERVAL_MS);

  // It is running again before the next pass, so what the card reads is what that pass left behind.
  const [afterTheRestart] = await listContainers();
  assert.equal(afterTheRestart?.state, "running");
  assertCpuPercentIsNot(afterTheRestart?.cpuPercent, 0, "the zero produced while the container was stopped reached the card");
  assertCpuPercentIsNot(afterTheRestart?.cpuPercent, 12, "the figure measured before the container stopped reached the card");
  for (const figure of SIX_FIGURES) {
    assert.equal(afterTheRestart?.[figure], undefined, `the restarted container carries a ${figure} it was never measured at`);
  }

  answer = statsFrameAtCpuPercent(7);
  await advance(STATS_SAMPLE_INTERVAL_MS);
  const [afterAMeasuredPass] = await listContainers();

  assertCpuPercent(afterAMeasuredPass?.cpuPercent, 7, "the figures did not come back on the pass that measured the container again");
  assert.equal(statsRequestsFor(RESTARTED_ID), 3, "the three passes cost anything other than one call each");
  for (const figure of SIX_FIGURES) {
    assert.equal(typeof afterAMeasuredPass?.[figure], "number", `the measured pass left the ${figure} unanswered`);
  }
});
