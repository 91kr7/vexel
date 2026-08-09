import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eventsRouter } from "../../src/events/events-routes.js";
import { eventStreamService, type DaemonEvent } from "../../src/events/event-stream-service.js";
import { buildApp, createSleepingContainer, removeContainerQuietly, startApp } from "../support/fixtures.js";
import { ALPINE_IMAGE, ensureImages } from "../support/base-images.js";

// The acceptance of batch-event-feed-keys, against the daemon the application
// actually talks to: two events on one container inside one second reach the
// stream as two events, each with its own action and its own identity — and a
// client reconnecting is handed those same identities, not fresh ones.
//
// One test in this file on purpose: the daemon subscription's reconnect loop
// never idles, so the file has to end on `process.exit`, and a top-level `after`
// hook fires once the first test settles (Node 22).

// A pruned daemon is a starting state like any other: the base image this
// file's fixture is built on is ensured before the first test.
await ensureImages([ALPINE_IMAGE]);

interface Frame {
  id: string;
  event: DaemonEvent;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reads the SSE stream until it is cancelled, appending every complete frame to `frames`. */
async function pump(reader: ReadableStreamDefaultReader<Uint8Array>, frames: Frame[]): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let separator = buffer.indexOf("\n\n");
    while (separator !== -1) {
      const chunk = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      const idLine = chunk.split("\n").find((line) => line.startsWith("id: "));
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
      if (dataLine) {
        frames.push({
          id: idLine?.slice("id: ".length) ?? "",
          event: JSON.parse(dataLine.slice("data: ".length)) as DaemonEvent,
        });
      }
      separator = buffer.indexOf("\n\n");
    }
  }
}

async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) await delay(100);
}

/** The clock second an event fell in, which is all the daemon's `time` field can tell apart. */
function second(event: DaemonEvent): string {
  return event.timestamp.slice(0, 19);
}

// plan-docker_management_app/REQ-12, events/specs/event-stream-service.md — two events on one
// container inside one second are two events, each with its own action and identity, and the identity
// is minted once so every delivery of an event names it the same way
test("publishes two events of one container in one second as two distinct, stable identities", async () => {
  const app = buildApp("/api/events", eventsRouter);
  const running = await startApp(app);
  const created: string[] = [];
  const frames: Frame[] = [];
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  try {
    eventStreamService.start();
    await delay(500); // let the connect loop attach to the daemon's own /events stream

    const response = await fetch(`${running.url}/api/events/stream`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
    reader = response.body!.getReader();
    const pumping = pump(reader, frames).catch(() => undefined);

    const framesFor = (name: string): Frame[] => frames.filter((frame) => frame.event.actor === name);

    // `docker run` emits create and start milliseconds apart, so the pair lands
    // in one clock second nearly always — but a run that straddled a second
    // boundary would not exercise the collision at all, so it is retried rather
    // than asserted on. Each attempt is its own labelled fixture.
    let fixture: string | undefined;
    let pair: { create: Frame; start: Frame } | undefined;
    for (let attempt = 1; attempt <= 3 && pair === undefined; attempt += 1) {
      const { name } = await createSleepingContainer(`event-identity-${attempt}`);
      created.push(name);
      await waitUntil(() => framesFor(name).some((frame) => frame.event.action === "start"), 15_000);
      const mine = framesFor(name);
      const create = mine.find((frame) => frame.event.action === "create");
      const start = mine.find((frame) => frame.event.action === "start");
      if (create && start && second(create.event) === second(start.event)) {
        fixture = name;
        pair = { create, start };
      }
    }

    assert.ok(pair && fixture, "expected a create/start pair for one container inside a single clock second");
    assert.notEqual(pair.create.event.id, pair.start.event.id);
    // Each event keeps its own action; the identity is what a client keys its
    // rows on, so it is also what names the SSE frame.
    assert.equal(pair.create.event.action, "create");
    assert.equal(pair.start.event.action, "start");
    assert.equal(pair.create.id, pair.create.event.id);
    assert.equal(pair.start.id, pair.start.event.id);
    assert.doesNotMatch(pair.create.id, /[\r\n]/);

    // A second connection is handed the catch-up backlog: the same events, under
    // the same identities, which is what lets a reconnecting client recognise
    // them instead of holding one event twice.
    const liveIds = framesFor(fixture).map((frame) => frame.id);
    const catchUpFrames: Frame[] = [];
    const catchUp = await fetch(`${running.url}/api/events/stream`);
    const catchUpReader = catchUp.body!.getReader();
    try {
      await Promise.race([pump(catchUpReader, catchUpFrames).catch(() => undefined), delay(1_500)]);
    } finally {
      await catchUpReader.cancel().catch(() => undefined);
    }
    const replayedIds = catchUpFrames.filter((frame) => frame.event.actor === fixture).map((frame) => frame.id);

    // The backlog holds the 50 most recent events, so a busy daemon may have
    // rolled the oldest of ours out: what is replayed is a tail of what was
    // delivered live, named by the very same identities.
    assert.ok(replayedIds.length > 0, "expected the container's events to still be in the backlog");
    assert.deepEqual(replayedIds, liveIds.slice(liveIds.length - replayedIds.length));
    assert.equal(new Set(replayedIds).size, replayedIds.length);

    await reader.cancel().catch(() => undefined);
    reader = undefined;
    await pumping;
  } finally {
    await reader?.cancel().catch(() => undefined);
    for (const name of created) await removeContainerQuietly(name);
    await running.close();
  }
});

// events/specs/event-stream-service.md — the daemon subscription's reconnect loop is intentionally
// endless, so this process never goes idle on its own once start() has run; force it to exit once
// the test above has settled.
after(() => {
  process.exit(process.exitCode ?? 0);
});
