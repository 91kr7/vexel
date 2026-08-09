import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import express from "express";
import type { AddressInfo } from "node:net";
import type { DaemonEvent } from "../../src/events/event-stream-service.js";

// The shape of the SSE frames GET /api/events/stream writes, and how a
// reconnecting browser resumes: events/specs/events-stream-endpoint.md. The
// daemon stream is mocked, so the backlog holds exactly the events fed here and
// a resume can be checked against a known sequence.

const daemonStream = new PassThrough();

mock.module(new URL("../../src/docker/engine-client.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({ requestStream: async () => daemonStream }),
  },
});

const { eventStreamService } = await import("../../src/events/event-stream-service.js");
const { eventsRouter } = await import("../../src/events/events-routes.js");

interface Frame {
  /** The whole frame as written, so a test can tell how many lines it spans. */
  raw: string;
  id: string;
  event: DaemonEvent;
}

function rawLine(action: string, actorId: string, actorName: string, nanos: string): string {
  return (
    `{"status":${JSON.stringify(action)},"id":${JSON.stringify(actorId)},"Type":"container",` +
    `"Action":${JSON.stringify(action)},"Actor":{"ID":${JSON.stringify(actorId)},` +
    `"Attributes":{"name":${JSON.stringify(actorName)}}},"scope":"local",` +
    `"time":${nanos.slice(0, 10)},"timeNano":${nanos}}`
  );
}

/** Writes the given raw lines and resolves once the service has published them all. */
function feed(lines: string[]): Promise<DaemonEvent[]> {
  return new Promise((resolve) => {
    const received: DaemonEvent[] = [];
    const handler = (event: DaemonEvent) => {
      received.push(event);
      if (received.length === lines.length) {
        eventStreamService.off("event", handler);
        resolve(received);
      }
    };
    eventStreamService.on("event", handler);
    for (const line of lines) daemonStream.write(line + "\n");
  });
}

function parseFrames(buffer: string): Frame[] {
  return buffer
    .split("\n\n")
    .filter((chunk) => chunk.length > 0)
    .map((raw) => {
      const idLine = raw.split("\n").find((line) => line.startsWith("id: "));
      const dataLine = raw.split("\n").find((line) => line.startsWith("data: "));
      assert.ok(dataLine, `frame without a data line: ${JSON.stringify(raw)}`);
      return { raw, id: idLine?.slice("id: ".length) ?? "", event: JSON.parse(dataLine.slice("data: ".length)) as DaemonEvent };
    });
}

/**
 * Opens the stream, collects whatever the endpoint writes as its catch-up, then
 * hangs up. The connection stays open by design, so the read is bounded by a
 * short quiet period rather than by end-of-stream.
 */
async function readCatchUp(baseUrl: string, headers: Record<string, string> = {}): Promise<Frame[]> {
  const response = await fetch(`${baseUrl}/api/events/stream`, { headers });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let quiet: NodeJS.Timeout | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    quiet = setTimeout(() => resolve(undefined), 500);
  });
  try {
    for (;;) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (!chunk || chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    if (quiet) clearTimeout(quiet);
    await reader.cancel().catch(() => undefined);
  }
  return parseFrames(buffer);
}

/** Runs the body against a freshly mounted endpoint, always tearing the server down. */
async function withEndpoint(body: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use("/api/events", eventsRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await body(`http://127.0.0.1:${port}`);
  } finally {
    // The SSE responses hold their sockets open; force them shut rather than
    // wait on a graceful close that never comes.
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

eventStreamService.start();

// events/specs/events-stream-endpoint.md — "every event is written as an `id:` line carrying the
// event's identity followed by a `data:` line carrying the JSON-encoded DaemonEvent"
test("writes every backlogged event as an id line carrying its identity plus its data line", async () => {
  const emitted = await feed([
    rawLine("create", "container-frame-a", "frame-a", "1786230000111000000"),
    rawLine("start", "container-frame-a", "frame-a", "1786230000222000000"),
  ]);

  await withEndpoint(async (baseUrl) => {
    const frames = await readCatchUp(baseUrl);
    const mine = frames.filter((frame) => frame.event.actor === "frame-a");
    assert.equal(mine.length, 2);
    for (const frame of mine) {
      assert.equal(frame.id, frame.event.id);
      assert.notEqual(frame.id, "");
    }
    assert.deepEqual(
      mine.map((frame) => frame.event.id),
      emitted.map((event) => event.id),
    );
  });
});

// events/specs/events-stream-endpoint.md — "`Last-Event-ID` ... the catch-up resumes just after the
// event named, so an event already delivered is not sent again"
test("resumes the catch-up just after the identity a reconnecting client reports", async () => {
  await feed([
    rawLine("create", "container-frame-b", "frame-b", "1786230001111000000"),
    rawLine("start", "container-frame-b", "frame-b", "1786230001222000000"),
    rawLine("stop", "container-frame-b", "frame-b", "1786230001333000000"),
  ]);

  await withEndpoint(async (baseUrl) => {
    const whole = await readCatchUp(baseUrl);
    assert.ok(whole.length >= 3);
    const alreadyHeld = whole[whole.length - 3]!;

    const resumed = await readCatchUp(baseUrl, { "Last-Event-ID": alreadyHeld.id });

    assert.deepEqual(
      resumed.map((frame) => frame.id),
      whole.slice(whole.length - 2).map((frame) => frame.id),
    );
  });
});

// events/specs/events-stream-endpoint.md — "an identity the backlog no longer holds → the whole backlog
// is sent, as on a first connect"
test("sends the whole backlog when the reported identity is one the backlog no longer holds", async () => {
  await feed([rawLine("destroy", "container-frame-c", "frame-c", "1786230002111000000")]);

  await withEndpoint(async (baseUrl) => {
    const whole = await readCatchUp(baseUrl);
    const resumed = await readCatchUp(baseUrl, { "Last-Event-ID": "an-identity-the-backlog-never-held" });

    assert.deepEqual(
      resumed.map((frame) => frame.id),
      whole.map((frame) => frame.id),
    );
  });
});

// events/specs/events-stream-endpoint.md — "an identity never breaks the frame: it is written on a
// single line"
test("keeps one event in one frame when its action carries a newline", async () => {
  const action = "exec_create: sh -c echo one\necho two";
  await feed([rawLine(action, "container-frame-d", "frame-d", "1786230003111000000")]);

  await withEndpoint(async (baseUrl) => {
    const frames = await readCatchUp(baseUrl);
    const mine = frames.filter((frame) => frame.event.actor === "frame-d");
    assert.equal(mine.length, 1);
    // Exactly two lines: the identity and the data. A third would mean the
    // identity spilled over and the browser would read a truncated frame.
    assert.deepEqual(mine[0]!.raw.split("\n").length, 2);
    assert.equal(mine[0]!.event.action, "exec_create: sh -c echo one\necho two");
    assert.equal(mine[0]!.id, mine[0]!.event.id);
  });
});
