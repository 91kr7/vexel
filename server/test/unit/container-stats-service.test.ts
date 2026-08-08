import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import type { ContainerStatsSample } from "../../src/containers/container-stats-service.js";

// The service reaches the daemon through the shared EngineClient: the mock
// stands in for it, handing out a controllable stream and recording the paths
// requested.
let requestedPaths: string[] = [];
let currentStream: PassThrough | undefined;
let streamFailure: Error | undefined;

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      request: async (path: string) => {
        requestedPaths.push(path);
        return { statusCode: 200, body: "{}" };
      },
      requestStream: async (path: string) => {
        requestedPaths.push(path);
        if (streamFailure) throw streamFailure;
        currentStream = new PassThrough();
        return currentStream;
      },
    }),
  },
});

const { streamContainerStats, normalizeSample } = await import("../../src/containers/container-stats-service.js");

beforeEach(() => {
  requestedPaths = [];
  currentStream = undefined;
  streamFailure = undefined;
});

/**
 * One daemon stats frame, in the shape the Engine API reports
 * (`GET /containers/{id}/stats`). `cache` and `inactive_file` carry the same
 * amount so the page-cache exclusion is asserted independently of which of the
 * two cgroup layouts is read.
 */
function baseFrame(): Record<string, unknown> {
  return {
    read: "2026-08-06T10:00:00.123456789Z",
    pids_stats: { current: 7 },
    cpu_stats: {
      cpu_usage: { total_usage: 2_000_000_000 },
      system_cpu_usage: 20_000_000_000,
      online_cpus: 4,
    },
    precpu_stats: {
      cpu_usage: { total_usage: 1_000_000_000 },
      system_cpu_usage: 10_000_000_000,
      online_cpus: 4,
    },
    memory_stats: {
      usage: 600 * 1024 * 1024,
      limit: 2048 * 1024 * 1024,
      stats: { cache: 100 * 1024 * 1024, inactive_file: 100 * 1024 * 1024 },
    },
    networks: {
      eth0: { rx_bytes: 1000, tx_bytes: 2000 },
      eth1: { rx_bytes: 500, tx_bytes: 250 },
    },
    blkio_stats: {
      io_service_bytes_recursive: [
        { op: "read", value: 4096 },
        { op: "write", value: 8192 },
        { op: "read", value: 1024 },
      ],
    },
  };
}

function normalize(frame: Record<string, unknown>): ContainerStatsSample {
  return normalizeSample(frame as Parameters<typeof normalizeSample>[0]);
}

interface Collected {
  samples: ContainerStatsSample[];
  errors: string[];
  ends: number;
}

