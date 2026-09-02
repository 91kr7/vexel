import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { openChannel, type ChannelSink } from "../../src/live-channel/held-value-publisher.js";
import { discardHeldValues, registerRefreshKind, reloadHeldValues, type RefreshKind } from "../../src/refresh-cache/refresh-cache.js";

// What the publisher turns a stored value into, and what keeps the server
// reading while a window holds a channel
// (live-channel/specs/held-value-publisher.md;
// plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-4,
// REQ-6, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16).
//
// No daemon and no HTTP: the kinds registered here read a local counter, so what
// is measured is the publisher's own behaviour and the demand it holds.

/** One open channel, recording everything it was written, in order. */
interface RecordedChannel {
  sink: ChannelSink;
  values: { name: string; value: unknown }[];
  written: string[];
}

function recordingChannel(): RecordedChannel {
  const recorded: RecordedChannel = {
    values: [],
    written: [],
    sink: {
      sendValue: (payload) => {
        recorded.written.push("value");
        recorded.values.push(JSON.parse(payload) as { name: string; value: unknown });
      },
      sendDiscarded: () => void recorded.written.push("discarded"),
      sendReloadEnded: () => void recorded.written.push("reloaded"),
    },
  };
  return recorded;
}

/**
 * Stores a value again. `read()` alone answers from what is held and reads
 * nothing, so a test that has to see a second store says the data changed and
 * waits for the read that notice causes.
 */
