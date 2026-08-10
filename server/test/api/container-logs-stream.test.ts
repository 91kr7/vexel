import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";
import { containersRouter } from "../../src/containers/containers-routes.js";
import { ownershipArgs } from "../support/fixtures.js";
import { ALPINE_IMAGE, ensureImages } from "../support/base-images.js";
import { execFileAsync } from "../support/docker-cli.js";

// A pruned daemon is a starting state like any other: the base images this
// file's fixtures are built on are ensured here, before the first test, so no
// test has to assume a warm daemon nor depend on another file having pulled
// them. They are shared infrastructure, not fixtures: nothing removes them.
await ensureImages([ALPINE_IMAGE]);

interface SseEvent {
  event: string;
  data: string;
}

interface LogLinePayload {
  seq: number;
  stream: "stdout" | "stderr";
  timestamp?: string;
  text: string;
}

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

// A tiny image (ensured local above) whose entrypoint is overridden to `sh` so
// the container starts instantly, prints known output and then stays alive.
async function createLoggingContainer(name: string, script: string): Promise<string> {
  const { stdout } = await execFileAsync("docker", ["run", "-d", "--name", name, ...ownershipArgs(name), "--entrypoint", "sh", "alpine:3.20", "-c", script]);
  return stdout.trim();
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["rm", "-fv", name]).catch(() => undefined);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForOutput(name: string, needle: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { stdout, stderr } = await execFileAsync("docker", ["logs", name]).catch(() => ({ stdout: "", stderr: "" }));
    if (`${stdout}${stderr}`.includes(needle)) return;
    if (Date.now() > deadline) throw new Error(`container ${name} never printed ${needle}`);
    await delay(200);
  }
}

/**
 * An ISO-8601 instant falling on a whole second strictly between the two lines,
 * taken from the timestamps the daemon recorded.
 *
 * Two properties matter. Reading the bound from the log instead of from the
 * test's own clock keeps it independent of when the test happens to look. Landing
 * it on a whole second keeps it independent of sub-second precision, which the
 * requirement does not speak about: the fixture leaves several seconds between
 * its two lines so that such an instant always exists.
 */
async function instantBetween(name: string, before: string, after: string): Promise<string> {
  const { stdout } = await execFileAsync("docker", ["logs", "--timestamps", name]);
  const stamp = (needle: string): number => {
    const line = stdout.split("\n").find((candidate) => candidate.includes(needle));
    assert.ok(line, `expected ${needle} in the recorded log`);
    const instant = Date.parse(line!.split(" ")[0]!);
    assert.ok(!Number.isNaN(instant), `unreadable timestamp on the ${needle} entry`);
    return instant;
  };
  const start = stamp(before);
  const end = stamp(after);
  const boundary = (Math.floor(start / 1000) + 1) * 1000;
  assert.ok(
    boundary > start && boundary < end,
    "the fixture must leave a whole second strictly between its two lines",
  );
  return new Date(boundary).toISOString();
}

/** Reads the SSE response until a terminating event arrives or the budget runs out. */
async function readEvents(
  response: Response,
  options: { until: string[]; timeoutMs?: number; minLines?: number },
): Promise<SseEvent[]> {
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
      if (options.minLines !== undefined && events.filter((event) => event.event === "line").length >= options.minLines) return;
    }
  })();

  await Promise.race([collect, delay(options.timeoutMs ?? 15_000)]);
  await reader.cancel().catch(() => {});
  return events;
}

function linesOf(events: SseEvent[]): LogLinePayload[] {
  return events.filter((event) => event.event === "line").map((event) => JSON.parse(event.data) as LogLinePayload);
}

