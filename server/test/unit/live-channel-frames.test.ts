import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import express from "express";
import type { AddressInfo } from "node:net";
import type { DaemonEvent } from "../../src/events/event-stream-service.js";

// The frames GET /api/live writes — the daemon events with their identity and
// their resumption, and the values the server holds, each naming what it carries
// (live-channel/specs/live-channel-endpoint.md). The daemon stream is mocked, so
// the backlog holds exactly the events fed here and a resume can be checked
// against a known sequence; the values come from kinds this file registers, so
// nothing here reaches Docker.

const daemonStream = new PassThrough();

mock.module(new URL("../../src/docker/engine-client.ts", import.meta.url).href, {
  namedExports: {
    getEngineClient: () => ({ requestStream: async () => daemonStream }),
  },
});

const { eventStreamService } = await import("../../src/events/event-stream-service.js");
const { liveChannelRouter } = await import("../../src/live-channel/live-channel-routes.js");
const { discardHeldValues, registerRefreshKind, reloadHeldValues } = await import("../../src/refresh-cache/refresh-cache.js");

interface Frame {
  /** The whole frame as written, so a test can tell how many lines it spans. */
  raw: string;
  /** The `event:` line, which is how a client knows what the frame carries. */
  name: string;
  id?: string;
  data: string;
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
      const lines = raw.split("\n");
      const nameLine = lines.find((line) => line.startsWith("event: "));
      const idLine = lines.find((line) => line.startsWith("id: "));
      const dataLine = lines.find((line) => line.startsWith("data: "));
      assert.ok(nameLine, `frame without an event line: ${JSON.stringify(raw)}`);
      assert.ok(dataLine, `frame without a data line: ${JSON.stringify(raw)}`);
      return {
        raw,
        name: nameLine.slice("event: ".length),
        id: idLine?.slice("id: ".length),
        data: dataLine.slice("data: ".length),
      };
    });
}

function daemonEventFrames(frames: Frame[]): { raw: string; id?: string; event: DaemonEvent }[] {
  return frames
    .filter((frame) => frame.name === "daemon-event")
    .map((frame) => ({ raw: frame.raw, id: frame.id, event: JSON.parse(frame.data) as DaemonEvent }));
}

function valueFrames(frames: Frame[]): { id?: string; name: string; value: unknown }[] {
  return frames.filter((frame) => frame.name === "value").map((frame) => ({ id: frame.id, ...(JSON.parse(frame.data) as { name: string; value: unknown }) }));
}

/**
 * Opens the channel, collects whatever it writes, then hangs up. The connection
 * stays open by design, so the read is bounded by a short quiet period rather
 * than by end-of-stream. `while` runs after the connection is established, for a
 * test that has to make something happen on an open channel.
 */
