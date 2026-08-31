import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  discardHeldValues,
  registerRefreshKind,
  type RefreshKind,
} from "../../src/refresh-cache/refresh-cache.js";
import {
  AGE_HEADER,
  READ_AT_HEADER,
  STALE_HEADER,
  sendHeld,
} from "../../src/refresh-cache/refresh-cache-response.js";
import { eventStreamService, type DaemonEvent } from "../../src/events/event-stream-service.js";
import { setActiveEndpoint } from "../../src/docker/endpoint.js";

// The refresh cache is process-wide state (refresh-cache/specs/refresh-cache.md),
// so every kind a test registers is disposed of before the next one runs and each
// key is unique to its own test.
const registered: RefreshKind<unknown>[] = [];

function kindOf<T>(options: Parameters<typeof registerRefreshKind<T>>[0]): RefreshKind<T> {
  const kind = registerRefreshKind<T>(options);
  registered.push(kind as RefreshKind<unknown>);
  return kind;
}

afterEach(() => {
  while (registered.length > 0) registered.pop()?.dispose();
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function daemonEvent(type: string, action: string): DaemonEvent {
  return { id: `${type}-${action}-${Math.random()}`, timestamp: new Date().toISOString(), type, action };
}

/** A read whose completion the test decides, so a read can be held in flight. */
function heldRead<T>(): { read: () => Promise<T>; settle: (value: T) => void; fail: (message: string) => void; started: () => number } {
  let starts = 0;
  let resolveCurrent: ((value: T) => void) | undefined;
  let rejectCurrent: ((failure: Error) => void) | undefined;
  return {
    read: () => {
      starts += 1;
      return new Promise<T>((resolve, reject) => {
        resolveCurrent = resolve;
        rejectCurrent = reject;
      });
    },
    settle: (value) => resolveCurrent?.(value),
    fail: (message) => rejectCurrent?.(new Error(message)),
    started: () => starts,
  };
}

// REQ-9, REQ-10 — a held value is served without calling the daemon again.
test("a second ask is answered from the held value, with no further read", async () => {
  let reads = 0;
  const kind = kindOf<string>({
    key: "check-serves-held",
    read: async () => {
      reads += 1;
      return `value-${reads}`;
    },
    periodMs: 60_000,
  });

  const first = await kind.read();
  assert.equal(reads, 1);
  assert.equal(first.value, "value-1");
  assert.equal(first.stale, false);

  await wait(20);
  const second = await kind.read();
  assert.equal(reads, 1, "the second ask read again instead of serving what was held");
  assert.equal(second.value, "value-1");
  assert.equal(second.readAt, first.readAt, "the held value's read time moved without a read");
  assert.ok(second.ageMs >= 20, `the age of the held value is ${second.ageMs} ms after 20 ms`);
});

// REQ-17 — two clients asking for the same list cost the daemon what one costs.
test("two callers arriving before anything is held share one read", async () => {
  let reads = 0;
  const kind = kindOf<string>({
    key: "check-two-callers",
    read: async () => {
      reads += 1;
      await wait(30);
      return "listed";
    },
    periodMs: 60_000,
  });

  const [a, b] = await Promise.all([kind.read(), kind.read()]);
  assert.equal(reads, 1, "the second caller started a read of its own");
  assert.equal(a.value, "listed");
  assert.equal(b.value, "listed");
  assert.equal(a.readAt, b.readAt);
});

// REQ-10 — a read in flight never delays an answer.
test("an answer is served at once while a read is still in flight", async () => {
  const pending = heldRead<string>();
  let firstDone = false;
  const kind = kindOf<string>({
    key: "check-read-in-flight",
    read: async () => {
      if (!firstDone) {
        firstDone = true;
        return "first";
      }
      return await pending.read();
    },
    periodMs: 30,
  });

  const first = await kind.read();
  assert.equal(first.value, "first");

  // Let the refresher's own read start and leave it hanging.
  await wait(80);
  assert.ok(pending.started() >= 1, "the refresher never read again on its period");

  const startedAt = Date.now();
  const served = await kind.read();
  const waited = Date.now() - startedAt;
  assert.equal(served.value, "first", "the answer waited for the read in flight instead of serving what was held");
  assert.ok(waited < 100, `the answer took ${waited} ms while a read was in flight`);

  pending.settle("second");
  await wait(20);
});

// REQ-10, REQ-15 — a read that fails never turns an answer into an error.
test("a failed read keeps the previous value and reports how old it is", async () => {
  let reads = 0;
  const kind = kindOf<string>({
    key: "check-failed-read",
    read: async () => {
      reads += 1;
      if (reads === 1) return "good";
      throw new Error("daemon unreachable");
    },
    periodMs: 30,
  });

  const first = await kind.read();
  assert.equal(first.value, "good");
  assert.equal(first.stale, false);

  await wait(150);
  assert.ok(reads > 1, "the refresher never attempted a second read");

  const held = await kind.read();
  assert.equal(held.value, "good", "a failed read replaced the value that was held");
  assert.equal(held.stale, true, "a value served after a failed read is not reported as stale");
  assert.equal(held.error, "daemon unreachable");
  assert.equal(held.readAt, first.readAt, "the read time moved although no read succeeded");
  assert.ok(held.ageMs >= 150, `the age reported is ${held.ageMs} ms after 150 ms`);
});

// refresh-cache.md — a read failing when nothing was ever held rethrows, so the
// caller maps a daemon error the way it does today.
test("a read that fails with nothing ever held fails the answer", async () => {
  const kind = kindOf<string>({
    key: "check-failed-first-read",
    read: async () => {
      throw new Error("no daemon at all");
    },
    periodMs: 60_000,
  });

  await assert.rejects(kind.read(), /no daemon at all/);
});

// REQ-12 — events that arrive together produce one read, not one per event.
test("a burst of events starts one read at once and never one read per event", async () => {
  let reads = 0;
  const kind = kindOf<string>({
    key: "check-event-burst",
    read: async () => {
      reads += 1;
      return `read-${reads}`;
    },
    periodMs: 60_000,
    eventTypes: ["container"],
    groupingWindowMs: 200,
  });

  await kind.read();
  assert.equal(reads, 1);
  // A whole window clear of the first read: the budget is one read started per
  // window, and the read that filled the kind has just spent this one.
  await wait(250);

  for (let n = 0; n < 5; n += 1) eventStreamService.emit("event", daemonEvent("container", "die"));

  // The first read of a burst starts immediately: an event is how something done
  // outside the application reaches the interface.
  await wait(20);
  assert.equal(reads, 2, `five events in one burst started ${reads - 1} reads at once instead of one`);

  // At most one further read when the window closes, however many events landed.
  await wait(500);
  assert.ok(reads <= 3, `five events in one burst produced ${reads - 1} reads in total`);
});

// REQ-12 — a kind is marked due by the event types it declared, and by no other.
test("an event of a type the kind did not declare starts no read", async () => {
  let reads = 0;
  const kind = kindOf<string>({
    key: "check-event-type-scoped",
    read: async () => {
      reads += 1;
      return "listed";
    },
    periodMs: 60_000,
    eventTypes: ["container"],
    groupingWindowMs: 50,
  });

  await kind.read();
  assert.equal(reads, 1);

  await wait(100);
  eventStreamService.emit("event", daemonEvent("image", "pull"));
  await wait(150);
  assert.equal(reads, 1, "an event of another type made the kind read again");

  // The declared type, on the same kind: what proves the check above is not
  // passing because no event reaches the cache at all.
  eventStreamService.emit("event", daemonEvent("container", "start"));
  await wait(150);
  assert.equal(reads, 2, "an event of the declared type did not make the kind read again");
});

// REQ-13 — an operation the application performs marks the value due, and the
// next answer covers the change without waiting for the timer.
test("marking a kind changed makes the next answer cover the change", async () => {
  let source = "before";
  let reads = 0;
  const kind = kindOf<string>({
    key: "check-mark-changed",
    read: async () => {
      reads += 1;
      return source;
    },
    periodMs: 60_000,
  });

  const first = await kind.read();
  assert.equal(first.value, "before");

  source = "after";
  kind.markChanged();

  const next = await kind.read();
  assert.equal(next.value, "after", "the answer after the application's own operation still described the old state");
  assert.ok(next.readAt >= first.readAt);
  assert.equal(reads, 2, `the change cost ${reads - 1} reads`);
});

// refresh-cache.md — marking changed does nothing while nobody is asking.
test("marking a kind changed while nobody asks for it reads nothing", async () => {
  let reads = 0;
  const kind = kindOf<string>({
    key: "check-mark-changed-undemanded",
    read: async () => {
      reads += 1;
      return "listed";
    },
    periodMs: 60_000,
  });

  kind.markChanged();
  await wait(100);
  assert.equal(reads, 0, "a kind nobody asks for was read because the application marked it changed");
  assert.equal(kind.peek(), undefined);
});

// REQ-14 — a value nobody asks for stops being refreshed, and the next ask starts it again.
test("demand expiring stops the refresher, and asking again restarts it", async () => {
  let reads = 0;
  const kind = kindOf<string>({
    key: "check-demand-gate",
    read: async () => {
      reads += 1;
      return "listed";
    },
    periodMs: 25,
    demandExpiryMs: 100,
  });

  await kind.read();
  assert.equal(kind.isRefreshing(), true, "asking for a kind started no refresher");

  await wait(400);
  assert.equal(kind.isRefreshing(), false, "the refresher is still running although nobody asked within the expiry window");
  assert.equal(kind.peek(), undefined, "a value of unknown age survived the expiry of its demand");

  const whenIdle = reads;
  await wait(150);
  assert.equal(reads, whenIdle, "the daemon was called while no client was asking");

  const restarted = await kind.read();
  assert.equal(restarted.value, "listed");
  assert.equal(kind.isRefreshing(), true, "asking again did not restart the refresher");
  assert.ok(reads > whenIdle);
});

// REQ-11 — one refresher per kind: a blocked read delays its own kind and no other.
test("a kind whose read never returns leaves the others answering", async () => {
  const blocked = heldRead<string>();
  const slow = kindOf<string>({ key: "check-blocked-kind", read: blocked.read, periodMs: 60_000 });
  const fast = kindOf<string>({ key: "check-unblocked-kind", read: async () => "networks", periodMs: 60_000 });

  const pendingAnswer = slow.read();
  const startedAt = Date.now();
  const served = await fast.read();
  const waited = Date.now() - startedAt;

  assert.equal(served.value, "networks");
  assert.ok(waited < 200, `the other kind's answer took ${waited} ms behind a blocked read`);
  assert.equal(slow.peek(), undefined);

  blocked.settle("volumes");
  await pendingAnswer;
});

// REQ-16 — a change of active context discards every held value.
test("a change of the active endpoint discards what every kind held", async () => {
  const originalDockerHost = process.env.DOCKER_HOST;
  delete process.env.DOCKER_HOST;
  const containers = kindOf<string>({ key: "check-discard-containers", read: async () => "containers", periodMs: 60_000 });
  const volumes = kindOf<string>({ key: "check-discard-volumes", read: async () => "volumes", periodMs: 60_000 });
  try {
    await containers.read();
    await volumes.read();
    assert.notEqual(containers.peek(), undefined);
    assert.notEqual(volumes.peek(), undefined);

    setActiveEndpoint({ kind: "tcp", host: "127.0.0.1", port: 2375 });

    assert.equal(containers.peek(), undefined, "a value read from the previous daemon is still held");
    assert.equal(volumes.peek(), undefined, "a value read from the previous daemon is still held");
  } finally {
    setActiveEndpoint(undefined);
    if (originalDockerHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = originalDockerHost;
  }
});

// REQ-16 — a read still running when the discard happens no longer stores its result.
test("a read that lands after a discard is thrown away", async () => {
  const pending = heldRead<string>();
  let firstDone = false;
  const kind = kindOf<string>({
    key: "check-discard-in-flight",
    read: async () => {
      if (!firstDone) {
        firstDone = true;
        return "previous-daemon";
      }
      return await pending.read();
    },
    periodMs: 30,
  });

  await kind.read();
  await wait(80);
  assert.ok(pending.started() >= 1, "the refresher never started the read this case needs in flight");

  discardHeldValues();
  pending.settle("previous-daemon-late");
  await wait(50);

  assert.equal(kind.peek(), undefined, "a value read from the daemon left behind was stored after the discard");
});

// REQ-55 — "The derived lists end up describing the containers the server holds whatever the order
// in which the lists affected by one event are read again". Here the derived kind's own read starts
// **before** the source stores anything and is still in flight when it does: the order the fan-out
// produces, and the one an implementation that merely made the derived reader await the read in
// flight does not cover, since what it would await had not started.
test("a derived kind whose read started before the replacement is read again after it", async () => {
  const sourceKey = "check-derivation-in-flight-source";
  let sourceValue = "one";
  let derivedReads = 0;
  let holdTheNextDerivedRead = false;
  let releaseTheDerivedRead: (() => void) | undefined;

  const source = kindOf<string>({
    key: sourceKey,
    read: async () => sourceValue,
    periodMs: 60_000,
    differs: (previous, next) => previous !== next,
  });
  const derived = kindOf<string>({
    key: "check-derivation-in-flight-derived",
    derivedFrom: sourceKey,
    // What a derived read takes from the source, it takes when it starts, and
    // then does work of its own: the shape of a list built on a value replaced
    // while that list was being built.
    read: async () => {
      derivedReads += 1;
      const seen = sourceValue;
      if (holdTheNextDerivedRead) {
        holdTheNextDerivedRead = false;
        await new Promise<void>((resolve) => {
          releaseTheDerivedRead = resolve;
        });
      }
      return seen;
    },
    periodMs: 60_000,
    eventTypes: ["check-derivation-in-flight"],
    groupingWindowMs: 20,
  });

  await source.read();
  await derived.read();
  assert.equal(derivedReads, 1);
  await wait(40);

  holdTheNextDerivedRead = true;
  eventStreamService.emit("event", daemonEvent("check-derivation-in-flight", "changed"));
  await wait(20);
  assert.equal(derivedReads, 2, "the derived kind's own read never started, so nothing is in flight in this case");

  sourceValue = "two";
  source.markChanged();
  await source.read();
  assert.equal(source.peek()?.value, "two", "the source never stored the replacement this case is about");

  // The read that started before the replacement now ends, holding what it saw.
  releaseTheDerivedRead?.();
  await wait(150);

  assert.equal(derivedReads, 3, `the derived kind was read ${derivedReads} times: it was never told the value it built on had been replaced`);
  assert.equal(
    (await derived.read()).value,
    "two",
    "the derived kind still holds what it built on the value that was replaced",
  );
});

// REQ-55 — "…and whatever delay a grouping window puts on the container listing's own re-read."
// The source's re-read is postponed by its own window, so at the instant the event arrives there is
// no read in flight for anyone to await: an implementation resting on that instant leaves this red,
// and so does one that serialises the fan-out.
test("a source read postponed by its own grouping window tells whoever derives from it just the same", async () => {
  const sourceKey = "check-derivation-postponed-source";
  let sourceValue = "one";
  let sourceReads = 0;

  const source = kindOf<string>({
    key: sourceKey,
    read: async () => {
      sourceReads += 1;
      return sourceValue;
    },
    periodMs: 60_000,
    eventTypes: ["check-derivation-postponed"],
    groupingWindowMs: 120,
    differs: (previous, next) => previous !== next,
  });
  const derived = kindOf<string>({
    key: "check-derivation-postponed-derived",
    derivedFrom: sourceKey,
    read: async () => sourceValue,
    periodMs: 60_000,
    groupingWindowMs: 20,
  });

  await derived.read();
  await source.read();
  assert.equal(sourceReads, 1);

  sourceValue = "two";
  // Inside the source's own window, so the read it asks for is scheduled rather
  // than started.
  eventStreamService.emit("event", daemonEvent("check-derivation-postponed", "changed"));
  await wait(20);
  assert.equal(sourceReads, 1, "the source read at once, so this case never arranges the postponement it is about");

  await wait(300);
  assert.equal(sourceReads, 2, "the postponed read never happened, so nothing was stored to tell anybody about");
  assert.equal(
    (await derived.read()).value,
    "two",
    "a source whose re-read was postponed by its grouping window told nobody it had changed",
  );
});

// REQ-53 — the other half of the notification, and the one that keeps it from costing more than
// the defect: refresh-cache.md, "a value found no different tells nobody". The source is read again
// and stores what it already held, so nothing derived from it is read.
test("a value found no different tells whoever derives from it nothing", async () => {
  const sourceKey = "check-derivation-unchanged-source";
  let derivedReads = 0;

  const source = kindOf<string>({
    key: sourceKey,
    read: async () => "one",
    periodMs: 60_000,
    differs: (previous, next) => previous !== next,
  });
  const derived = kindOf<string>({
    key: "check-derivation-unchanged-derived",
    derivedFrom: sourceKey,
    read: async () => {
      derivedReads += 1;
      return "derived";
    },
    periodMs: 60_000,
    groupingWindowMs: 20,
  });

  await derived.read();
  await source.read();
  assert.equal(derivedReads, 1);

  source.markChanged();
  await source.read();
  await wait(60);

  assert.equal(derivedReads, 1, `the derived kind was read ${derivedReads} times: a value no different told it it had changed`);
});

// REQ-53 — refresh-cache.md, "a first value tells nobody … and that includes the first value after
// a discard": with nothing held before it there is no earlier copy anyone can have derived from.
// The comparison here calls everything different, so what is under check is the absence of a
// previous value and not the comparison's verdict.
test("a kind storing its first value tells whoever derives from it nothing", async () => {
  const sourceKey = "check-derivation-first-value-source";
  let sourceValue = "one";
  let derivedReads = 0;

  const source = kindOf<string>({
    key: sourceKey,
    read: async () => sourceValue,
    periodMs: 60_000,
    differs: () => true,
  });
  const derived = kindOf<string>({
    key: "check-derivation-first-value-derived",
    derivedFrom: sourceKey,
    read: async () => {
      derivedReads += 1;
      return "derived";
    },
    periodMs: 60_000,
    groupingWindowMs: 20,
  });

  await derived.read();
  assert.equal(derivedReads, 1);

  await source.read();
  await wait(60);
  assert.equal(derivedReads, 1, "the first value the source ever held was announced as a replacement");

  // A discard leaves the same state: what the kinds held is gone, so the value
  // read next is again a first one.
  discardHeldValues();
  sourceValue = "two";
  await source.read();
  await wait(60);

  assert.equal(derivedReads, 1, `the derived kind was read ${derivedReads} times: the first value after a discard was announced as a replacement`);
});

// REQ-53 — refresh-cache.md, "the cache compares nothing it was not given a comparison for":
// without `differs` a kind never notifies, whoever declares themselves derived from it. What
// "different" means belongs to the kind whose value it is.
test("a kind that declares no comparison notifies nobody, however different its values", async () => {
  const sourceKey = "check-derivation-no-comparison-source";
  let sourceValue = "one";
  let derivedReads = 0;

  const source = kindOf<string>({
    key: sourceKey,
    read: async () => sourceValue,
    periodMs: 60_000,
  });
  const derived = kindOf<string>({
    key: "check-derivation-no-comparison-derived",
    derivedFrom: sourceKey,
    read: async () => {
      derivedReads += 1;
      return "derived";
    },
    periodMs: 60_000,
    groupingWindowMs: 20,
  });

  await derived.read();
  await source.read();
  assert.equal(derivedReads, 1);

  sourceValue = "two";
  source.markChanged();
  await source.read();
  await wait(60);

  assert.equal(sourceValue, source.peek()?.value, "the source never stored the different value this case is about");
  assert.equal(derivedReads, 1, `the derived kind was read ${derivedReads} times by a source that declares no comparison`);
});

// REQ-54 — refresh-cache.md: the derived re-read goes through the ordinary path, so the demand gate
// applies to it. A derived kind nobody is asking for holds nothing and is not read, whatever the
// source stores: the notification never revives a kind the interface stopped needing.
test("a replacement reads no derived kind nobody is asking for", async () => {
  const sourceKey = "check-derivation-undemanded-source";
  let sourceValue = "one";
  let derivedReads = 0;

  const source = kindOf<string>({
    key: sourceKey,
    read: async () => sourceValue,
    periodMs: 60_000,
    differs: (previous, next) => previous !== next,
  });
  const derived = kindOf<string>({
    key: "check-derivation-undemanded-derived",
    derivedFrom: sourceKey,
    read: async () => {
      derivedReads += 1;
      return "derived";
    },
    periodMs: 60_000,
    groupingWindowMs: 20,
  });

  await source.read();
  sourceValue = "two";
  source.markChanged();
  await source.read();
  await wait(60);

  assert.equal(derivedReads, 0, `a kind nobody asked for was read ${derivedReads} times`);
  assert.equal(derived.peek(), undefined, "a kind nobody asked for holds a value");
  assert.equal(derived.isRefreshing(), false, "a kind nobody asked for has a refresher running");
});

// refresh-cache.md — "A failed read notifies nobody: nothing was stored, and the value held is the
// one the derived kinds already built on." The comparison here calls everything different, so what
// is under check is the failure and not the comparison's verdict.
test("a source whose read fails tells whoever derives from it nothing", async () => {
  const sourceKey = "check-derivation-failed-read-source";
  let sourceValue: string | undefined = "one";
  let derivedReads = 0;

  const source = kindOf<string>({
    key: sourceKey,
    read: async () => {
      if (sourceValue === undefined) throw new Error("the daemon refused the read");
      return sourceValue;
    },
    periodMs: 60_000,
    differs: () => true,
  });
  const derived = kindOf<string>({
    key: "check-derivation-failed-read-derived",
    derivedFrom: sourceKey,
    read: async () => {
      derivedReads += 1;
      return "derived";
    },
    periodMs: 60_000,
    groupingWindowMs: 20,
  });

  await derived.read();
  await source.read();
  assert.equal(derivedReads, 1);

  sourceValue = undefined;
  source.markChanged();
  await source.read();
  await wait(60);

  assert.equal(source.peek()?.stale, true, "the source's read did not fail, so this case is about nothing");
  assert.equal(source.peek()?.value, "one", "the source did not keep the value its derived kinds had built on");
  assert.equal(derivedReads, 1, `the derived kind was read ${derivedReads} times after a read that stored nothing`);
});

// refresh-cache.md — "A key naming no registered kind is inert": a kind may declare itself derived
// from a key nobody registers, and is then read on its own period like any other.
test("a kind derived from a key naming no registered kind is inert", async () => {
  let reads = 0;
  const orphan = kindOf<string>({
    key: "check-derivation-orphan",
    derivedFrom: "check-derivation-nothing-is-registered-under-this-key",
    read: async () => {
      reads += 1;
      return "listed";
    },
    periodMs: 60_000,
    groupingWindowMs: 20,
  });

  assert.equal((await orphan.read()).value, "listed");
  await wait(60);

  assert.equal(reads, 1, `a kind derived from a key nobody registered was read ${reads} times`);
});

// REQ-55 — refresh-cache.md: the derivation is "declared on the derived kind and named by key, so
// the two register in either order and the source needs to know nothing about who derives from it".
// Here the derived kind is registered while nothing at all is registered under that key, which is
// the order module load produces and nobody declares.
test("a derived kind registered before its source is told just the same", async () => {
  const sourceKey = "check-derivation-registration-order-source";
  let sourceValue = "one";
  let derivedReads = 0;

  const derived = kindOf<string>({
    key: "check-derivation-registration-order-derived",
    derivedFrom: sourceKey,
    read: async () => {
      derivedReads += 1;
      return sourceValue;
    },
    periodMs: 60_000,
    groupingWindowMs: 20,
  });
  const source = kindOf<string>({
    key: sourceKey,
    read: async () => sourceValue,
    periodMs: 60_000,
    differs: (previous, next) => previous !== next,
  });

  await derived.read();
  await source.read();
  assert.equal(derivedReads, 1);

  sourceValue = "two";
  source.markChanged();
  await source.read();
  await wait(60);

  assert.equal(
    derivedReads,
    2,
    `the derived kind was read ${derivedReads} times: registering it before its source lost it the notification`,
  );
  assert.equal(
    (await derived.read()).value,
    "two",
    "the derived kind still holds what it built on the value that was replaced",
  );
});

// The notice coverage a caller may ask for (REQ-58, REQ-59, REQ-60, REQ-61), stated on kinds of
// this file's own so that neither of the two orders it must hold in is left to a fan-out to
// arrange. Every case below holds a value first: with nothing held the caller takes the
// first-request path and is served the right value without any of this (REQ-62).

/** A read whose start this file controls: it returns what the value was when it started, and can be held there. */
function gatedRead(): {
  read: (value: string) => Promise<string>;
  holdTheNextRead: () => void;
  release: () => void;
  fail: (message: string) => void;
  started: () => number;
} {
  let starts = 0;
  let holdNext = false;
  let releaseCurrent: (() => void) | undefined;
  let failCurrent: ((error: Error) => void) | undefined;
  return {
    read: async (value) => {
      starts += 1;
      if (!holdNext) return value;
      holdNext = false;
      await new Promise<void>((resolve, reject) => {
        releaseCurrent = resolve;
        failCurrent = reject;
      });
      return value;
    },
    holdTheNextRead: () => {
      holdNext = true;
    },
    release: () => releaseCurrent?.(),
    fail: (message) => failCurrent?.(new Error(message)),
    started: () => starts,
  };
}

/**
 * Fails loudly instead of hanging when a bounded wait turns out not to be
 * bounded. The guard timer is deliberately **referenced**: every timer the cache
 * itself sets is unreferenced, so a caller waiting for a read the grouping
 * window deferred would otherwise be left with an empty event loop — which the
 * runner reports as a cancelled test rather than as the wait it is. A server
 * holding a listening socket has no such gap.
 */
async function answeredWithin<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let guard: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        guard = setTimeout(() => reject(new Error(what)), ms);
      }),
    ]);
  } finally {
    clearTimeout(guard);
  }
}

