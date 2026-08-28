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
