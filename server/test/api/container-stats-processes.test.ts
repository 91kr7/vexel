import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { containersRouter } from "../../src/containers/containers-routes.js";
import { ownershipArgs } from "../support/fixtures.js";
import { ALPINE_IMAGE, ensureImages } from "../support/base-images.js";

// A pruned daemon is a starting state like any other: the base images this
// file's fixtures are built on are ensured here, before the first test, so no
// test has to assume a warm daemon nor depend on another file having pulled
// them. They are shared infrastructure, not fixtures: nothing removes them.
await ensureImages([ALPINE_IMAGE]);

const execFileAsync = promisify(execFile);

interface SseEvent {
  event: string;
  data: string;
}

interface StatsSample {
  at: string;
  cpuPercent: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
  networkRxBytes: number;
  networkTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  pids: number;
}

interface ProcessListPayload {
  titles: string[];
  processes: Array<{ pid: number; user: string; command: string; cpuPercent?: number; memoryPercent?: number }>;
}

const MEMORY_LIMIT_BYTES = 512 * 1024 * 1024;

function startApp(): Promise<{ url: string; close: () => Promise<void> }> {
  const app: Express = express();
  app.use(express.json());
  app.use("/api/containers", containersRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((closeResolve) => {
            // An SSE response keeps its socket open; force it shut instead of
            // waiting on a graceful close no lingering client ever triggers.
            server.closeAllConnections();
            server.close(() => closeResolve());
          }),
      });
    });
  });
}

/**
 * A container that burns CPU in a shell loop under a known memory limit: its
 * resource usage is non-zero and its limit is a value the test can assert.
 */
async function createBusyContainer(name: string): Promise<string> {
  const { stdout } = await execFileAsync("docker", [
    "run",
    "-d",
    "--name",
    name,
    ...ownershipArgs(name),
    "--memory",
    "512m",
    "--entrypoint",
    "sh",
    "alpine:3.20",
    "-c",
    "i=0; while true; do i=$((i+1)); done",
  ]);
  return stdout.trim();
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["rm", "-fv", name]).catch(() => undefined);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reads the SSE response until enough samples arrived, a terminating event arrived, or the budget ran out. */
async function readEvents(response: Response, options: { until: string[]; minSamples?: number; timeoutMs?: number }): Promise<SseEvent[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let buffer = "";

  const collect = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex !== -1) {
        const chunk = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const eventName = /^event:\s*(.*)$/m.exec(chunk)?.[1]?.trim() ?? "message";
        const data = /^data:\s*(.*)$/m.exec(chunk)?.[1] ?? "";
        events.push({ event: eventName, data });
        separatorIndex = buffer.indexOf("\n\n");
      }
      if (events.some((event) => options.until.includes(event.event))) return;
      if (options.minSamples !== undefined && events.filter((event) => event.event === "sample").length >= options.minSamples) return;
    }
  })();

  await Promise.race([collect, delay(options.timeoutMs ?? 20_000)]);
  await reader.cancel().catch(() => {});
  return events;
}

function samplesOf(events: SseEvent[]): StatsSample[] {
  return events.filter((event) => event.event === "sample").map((event) => JSON.parse(event.data) as StatsSample);
}