// REQ-61 — coverage in the first of the two orders: the read the notice caused was already under
// way when the request arrived.
test("a caller asking for coverage waits for the read the notice already started", async () => {
  const gate = gatedRead();
  let value = "one";
  const kind = kindOf<string>({
    key: "check-coverage-in-flight",
    read: () => gate.read(value),
    periodMs: 60_000,
    eventTypes: ["check-coverage-in-flight"],
    groupingWindowMs: 20,
  });

  assert.equal((await kind.read()).value, "one");
  await wait(40);

  value = "two";
  gate.holdTheNextRead();
  eventStreamService.emit("event", daemonEvent("check-coverage-in-flight", "changed"));
  await wait(5);
  assert.equal(gate.started(), 2, "the notice started no read, so there is nothing in flight for this case to join");

  let answered = false;
  const covered = kind.read({ coverNotices: true }).then((held) => {
    answered = true;
    return held;
  });
  await wait(20);
  assert.equal(answered, false, "the caller asking for coverage was answered from the value the notice is replacing");
  assert.equal(gate.started(), 2, "the caller asking for coverage started a read of its own");

  gate.release();
  assert.equal((await covered).value, "two");
});

// REQ-61 — the second order, and the ordinary one: the grouping window had deferred the read the
// notice caused, so at the instant the request arrives nothing is in flight to join. An
// implementation resting on that instant leaves this red.
test("a caller asking for coverage waits for the read the grouping window deferred", async () => {
  let value = "one";
  let reads = 0;
  const kind = kindOf<string>({
    key: "check-coverage-deferred",
    read: async () => {
      reads += 1;
      return value;
    },
    periodMs: 60_000,
    eventTypes: ["check-coverage-deferred"],
    groupingWindowMs: 200,
  });

  assert.equal((await kind.read()).value, "one");
  // Clear of the millisecond the first read started in, and well inside the
  // window it opened (change-coverage-millisecond-window, tech debt).
  await wait(10);

  value = "two";
  eventStreamService.emit("event", daemonEvent("check-coverage-deferred", "changed"));
  await wait(10);
  assert.equal(reads, 1, "the notice was read at once, so this case never arranges the deferral it is about");

  let answered = false;
  const covered = kind.read({ coverNotices: true }).then((held) => {
    answered = true;
    return held;
  });
  await wait(20);
  assert.equal(answered, false, "the caller asking for coverage was answered from the value the notice is replacing");
  assert.equal(reads, 1, "the caller asking for coverage started a read of its own instead of waiting for the deferred one");

  assert.equal((await answeredWithin(covered, 1_000, "the coverage wait never ended")).value, "two");
  assert.equal(reads, 2, "the caller was answered by a read other than the one the window had deferred");
});

