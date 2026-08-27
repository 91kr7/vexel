import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";

// What the push/pull progress endpoints send the browser when the daemon's own
// stream ends without the daemon having stated a success
// (plan-docker_management_app-push_failure_reporting/REQ-2, REQ-6). A real
// daemon cannot be asked to end a stream mid-transfer on demand, so the Engine
// API — an external contract — is stood in for here; everything above it, the
// route and the SSE framing, is the product's own.
let currentStream: PassThrough | undefined;

mock.module(new URL("../../src/connectivity/connection-status-service.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({
      requestStream: async () => {
        currentStream = new PassThrough();
        return currentStream;
      },
    }),
  },
});

const { imagesRouter } = await import("../../src/images/images-routes.js");

beforeEach(() => {
  currentStream = undefined;
});

function startApp(): Promise<{ url: string; close: () => Promise<void> }> {
  const app: Express = express();
  app.use("/api/images", imagesRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((closeResolve) => server.close(() => closeResolve())),
      });
    });
  });
}

async function daemonStream(): Promise<PassThrough> {
  const deadline = Date.now() + 2_000;
  while (currentStream === undefined) {
    if (Date.now() > deadline) throw new Error("the route never opened a stream towards the daemon");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return currentStream;
}

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

/** Reads the SSE body until the stream carrying it ends. */
async function readSseToTheEnd(response: Response): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const eventLine = frame.split("\n").find((line) => line.startsWith("event: "));
      const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
      if (!eventLine || !dataLine) continue;
      events.push({ event: eventLine.slice("event: ".length), data: JSON.parse(dataLine.slice("data: ".length)) as Record<string, unknown> });
    }
  }
  return events;
}

// plan-docker_management_app-push_failure_reporting/REQ-2 — a push whose daemon stream ended without a
// stated success reaches the browser as a failure, never as a completion
test("GET /api/images/:id/push/stream reports an end with no stated success as an error event", async () => {
  const { url, close } = await startApp();
  try {
    const request = fetch(`${url}/api/images/sha256:abc/push/stream?reference=${encodeURIComponent("localhost:1/myrepo/app:v1")}`);
    const stream = await daemonStream();
    stream.write('{"status":"The push refers to repository [localhost:1/myrepo/app]"}\n');
    stream.write('{"id":"3f26bc2dec0b","status":"Unavailable","progressDetail":{}}\n');
    stream.end();

    const events = await readSseToTheEnd(await request);
    const last = events.at(-1)!;
    assert.equal(last.event, "error", `the push ended with a "${last.event}" event: ${JSON.stringify(events.slice(-3))}`);
    assert.equal(events.some((event) => event.event === "end"), false, "no completion is reported for a push nobody declared successful");
    assert.equal(typeof last.data.message === "string" && (last.data.message as string).length > 0, true, "the failure carries a message");
  } finally {
    await close();
  }
});

// plan-docker_management_app-push_failure_reporting/REQ-5 — a push the daemon states the success of still ends as it did
test("GET /api/images/:id/push/stream ends with an end event once the daemon has stated the digest it stored", async () => {
  const { url, close } = await startApp();
  try {
    const request = fetch(`${url}/api/images/sha256:abc/push/stream?reference=${encodeURIComponent("localhost:5099/myrepo/app:v1")}`);
    const stream = await daemonStream();
    stream.write('{"id":"3f26bc2dec0b","status":"Pushed"}\n');
    stream.write('{"status":"v1: digest: sha256:45e0d1e1f0b0c0d0e0f0011223344556677889900aabbccddeeff0011223399e1 size: 1026"}\n');
    stream.end();

    const events = await readSseToTheEnd(await request);
    assert.equal(events.some((event) => event.event === "step"), true, "the per-layer progress is reported as it runs");
    assert.equal(events.at(-1)!.event, "end");
  } finally {
    await close();
  }
});

// plan-docker_management_app-push_failure_reporting/REQ-6 — a pull reports its outcome through the same path
test("GET /api/images/pull/stream reports an end with no stated success as an error event", async () => {
  const { url, close } = await startApp();
  try {
    const request = fetch(`${url}/api/images/pull/stream?reference=${encodeURIComponent("localhost:1/myrepo/app:v1")}`);
    const stream = await daemonStream();
    stream.write('{"id":"3f26bc2dec0b","status":"Pulling fs layer"}\n');
    stream.end();

    const events = await readSseToTheEnd(await request);
    const last = events.at(-1)!;
    assert.equal(last.event, "error", `the pull ended with a "${last.event}" event: ${JSON.stringify(events.slice(-3))}`);
    assert.equal(events.some((event) => event.event === "end"), false, "no completion is reported for a pull nobody declared successful");
  } finally {
    await close();
  }
});