// plan-docker_management_app/REQ-32 — a container's live resource usage is shown and keeps updating while the view is open
test("GET /api/containers/:id/stats/stream delivers CPU, memory, network and block-I/O readings, sample after sample", async () => {
  const name = `vexel-test-stats-live-${Date.now()}`;
  const { url, close } = await startApp();
  try {
    const id = await createBusyContainer(name);
    const response = await fetch(`${url}/api/containers/${id}/stats/stream`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);

    const samples = samplesOf(await readEvents(response, { until: ["error"], minSamples: 3 }));

    assert.ok(samples.length >= 3, `expected the readings to keep arriving, got ${samples.length} sample(s)`);
    for (const sample of samples) {
      assert.ok(!Number.isNaN(Date.parse(sample.at)), `expected an ISO-8601 instant, got ${sample.at}`);
      for (const field of [
        "cpuPercent",
        "memoryUsageBytes",
        "memoryLimitBytes",
        "memoryPercent",
        "networkRxBytes",
        "networkTxBytes",
        "blockReadBytes",
        "blockWriteBytes",
        "pids",
      ] as const) {
        assert.equal(typeof sample[field], "number", `${field} must be a ready-to-display number`);
        assert.ok(sample[field] >= 0, `${field} must not be negative, got ${sample[field]}`);
      }
      assert.equal(sample.memoryLimitBytes, MEMORY_LIMIT_BYTES, "the memory limit the container was started with");
      assert.ok(sample.memoryUsageBytes > 0 && sample.memoryUsageBytes <= sample.memoryLimitBytes);
      assert.ok(
        Math.abs(sample.memoryPercent - (sample.memoryUsageBytes / sample.memoryLimitBytes) * 100) < 0.5,
        `memoryPercent must be the usage over the limit, got ${sample.memoryPercent}`,
      );
      assert.ok(sample.pids > 0, "a running container reports its processes");
    }

    // The samples are successive readings, not the same frame repeated.
    const instants = samples.map((sample) => Date.parse(sample.at));
    assert.ok(instants[instants.length - 1] > instants[0], "each sample must carry a later reading time than the previous one");
    assert.ok(
      samples.some((sample) => sample.cpuPercent > 0),
      "a container burning CPU must report a CPU percentage above zero",
    );
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// container-stats-endpoint.md — an unopenable stream is reported as an error event carrying the daemon's own message
test("GET /api/containers/:id/stats/stream for an unknown container reports the daemon's own message", async () => {
  const { url, close } = await startApp();
  try {
    const response = await fetch(`${url}/api/containers/does-not-exist-${Date.now()}/stats/stream`);
    const events = await readEvents(response, { until: ["error", "end"], timeoutMs: 10_000 });

    const failure = events.find((event) => event.event === "error");
    assert.ok(failure, "expected an error event when the stream cannot be opened");
    const payload = JSON.parse(failure!.data) as { message?: string };
    assert.ok(typeof payload.message === "string" && payload.message.length > 0);
  } finally {
    await close();
  }
});

// container-stats-endpoint.md — the daemon stream is cancelled when the client disconnects, including mid-stream
test("a client disconnecting from the stats stream leaves the endpoint serving further requests", async () => {
  const name = `vexel-test-stats-cancel-${Date.now()}`;
  const { url, close } = await startApp();
  try {
    const id = await createBusyContainer(name);
    const controller = new AbortController();
    const streamed = await fetch(`${url}/api/containers/${id}/stats/stream`, { signal: controller.signal });
    await streamed.body!.getReader().read();
    controller.abort();
    await delay(500);

    const response = await fetch(`${url}/api/containers/${id}/stats/stream`);
    const samples = samplesOf(await readEvents(response, { until: ["error"], minSamples: 1 }));
    assert.ok(samples.length >= 1, "the endpoint must keep serving after a consumer disconnected");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// container-stats-endpoint.md — a disconnect while the stream is still being opened is cancelled too
test("a client disconnecting while the stats stream is being opened leaves the endpoint serving", async () => {
  const name = `vexel-test-stats-cancel-early-${Date.now()}`;
  const { url, close } = await startApp();
  try {
    const id = await createBusyContainer(name);
    const controller = new AbortController();
    const pending = fetch(`${url}/api/containers/${id}/stats/stream`, { signal: controller.signal }).catch(() => undefined);
    controller.abort();
    await pending;
    await delay(500);

    const response = await fetch(`${url}/api/containers/${id}/stats/stream`);
    const samples = samplesOf(await readEvents(response, { until: ["error"], minSamples: 1 }));
    assert.ok(samples.length >= 1, "the endpoint must keep serving after an aborted opening");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-33 — the processes running inside a container are listed with pid, user and command
test("GET /api/containers/:id/processes lists the processes running inside the container with pid, user and command", async () => {
  const name = `vexel-test-top-${Date.now()}`;
  const { url, close } = await startApp();
  try {
    const id = await createBusyContainer(name);
    const response = await fetch(`${url}/api/containers/${id}/processes`);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as ProcessListPayload;

    assert.ok(Array.isArray(payload.titles) && payload.titles.length > 0, "the daemon's column titles are reported");
    assert.ok(payload.processes.length > 0, "a running container has at least one process");
    for (const process of payload.processes) {
      assert.equal(typeof process.pid, "number");
      assert.ok(process.pid > 0, `expected a real pid, got ${process.pid}`);
      assert.ok(process.user.length > 0, "expected the process owner");
      assert.ok(process.command.length > 0, "expected the process command");
    }
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-33 — the listing can be refreshed on demand: a later read reports the current processes
test("GET /api/containers/:id/processes read again reports a process started in the meantime", async () => {
  const name = `vexel-test-top-refresh-${Date.now()}`;
  const { url, close } = await startApp();
  const marker = "424242";
  try {
    const id = await createBusyContainer(name);
    const before = (await (await fetch(`${url}/api/containers/${id}/processes`)).json()) as ProcessListPayload;
    assert.ok(!before.processes.some((process) => process.command.includes(marker)));

    await execFileAsync("docker", ["exec", "-d", name, "sleep", marker]);
    await delay(500);

    const after = (await (await fetch(`${url}/api/containers/${id}/processes`)).json()) as ProcessListPayload;
    assert.ok(
      after.processes.some((process) => process.command.includes(marker)),
      "a re-read must report the processes running at that moment, not a cached listing",
    );
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// container-processes-endpoint.md — a daemon refusal is reported with its own message and status
test("GET /api/containers/:id/processes for an unknown container reports the daemon's own message", async () => {
  const { url, close } = await startApp();
  try {
    const response = await fetch(`${url}/api/containers/does-not-exist-${Date.now()}/processes`);

    assert.ok(response.status >= 400 && response.status < 600, `expected a failure status, got ${response.status}`);
    const payload = (await response.json()) as { error?: string };
    assert.ok(typeof payload.error === "string" && payload.error.length > 0, "expected the daemon's message under `error`");
  } finally {
    await close();
  }
});

// container-processes-endpoint.md — a stopped container has no process listing; the daemon's refusal is passed on
test("GET /api/containers/:id/processes for a stopped container reports the daemon's own message", async () => {
  const name = `vexel-test-top-stopped-${Date.now()}`;
  const { url, close } = await startApp();
  try {
    const id = await createBusyContainer(name);
    await execFileAsync("docker", ["kill", name]);

    const response = await fetch(`${url}/api/containers/${id}/processes`);

    assert.ok(response.status >= 400 && response.status < 600, `expected a failure status, got ${response.status}`);
    const payload = (await response.json()) as { error?: string };
    assert.ok(typeof payload.error === "string" && payload.error.length > 0);
    assert.match(payload.error!, /not running/i);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});