// REQ-61 — "announcements arriving while the request waits do not extend it": the instant is taken
// once, at the call, or a busy host would starve the request this exists to answer.
test("notices arriving while the caller waits do not extend its wait", async () => {
  const gate = gatedRead();
  let value = "one";
  const kind = kindOf<string>({
    key: "check-coverage-not-extended",
    read: () => gate.read(value),
    periodMs: 60_000,
    eventTypes: ["check-coverage-not-extended"],
    groupingWindowMs: 20,
  });

  assert.equal((await kind.read()).value, "one");
  await wait(40);

  value = "two";
  gate.holdTheNextRead();
  eventStreamService.emit("event", daemonEvent("check-coverage-not-extended", "changed"));
  await wait(5);
  const covered = kind.read({ coverNotices: true });

  // The host keeps announcing while the caller waits.
  value = "three";
  eventStreamService.emit("event", daemonEvent("check-coverage-not-extended", "changed"));
  eventStreamService.emit("event", daemonEvent("check-coverage-not-extended", "changed"));
  await wait(5);

  gate.release();
  assert.equal(
    (await answeredWithin(covered, 1_000, "the coverage wait never ended")).value,
    "two",
    "a notice arriving while the caller waited pushed its answer on to a later read",
  );
});

// REQ-60 — "a daemon that stops answering hands it the last good value instead of an error": a
// failed read ends the wait, and is never chased.
test("a read that fails ends the coverage wait with the value held", async () => {
  const gate = gatedRead();
  let value = "one";
  const kind = kindOf<string>({
    key: "check-coverage-failed-read",
    read: () => gate.read(value),
    periodMs: 60_000,
    eventTypes: ["check-coverage-failed-read"],
    groupingWindowMs: 20,
  });

  assert.equal((await kind.read()).value, "one");
  await wait(40);

  value = "two";
  gate.holdTheNextRead();
  eventStreamService.emit("event", daemonEvent("check-coverage-failed-read", "changed"));
  await wait(5);
  const covered = kind.read({ coverNotices: true });

  gate.fail("the daemon stopped answering");
  const held = await answeredWithin(covered, 1_000, "a failed read left the coverage wait running");
  assert.equal(held.value, "one", "the caller was not handed the value held when the read it waited for failed");
  assert.equal(held.stale, true, "the answer built on a failed read was not reported as stale");
  assert.match(held.error ?? "", /the daemon stopped answering/);
});