// plan-docker_management_app/REQ-30 — a container's logs can be viewed, with stdout and stderr both selectable and tagged
test("GET /api/containers/:id/logs/stream delivers the container's stdout and stderr as tagged line events, then ends", async () => {
  const name = `vexel-test-logs-both-${Date.now()}`;
  const { url, close } = await startApp();
  try {
    const id = await createLoggingContainer(name, "echo out-line; echo err-line 1>&2; sleep 300");
    await waitForOutput(name, "err-line");

    const response = await fetch(`${url}/api/containers/${id}/logs/stream?follow=false`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);

    const events = await readEvents(response, { until: ["end", "error"] });
    const lines = linesOf(events);

    assert.ok(
      lines.some((line) => line.stream === "stdout" && line.text.includes("out-line")),
      "expected the stdout line, tagged stdout",
    );
    assert.ok(
      lines.some((line) => line.stream === "stderr" && line.text.includes("err-line")),
      "expected the stderr line, tagged stderr",
    );
    assert.deepEqual(
      lines.map((line) => line.seq),
      lines.map((_, index) => index + 1),
      "seq increases by one per line",
    );
    assert.equal(events.filter((event) => event.event === "end").length, 1, "exactly one end event once the output is exhausted");
    assert.equal(events.filter((event) => event.event === "error").length, 0);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-30 — the streams shown are selectable
test("GET /api/containers/:id/logs/stream with stderr=false delivers only the stdout output", async () => {
  const name = `vexel-test-logs-stdout-${Date.now()}`;
  const { url, close } = await startApp();
  try {
    const id = await createLoggingContainer(name, "echo out-line; echo err-line 1>&2; sleep 300");
    await waitForOutput(name, "err-line");

    const response = await fetch(`${url}/api/containers/${id}/logs/stream?follow=false&stderr=false`);
    const lines = linesOf(await readEvents(response, { until: ["end", "error"] }));

    assert.ok(lines.length > 0, "expected the stdout output to still be delivered");
    assert.ok(lines.every((line) => line.stream === "stdout"));
    assert.ok(!lines.some((line) => line.text.includes("err-line")), "stderr output must not be delivered");
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-30 — timestamps can be turned on
test("GET /api/containers/:id/logs/stream with timestamps=true carries the instant separately from the text", async () => {
  const name = `vexel-test-logs-ts-${Date.now()}`;
  const { url, close } = await startApp();
  try {
    const id = await createLoggingContainer(name, "echo timestamped-line; sleep 300");
    await waitForOutput(name, "timestamped-line");

    const withTimestamps = linesOf(
      await readEvents(await fetch(`${url}/api/containers/${id}/logs/stream?follow=false&timestamps=true`), { until: ["end", "error"] }),
    );
    const line = withTimestamps.find((candidate) => candidate.text.includes("timestamped-line"));
    assert.ok(line, "expected the printed line");
    assert.match(line!.timestamp ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.ok(!line!.text.includes(line!.timestamp!), "the timestamp must not be repeated inside the text");

    const withoutTimestamps = linesOf(
      await readEvents(await fetch(`${url}/api/containers/${id}/logs/stream?follow=false`), { until: ["end", "error"] }),
    );
    assert.equal(withoutTimestamps.find((candidate) => candidate.text.includes("timestamped-line"))?.timestamp, undefined);
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-30 — the tail size bounds the output to the last n lines
test("GET /api/containers/:id/logs/stream with tail=1 delivers only the last line", async () => {
  const name = `vexel-test-logs-tail-${Date.now()}`;
  const { url, close } = await startApp();
  try {
    const id = await createLoggingContainer(name, "echo line-one; echo line-two; echo line-three; sleep 300");
    await waitForOutput(name, "line-three");

    const response = await fetch(`${url}/api/containers/${id}/logs/stream?follow=false&tail=1`);
    // Every event the stream carried goes into the failure message: a delivery
    // that came back with nothing in it says why in the events it did send
    // (an `error`, or an `end` reached before any line), and counting the lines
    // alone loses that.
    const events = await readEvents(response, { until: ["end", "error"] });
    const lines = linesOf(events);

    assert.equal(lines.length, 1, `expected the last line alone, got the events: ${JSON.stringify(events)}`);
    assert.ok(lines[0]!.text.includes("line-three"));
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-30 — a since/until time filter bounds the output.
// The bound is an ISO-8601 instant (container-logs-endpoint.md accepts either that or a relative
// duration) read back from the timestamps the daemon itself recorded, never from the test's own
// clock: a wall-clock reading races the polling that precedes it, and a relative window races
// however long the fixture took to reach the request.
test("GET /api/containers/:id/logs/stream with a since bound drops the output printed before it", async () => {
  const name = `vexel-test-logs-since-${Date.now()}`;
  const { url, close } = await startApp();
  try {
    const id = await createLoggingContainer(name, "echo early-line; sleep 3; echo late-line; sleep 300");
    await waitForOutput(name, "late-line", 30_000);
    const boundary = await instantBetween(name, "early-line", "late-line");

    const response = await fetch(
      `${url}/api/containers/${id}/logs/stream?follow=false&since=${encodeURIComponent(boundary)}`,
    );
    const lines = linesOf(await readEvents(response, { until: ["end", "error"] }));

    assert.ok(
      lines.some((line) => line.text.includes("late-line")),
      "expected the line printed inside the bound",
    );
    assert.ok(
      !lines.some((line) => line.text.includes("early-line")),
      "the line printed before the bound must be dropped",
    );
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// plan-docker_management_app/REQ-30 — the relative-duration form of the bound is accepted too
// (container-logs-endpoint.md). A window wide enough to contain the whole fixture keeps the
// assertion about the parsing, not about the clock.
test("GET /api/containers/:id/logs/stream accepts a relative since bound", async () => {
  const name = `vexel-test-logs-since-relative-${Date.now()}`;
  const { url, close } = await startApp();
  try {
    const id = await createLoggingContainer(name, "echo relative-line; sleep 300");
    await waitForOutput(name, "relative-line", 30_000);

    const response = await fetch(`${url}/api/containers/${id}/logs/stream?follow=false&since=1h`);
    const lines = linesOf(await readEvents(response, { until: ["end", "error"] }));

    assert.ok(
      lines.some((line) => line.text.includes("relative-line")),
      "a window wide enough must keep the output it contains",
    );
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});

// container-logs-endpoint.md — an unopenable stream is reported as an error event carrying the daemon's own message
test("GET /api/containers/:id/logs/stream for an unknown container reports the daemon's own message", async () => {
  const { url, close } = await startApp();
  try {
    const response = await fetch(`${url}/api/containers/does-not-exist-${Date.now()}/logs/stream?follow=false`);
    const events = await readEvents(response, { until: ["error", "end"], timeoutMs: 10_000 });

    const failure = events.find((event) => event.event === "error");
    assert.ok(failure, "expected an error event when the stream cannot be opened");
    const payload = JSON.parse(failure!.data) as { message?: string };
    assert.ok(typeof payload.message === "string" && payload.message.length > 0);
  } finally {
    await close();
  }
});

// container-logs-endpoint.md — a client disconnecting mid-stream cancels the daemon stream and leaves the endpoint serving
test("a client disconnecting from a followed stream leaves the endpoint serving further requests", async () => {
  const name = `vexel-test-logs-cancel-${Date.now()}`;
  const { url, close } = await startApp();
  try {
    const id = await createLoggingContainer(name, "echo cancel-line; sleep 300");
    await waitForOutput(name, "cancel-line");

    const controller = new AbortController();
    const followed = await fetch(`${url}/api/containers/${id}/logs/stream`, { signal: controller.signal });
    const reader = followed.body!.getReader();
    await reader.read();
    controller.abort();
    await delay(500);

    const response = await fetch(`${url}/api/containers/${id}/logs/stream?follow=false`);
    const lines = linesOf(await readEvents(response, { until: ["end", "error"] }));
    assert.ok(lines.some((line) => line.text.includes("cancel-line")));
  } finally {
    await removeContainerQuietly(name);
    await close();
  }
});