async function start(): Promise<{ cancel: () => void; stream: PassThrough; collected: Collected }> {
  const collected: Collected = { samples: [], errors: [], ends: 0 };
  const cancel = await streamContainerStats("container-1", {
    onSample: (sample) => collected.samples.push(sample),
    onError: (message) => collected.errors.push(message),
    onEnd: () => {
      collected.ends += 1;
    },
  });
  return { cancel, stream: currentStream!, collected };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// container-stats-service.md — cpuPercent is the usage delta over the system delta, scaled by the online CPUs
test("computes the CPU percentage from the usage and system deltas scaled by the online CPUs", () => {
  // (2e9 - 1e9) / (20e9 - 10e9) = 0.1, over 4 cores => 40% of one core's worth per core
  assert.equal(normalize(baseFrame()).cpuPercent, 40);
});

// container-stats-service.md — cpuPercent is 0 whenever either delta is not positive
test("reports a zero CPU percentage when either delta is not positive", () => {
  const idleFrame = baseFrame();
  idleFrame.precpu_stats = { cpu_usage: { total_usage: 2_000_000_000 }, system_cpu_usage: 10_000_000_000 };
  assert.equal(normalize(idleFrame).cpuPercent, 0, "no usage delta means no CPU reading");

  const noSystemDelta = baseFrame();
  noSystemDelta.precpu_stats = { cpu_usage: { total_usage: 1_000_000_000 }, system_cpu_usage: 20_000_000_000 };
  assert.equal(normalize(noSystemDelta).cpuPercent, 0, "no system delta means no CPU reading");
});

// container-stats-service.md — the first frame of a stream has no predecessor, so it carries no CPU reading.
// The daemon marks it by zeroing `precpu_stats` and reporting `preread` as the zero instant.
test("reports a zero CPU percentage for the first frame of a stream, which has no predecessor", () => {
  const firstFrame = baseFrame();
  firstFrame.preread = "0001-01-01T00:00:00Z";
  firstFrame.precpu_stats = { cpu_usage: { total_usage: 0 }, throttling_data: {} };

  assert.equal(normalize(firstFrame).cpuPercent, 0);
});

// container-stats-service.md — memoryUsageBytes excludes the page cache; memoryPercent is usage over limit
test("excludes the page cache from the memory usage and reports the percentage of the limit", () => {
  const sample = normalize(baseFrame());

  assert.equal(sample.memoryUsageBytes, 500 * 1024 * 1024);
  assert.equal(sample.memoryLimitBytes, 2048 * 1024 * 1024);
  assert.ok(
    Math.abs(sample.memoryPercent - (500 / 2048) * 100) < 0.001,
    `expected the percentage of the limit, got ${sample.memoryPercent}`,
  );
});

// container-stats-service.md — memoryUsageBytes is never negative
test("never reports a negative memory usage when the cache exceeds the reported usage", () => {
  const frame = baseFrame();
  frame.memory_stats = {
    usage: 10 * 1024 * 1024,
    limit: 2048 * 1024 * 1024,
    stats: { cache: 50 * 1024 * 1024, inactive_file: 50 * 1024 * 1024 },
  };

  assert.equal(normalize(frame).memoryUsageBytes, 0);
});

// container-stats-service.md — memoryPercent is 0 when no limit is known
test("reports a zero memory percentage when no limit is known", () => {
  const frame = baseFrame();
  frame.memory_stats = { usage: 600 * 1024 * 1024, stats: {} };

  const sample = normalize(frame);
  assert.equal(sample.memoryPercent, 0);
  assert.equal(sample.memoryLimitBytes, 0);
});

// container-stats-service.md — network counters are the sum over every attached network
test("sums the network counters over every attached network", () => {
  const sample = normalize(baseFrame());

  assert.equal(sample.networkRxBytes, 1500);
  assert.equal(sample.networkTxBytes, 2250);
});

// container-stats-service.md — block I/O counters are the sums of the read and of the write operations
test("sums the block I/O counters per operation", () => {
  const sample = normalize(baseFrame());

  assert.equal(sample.blockReadBytes, 5120);
  assert.equal(sample.blockWriteBytes, 8192);
});

// container-stats-service.md — the pid count is carried through
test("carries the number of processes and threads", () => {
  assert.equal(normalize(baseFrame()).pids, 7);
});

// container-stats-service.md — a missing field reads as 0 rather than failing
test("reads every missing field as zero", () => {
  const sample = normalize({});

  assert.deepEqual(
    {
      cpuPercent: sample.cpuPercent,
      memoryUsageBytes: sample.memoryUsageBytes,
      memoryLimitBytes: sample.memoryLimitBytes,
      memoryPercent: sample.memoryPercent,
      networkRxBytes: sample.networkRxBytes,
      networkTxBytes: sample.networkTxBytes,
      blockReadBytes: sample.blockReadBytes,
      blockWriteBytes: sample.blockWriteBytes,
      pids: sample.pids,
    },
    {
      cpuPercent: 0,
      memoryUsageBytes: 0,
      memoryLimitBytes: 0,
      memoryPercent: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      blockReadBytes: 0,
      blockWriteBytes: 0,
      pids: 0,
    },
  );
});

// container-stats-service.md — `at` is the daemon's own reading time, as an ISO-8601 instant
test("reports the daemon's own reading time as the sample instant", () => {
  const at = normalize(baseFrame()).at;

  assert.equal(Date.parse(at), Date.parse("2026-08-06T10:00:00.123Z"));
});

// container-stats-service.md — `at` falls back to the current time when the daemon reports none or an unparseable one
test("falls back to the current time when the frame carries no usable reading time", () => {
  const before = Date.now();
  const missing = normalize({});
  const unparseable = normalize({ read: "not-a-date" });
  const after = Date.now();

  for (const sample of [missing, unparseable]) {
    const parsed = Date.parse(sample.at);
    assert.ok(!Number.isNaN(parsed), `expected an ISO-8601 instant, got ${sample.at}`);
    assert.ok(parsed >= before - 1000 && parsed <= after + 1000, `expected the current time, got ${sample.at}`);
  }
});

// container-stats-service.md — the daemon's streaming stats are opened for the container
test("opens the daemon's streaming stats for the container", async () => {
  await start();

  const path = [...requestedPaths].reverse().find((candidate) => candidate.includes("/stats")) ?? "";
  assert.match(path, /\/containers\/container-1\/stats/);
  assert.match(path, /stream=(1|true)/);
});

// container-stats-service.md — every frame produces exactly one onSample
test("emits exactly one sample per newline-delimited frame", async () => {
  const { stream, collected } = await start();

  stream.write(`${JSON.stringify(baseFrame())}\n`);
  stream.write(`${JSON.stringify({ ...baseFrame(), pids_stats: { current: 9 } })}\n`);
  await settle();

  assert.equal(collected.samples.length, 2);
  assert.deepEqual(
    collected.samples.map((sample) => sample.pids),
    [7, 9],
  );
});

// container-stats-service.md — a frame split in transit is reassembled and reported once, whole
test("reassembles a frame split across chunks and reports it once", async () => {
  const { stream, collected } = await start();
  const frame = `${JSON.stringify(baseFrame())}\n`;

  stream.write(frame.slice(0, 30));
  await settle();
  assert.equal(collected.samples.length, 0);

  stream.write(frame.slice(30, 120));
  await settle();
  assert.equal(collected.samples.length, 0);

  stream.write(frame.slice(120));
  await settle();
  assert.equal(collected.samples.length, 1);
  assert.equal(collected.samples[0]?.pids, 7);
});

// container-stats-service.md — a frame that is not valid JSON is skipped, the stream carries on
test("skips a frame that is not valid JSON and keeps streaming", async () => {
  const { stream, collected } = await start();

  stream.write("{ not json at all\n");
  stream.write(`${JSON.stringify(baseFrame())}\n`);
  await settle();

  assert.equal(collected.samples.length, 1);
  assert.deepEqual(collected.errors, []);
});

// container-stats-service.md — onEnd fires when the daemon closes the stream
test("calls onEnd exactly once when the daemon closes the stream", async () => {
  const { stream, collected } = await start();

  stream.end();
  await settle();

  assert.equal(collected.ends, 1);
  assert.deepEqual(collected.errors, []);
});

// container-stats-service.md — the call rejects with the daemon's own error when the stream cannot be opened
test("rejects with the daemon's own error when the stream cannot be opened", async () => {
  streamFailure = new Error("No such container: container-1");

  await assert.rejects(
    () => streamContainerStats("container-1", { onSample: () => {}, onError: () => {}, onEnd: () => {} }),
    /No such container/,
  );
});

// container-stats-service.md — a mid-flight failure is reported through onError, with the daemon's message verbatim
test("reports a mid-flight stream failure through onError, verbatim", async () => {
  const { stream, collected } = await start();

  stream.emit("error", new Error("connection reset by peer"));
  await settle();

  assert.deepEqual(collected.errors, ["connection reset by peer"]);
});

// container-stats-service.md — after cancel no handler is called again, and cancelling twice is harmless
test("calls no handler after cancel, and tolerates being cancelled twice", async () => {
  const { stream, collected, cancel } = await start();

  stream.write(`${JSON.stringify(baseFrame())}\n`);
  await settle();
  assert.equal(collected.samples.length, 1);

  cancel();
  cancel();

  stream.write(`${JSON.stringify(baseFrame())}\n`);
  stream.end();
  await settle();

  assert.equal(collected.samples.length, 1);
  assert.equal(collected.ends, 0);
  assert.deepEqual(collected.errors, []);
});