// REQ-60 — the other bound: "it never waits out the container listing's own period", and reaching
// the bound hands back the value held rather than an answer that never comes. The read the notice
// started here never returns at all.
test("a coverage wait that is never covered ends with the value held", async () => {
  const gate = gatedRead();
  let value = "one";
  const kind = kindOf<string>({
    key: "check-coverage-bounded-in-time",
    read: () => gate.read(value),
    periodMs: 60_000,
    eventTypes: ["check-coverage-bounded-in-time"],
    groupingWindowMs: 20,
  });

  assert.equal((await kind.read()).value, "one");
  await wait(40);

  value = "two";
  gate.holdTheNextRead();
  eventStreamService.emit("event", daemonEvent("check-coverage-bounded-in-time", "changed"));
  await wait(5);

  // The contract bounds the wait at four grouping windows — 80 ms here — capped
  // at the kind's own period, so this guard is more than ten times the bound.
  const held = await answeredWithin(
    kind.read({ coverNotices: true }),
    1_000,
    "the coverage wait outlived its bound of four grouping windows (80 ms here) by more than tenfold",
  );
  assert.equal(held.value, "one", "the caller was not handed the value held when coverage could not be reached");
});

// refresh-cache.md — "A caller that asks on a quiet kind waits for nothing", which is every request
// on a host where nothing is happening.
test("a caller asking for coverage on a kind with no notice outstanding is answered at once", async () => {
  let reads = 0;
  const kind = kindOf<string>({
    key: "check-coverage-quiet-kind",
    read: async () => {
      reads += 1;
      return "listed";
    },
    periodMs: 60_000,
    eventTypes: ["check-coverage-quiet-kind"],
    groupingWindowMs: 20,
  });

  assert.equal((await kind.read()).value, "listed");
  await wait(40);

  let answered = false;
  const covered = kind.read({ coverNotices: true }).then((held) => {
    answered = true;
    return held;
  });
  await wait(5);

  assert.equal(answered, true, "a caller asking for coverage on a kind nothing had announced was made to wait");
  assert.equal((await covered).value, "listed");
  assert.equal(reads, 1, "asking for coverage on a quiet kind started a read");
});