async function readChannel(baseUrl: string, options: { headers?: Record<string, string>; while?: () => Promise<void> } = {}): Promise<Frame[]> {
  const response = await fetch(`${baseUrl}/api/live`, { headers: options.headers ?? {} });
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
    if (options.while) await options.while();
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
  app.use("/api/live", liveChannelRouter);
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

// live-channel-endpoint.md — "one normalized daemon event, JSON-encoded in `data`, preceded by an
// `id:` line carrying the event's identity"
test("writes every backlogged daemon event as an id line carrying its identity plus its data line", async () => {
  const emitted = await feed([
    rawLine("create", "container-frame-a", "frame-a", "1786230000111000000"),
    rawLine("start", "container-frame-a", "frame-a", "1786230000222000000"),
  ]);

  await withEndpoint(async (baseUrl) => {
    const mine = daemonEventFrames(await readChannel(baseUrl)).filter((frame) => frame.event.actor === "frame-a");
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

// live-channel-endpoint.md — "`Last-Event-ID` ... the daemon-event catch-up resumes just after the
// event named"
test("resumes the catch-up just after the identity a reconnecting client reports", async () => {
  await feed([
    rawLine("create", "container-frame-b", "frame-b", "1786230001111000000"),
    rawLine("start", "container-frame-b", "frame-b", "1786230001222000000"),
    rawLine("stop", "container-frame-b", "frame-b", "1786230001333000000"),
  ]);

  await withEndpoint(async (baseUrl) => {
    const whole = daemonEventFrames(await readChannel(baseUrl));
    assert.ok(whole.length >= 3);
    const alreadyHeld = whole[whole.length - 3]!;

    const resumed = daemonEventFrames(await readChannel(baseUrl, { headers: { "Last-Event-ID": alreadyHeld.id ?? "" } }));

    assert.deepEqual(
      resumed.map((frame) => frame.id),
      whole.slice(whole.length - 2).map((frame) => frame.id),
    );
  });
});

// live-channel-endpoint.md — "an identity the backlog no longer holds → the whole backlog, as on a
// first connect"
test("sends the whole backlog when the reported identity is one the backlog no longer holds", async () => {
  await feed([rawLine("destroy", "container-frame-c", "frame-c", "1786230002111000000")]);

  await withEndpoint(async (baseUrl) => {
    const whole = daemonEventFrames(await readChannel(baseUrl));
    const resumed = daemonEventFrames(await readChannel(baseUrl, { headers: { "Last-Event-ID": "an-identity-the-backlog-never-held" } }));

    assert.deepEqual(
      resumed.map((frame) => frame.id),
      whole.map((frame) => frame.id),
    );
  });
});

// live-channel-endpoint.md — "an identity never breaks the frame: it is written on a single line"
test("keeps one daemon event in one frame when its action carries a newline", async () => {
  const action = "exec_create: sh -c echo one\necho two";
  await feed([rawLine(action, "container-frame-d", "frame-d", "1786230003111000000")]);

  await withEndpoint(async (baseUrl) => {
    const mine = daemonEventFrames(await readChannel(baseUrl)).filter((frame) => frame.event.actor === "frame-d");
    assert.equal(mine.length, 1);
    // Exactly three lines: the identity, the event name and the data. A fourth
    // would mean the identity spilled over and the browser would read a
    // truncated frame.
    assert.equal(mine[0]!.raw.split("\n").length, 3);
    assert.equal(mine[0]!.event.action, "exec_create: sh -c echo one\necho two");
    assert.equal(mine[0]!.id, mine[0]!.event.id);
  });
});

// live-channel-endpoint.md — "`event: value` → one value the server holds; `data` is
// `{"name": <which value>, "value": <the value>}`" (REQ-3, REQ-8, REQ-32)
test("writes every value the server holds on connect, each naming which value it is", async () => {
  discardHeldValues();
  const one = registerRefreshKind({ key: "frames-one", periodMs: 60_000, read: async () => ({ tally: 1 }) });
  const two = registerRefreshKind({ key: "frames-two", periodMs: 60_000, read: async () => ["a", "b"] });
  try {
    await one.read();
    await two.read();

    await withEndpoint(async (baseUrl) => {
      const values = valueFrames(await readChannel(baseUrl));

      assert.deepEqual(
        values.filter((frame) => frame.name.startsWith("frames-")),
        [
          { id: undefined, name: "frames-one", value: { tally: 1 } },
          { id: undefined, name: "frames-two", value: ["a", "b"] },
        ],
      );
    });
  } finally {
    one.dispose();
    two.dispose();
    discardHeldValues();
  }
});

// live-channel-endpoint.md — "Only a daemon event carries an `id:` line ... value traffic never
// moves the resumption point" (REQ-26)
test("writes no identity on a value frame, so value traffic never moves the resumption point", async () => {
  discardHeldValues();
  const kind = registerRefreshKind({ key: "frames-no-id", periodMs: 60_000, read: async () => "held" });
  try {
    await feed([rawLine("create", "container-frame-e", "frame-e", "1786230004111000000")]);
    await kind.read();

    await withEndpoint(async (baseUrl) => {
      const frames = await readChannel(baseUrl);
      const values = valueFrames(frames).filter((frame) => frame.name === "frames-no-id");
      assert.equal(values.length, 1);
      assert.equal(values[0]!.id, undefined);

      const whole = daemonEventFrames(frames);
      const last = whole[whole.length - 1]!;
      const resumed = daemonEventFrames(await readChannel(baseUrl, { headers: { "Last-Event-ID": last.id ?? "" } }));

      assert.deepEqual(resumed, []);
    });
  } finally {
    kind.dispose();
    discardHeldValues();
  }
});

// live-channel-endpoint.md — "A channel that opens before the server holds anything is written no
// value message, and is written each one as it arrives" (REQ-40)
test("writes no value message on a channel opened before the server holds anything", async () => {
  discardHeldValues();

  await withEndpoint(async (baseUrl) => {
    const frames = await readChannel(baseUrl);

    assert.deepEqual(valueFrames(frames), []);
  });
});

// live-channel-endpoint.md — "`event: discarded` → the values held are gone ... What follows are the
// new context's values as they arrive" (REQ-2)
test("writes a discarded frame when the values held are dropped, then the values that arrive after it", async () => {
  discardHeldValues();
  let reading = "first-context";
  const kind = registerRefreshKind({ key: "frames-discard", periodMs: 60_000, read: async () => reading });
  try {
    await kind.read();

    await withEndpoint(async (baseUrl) => {
      const frames = await readChannel(baseUrl, {
        while: async () => {
          reading = "second-context";
          discardHeldValues();
          await kind.read();
        },
      });

      const written = frames.filter((frame) => frame.name === "discarded" || (frame.name === "value" && frame.data.includes("frames-discard")));
      assert.deepEqual(
        written.map((frame) => frame.name),
        ["value", "discarded", "value"],
      );
      assert.deepEqual(valueFrames(frames).filter((frame) => frame.name === "frames-discard").map((frame) => frame.value), [
        "first-context",
        "second-context",
      ]);
    });
  } finally {
    kind.dispose();
    discardHeldValues();
  }
});

// live-channel-endpoint.md — "`event: reloaded` → a manual reload has ended; the values it changed
// were written before it"
test("writes the reloaded frame after the values that reload changed", async () => {
  discardHeldValues();
  let reading = "before";
  const kind = registerRefreshKind({ key: "frames-reload", periodMs: 60_000, read: async () => reading });
  try {
    await kind.read();

    await withEndpoint(async (baseUrl) => {
      const frames = await readChannel(baseUrl, {
        while: async () => {
          reading = "after";
          await reloadHeldValues();
        },
      });

      const written = frames.filter((frame) => frame.name === "reloaded" || (frame.name === "value" && frame.data.includes("frames-reload")));
      assert.deepEqual(
        written.map((frame) => frame.name),
        ["value", "value", "reloaded"],
      );
      assert.equal(valueFrames(frames).filter((frame) => frame.name === "frames-reload").at(-1)!.value, "after");
    });
  } finally {
    kind.dispose();
    discardHeldValues();
  }
});