async function storeAgain<T>(declared: RefreshKind<T>): Promise<void> {
  declared.markChanged();
  await declared.read();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Everything a test opened or registered, closed and unregistered whatever the outcome. */
const openChannels: (() => void)[] = [];
const registered: RefreshKind<unknown>[] = [];

function channel(): RecordedChannel {
  const recorded = recordingChannel();
  openChannels.push(openChannel(recorded.sink));
  return recorded;
}

function kind<T>(key: string, read: () => Promise<T>, options: { periodMs?: number; demandExpiryMs?: number; announce?: (value: T) => unknown } = {}): RefreshKind<T> {
  const declared = registerRefreshKind<T>({
    key,
    read,
    periodMs: options.periodMs ?? 3_600_000,
    demandExpiryMs: options.demandExpiryMs,
    announce: options.announce,
  });
  registered.push(declared as RefreshKind<unknown>);
  return declared;
}

afterEach(() => {
  for (const close of openChannels.splice(0)) close();
  for (const declared of registered.splice(0)) declared.dispose();
  // Empties what the publisher remembers per value, so the next test opens a
  // channel that is written nothing it did not put there.
  discardHeldValues();
});

describe("what an opening channel is written", () => {
  // REQ-8 — "When the channel opens, the server sends the current value of every converted value".
  test("writes every value the server holds, naming which value each one is", async () => {
    const containers = kind("publisher-containers", async () => [{ id: "c1" }]);
    const images = kind("publisher-images", async () => ["alpine:3.20"]);
    await containers.read();
    await images.read();

    const opened = channel();

    assert.deepEqual(opened.values, [
      { name: "publisher-containers", value: [{ id: "c1" }] },
      { name: "publisher-images", value: ["alpine:3.20"] },
    ]);
  });

  // REQ-40 — "A channel that opens before the server holds anything ... No element is added for this case."
  test("writes nothing for a value not held yet, and writes it as soon as it is stored", async () => {
    const held = kind("publisher-not-held", async () => "arrived");

    const opened = channel();
    assert.deepEqual(opened.values, []);

    await held.read();

    assert.deepEqual(opened.values, [{ name: "publisher-not-held", value: "arrived" }]);
  });

  // The publisher's record is per channel: a channel that has been sent nothing is sent everything.
  test("writes the value again to a channel that opens after another already has it", async () => {
    const held = kind("publisher-second-channel", async () => "held");
    await held.read();
    const first = channel();

    const second = channel();

    assert.deepEqual(first.values, [{ name: "publisher-second-channel", value: "held" }]);
    assert.deepEqual(second.values, [{ name: "publisher-second-channel", value: "held" }]);
  });
});

describe("what a stored value produces", () => {
  // REQ-4 — "The server pushes a converted value only when that value has changed since the last
  // time it was pushed on that channel."
  test("writes nothing again for a value stored unchanged", async () => {
    const quiet = kind("publisher-quiet", async () => ({ state: "running" }));
    await quiet.read();
    const opened = channel();

    for (let stored = 0; stored < 5; stored += 1) await storeAgain(quiet);

    assert.deepEqual(opened.values, [{ name: "publisher-quiet", value: { state: "running" } }]);
  });

  test("writes the value again as soon as it differs", async () => {
    let state = "running";
    const busy = kind("publisher-busy", async () => ({ state }));
    await busy.read();
    const opened = channel();

    state = "exited";
    await storeAgain(busy);

    assert.deepEqual(opened.values, [
      { name: "publisher-busy", value: { state: "running" } },
      { name: "publisher-busy", value: { state: "exited" } },
    ]);
  });

  test("writes each stored value to every open channel", async () => {
    const shared = kind("publisher-shared", async () => "one");
    const first = channel();
    const second = channel();

    await shared.read();

    assert.deepEqual(first.values, [{ name: "publisher-shared", value: "one" }]);
    assert.deepEqual(second.values, [{ name: "publisher-shared", value: "one" }]);
  });

  // REQ-6 — "A value that changes often does not delay a value that changes rarely."
  test("writes a value the moment it is stored, whatever another value is doing", async () => {
    let tick = 0;
    const busy = kind("publisher-often", async () => ({ tick: (tick += 1) }));
    const rare = kind("publisher-rarely", async () => "unchanging");
    const opened = channel();

    await busy.read();
    await rare.read();
    await storeAgain(busy);
    await storeAgain(busy);

    // One message per value stored, in the order they were stored: the rare value
    // is neither delayed behind the busy one nor batched with it.
    assert.deepEqual(
      opened.values.map((message) => message.name),
      ["publisher-often", "publisher-rarely", "publisher-often", "publisher-often"],
    );
  });

  // refresh-cache.md — "`value` is the kind's own `announce` projection when it declared one".
  test("writes the projection a kind announces, not the value it holds", async () => {
    const projected = kind("publisher-announced", async () => ({ raw: ["a", "b"] }), { announce: (value) => value.raw.length });
    const opened = channel();

    await projected.read();

    assert.deepEqual(opened.values, [{ name: "publisher-announced", value: 2 }]);
  });
});

describe("what a discard and a reload produce", () => {
  // REQ-2 — "On a discard ... the publisher tells every open channel that the held values are gone."
  test("tells every open channel the held values are gone", async () => {
    const held = kind("publisher-discarded", async () => "first");
    await held.read();
    const first = channel();
    const second = channel();

    discardHeldValues();

    assert.deepEqual(first.written, ["value", "discarded"]);
    assert.deepEqual(second.written, ["value", "discarded"]);
  });

  // The record is emptied with the values, so the same value reaches a channel that was sent it
  // before the switch.
  test("writes a value the channel already had once the held values have been discarded", async () => {
    const held = kind("publisher-same-after-discard", async () => "same");
    await held.read();
    const opened = channel();

    discardHeldValues();
    await held.read();

    assert.deepEqual(opened.written, ["value", "discarded", "value"]);
    assert.deepEqual(
      opened.values.map((message) => message.value),
      ["same", "same"],
    );
  });

  // "The message for the end of a reload is written after the values that reload changed."
  test("writes the end of a reload after the values it changed", async () => {
    let reading = "before";
    const reloaded = kind("publisher-reloaded", async () => reading);
    await reloaded.read();
    const opened = channel();

    reading = "after";
    await reloadHeldValues();

    assert.deepEqual(opened.written, ["value", "value", "reloaded"]);
    assert.equal(opened.values.at(-1)!.value, "after");
  });
});

describe("the demand an open channel holds", () => {
  /** Short enough that a test can watch several periods pass, and its own expiry with them. */
  const PERIOD_MS = 25;
  const EXPIRY_MS = 40;

  // REQ-14 — "With no channel open, the server reads the daemon for none of the converted values."
  test("reads nothing while no channel is open", async () => {
    let reads = 0;
    kind("publisher-unwatched", async () => (reads += 1), { periodMs: PERIOD_MS, demandExpiryMs: EXPIRY_MS });

    await delay(PERIOD_MS * 8);

    assert.equal(reads, 0);
  });

  // REQ-13 — "While a window holds a channel, no converted value's refresh expires."
  test("keeps every registered kind read while a channel is open, with nobody asking for it", async () => {
    let reads = 0;
    const watched = kind("publisher-watched", async () => (reads += 1), { periodMs: PERIOD_MS, demandExpiryMs: EXPIRY_MS });

    channel();
    await delay(PERIOD_MS * 10);

    // Well past the expiry window, and with no `read()` of anyone's in it.
    assert.ok(reads >= 5, `expected the kind to keep being read while a channel was open, got ${reads} reads`);
    assert.equal(watched.isRefreshing(), true);
  });

  // REQ-16 — "One reading serves every open channel."
  test("takes one set of holds however many channels are open", async () => {
    let reads = 0;
    kind("publisher-one-hold", async () => (reads += 1), { periodMs: 3_600_000 });

    channel();
    await delay(20);
    const afterFirstChannel = reads;
    channel();
    channel();
    await delay(20);

    assert.equal(afterFirstChannel, 1);
    assert.equal(reads, afterFirstChannel, "opening more channels read Docker again");
  });

  // REQ-15 — "Closing the window closes the channel and releases its interest."
  test("stops reading once the last channel has closed, and not before", async () => {
    let reads = 0;
    const watched = kind("publisher-released", async () => (reads += 1), { periodMs: PERIOD_MS, demandExpiryMs: EXPIRY_MS });
    const closeFirst = openChannel(recordingChannel().sink);
    const closeSecond = openChannel(recordingChannel().sink);

    closeFirst();
    await delay(PERIOD_MS * 6);
    const stillRead = reads;
    assert.ok(stillRead >= 3, `expected the kind to keep being read while one channel was open, got ${stillRead} reads`);

    closeSecond();
    await delay(EXPIRY_MS + PERIOD_MS * 6);
    const afterLastClosed = reads;
    await delay(PERIOD_MS * 6);

    assert.equal(watched.isRefreshing(), false);
    assert.equal(reads, afterLastClosed, "the server kept reading with no channel open");
  });

  // "the returned function releases the channel; calling it twice releases once"
  test("releases once when a channel is closed twice", async () => {
    let reads = 0;
    const watched = kind("publisher-closed-twice", async () => (reads += 1), { periodMs: PERIOD_MS, demandExpiryMs: EXPIRY_MS });
    const closeFirst = openChannel(recordingChannel().sink);
    const closeSecond = openChannel(recordingChannel().sink);

    closeFirst();
    closeFirst();
    await delay(PERIOD_MS * 6);

    assert.equal(watched.isRefreshing(), true);
    assert.ok(reads >= 3, `the second channel's hold was released by closing the first one twice, got ${reads} reads`);
    closeSecond();
  });

  // A channel that is closed is written nothing more.
  test("writes nothing to a channel that has been closed", async () => {
    const held = kind("publisher-closed-channel", async () => "one");
    const closed = recordingChannel();
    const close = openChannel(closed.sink);
    const open = channel();

    close();
    await held.read();

    assert.deepEqual(closed.values, []);
    assert.deepEqual(open.values, [{ name: "publisher-closed-channel", value: "one" }]);
  });
});