// refresh-cache.md — registering the same key twice is a programming error.
test("registering the same key twice throws", () => {
  kindOf<string>({ key: "check-duplicate-key", read: async () => "listed", periodMs: 60_000 });
  assert.throws(() => registerRefreshKind({ key: "check-duplicate-key", read: async () => "listed", periodMs: 60_000 }));
});

// REQ-20, REQ-21 — the body of a held value is the value and nothing else; when
// it was read travels in headers.
test("a held value is written with the body unchanged and its read time in headers", () => {
  const headers: Record<string, string> = {};
  let body: unknown;
  const response = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    json: (payload: unknown) => {
      body = payload;
    },
  };
  const value = [{ name: "one" }, { name: "two" }];
  const readAt = Date.UTC(2026, 7, 28, 10, 0, 0);

  sendHeld(response, { value, readAt, ageMs: 1234, stale: false });

  assert.deepEqual(body, value);
  assert.equal(headers[READ_AT_HEADER], new Date(readAt).toISOString());
  assert.equal(headers[AGE_HEADER], "1234");
  assert.equal(headers[STALE_HEADER], undefined, "a fresh value was reported as stale");
});

// REQ-15 — staleness is reported, so the interface can say when the value was read.
test("a stale held value carries the staleness header", () => {
  const headers: Record<string, string> = {};
  const response = { setHeader: (name: string, value: string) => void (headers[name] = value), json: () => undefined };

  sendHeld(response, { value: ["one"], readAt: Date.now(), ageMs: 90_000, stale: true, error: "daemon unreachable" });

  assert.equal(headers[STALE_HEADER], "true");
  assert.equal(headers[AGE_HEADER], "90000");
});
