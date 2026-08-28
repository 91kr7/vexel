import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  discardHeldValues,
  registerRefreshKind,
  resetRefreshCache,
  type RefreshKind,
} from "../../src/refresh-cache/refresh-cache.js";

// REQ-27 — a read a discard disowned never leaves the caller with neither a
// value nor an error: it reads again against the endpoint now active and
// answers with that value, or with that daemon's own failure
// (refresh-cache/specs/refresh-cache.md).
//
// The cache is process-wide state, so each case registers a key of its own,
// disposes of it, and puts the cache back through its own reset seam.

const registered: RefreshKind<unknown>[] = [];

function kindOf<T>(options: Parameters<typeof registerRefreshKind<T>>[0]): RefreshKind<T> {
  const kind = registerRefreshKind<T>(options);
  registered.push(kind as RefreshKind<unknown>);
  return kind;
}

afterEach(() => {
  while (registered.length > 0) registered.pop()?.dispose();
  resetRefreshCache();
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (failure: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (failure: Error) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Waits until `condition` holds, failing the case rather than hanging when it never does. */
async function until(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`);
    await wait(5);
  }
}

/**
 * The outcome of a caller, with a deadline: never settling is the very failure
 * REQ-27 forbids, so it is reported as that rather than as a stalled test.
 */
async function settled<T>(caller: Promise<T>): Promise<T> {
  const timeout = deferred<T>();
  const timer = setTimeout(
    () => timeout.reject(new Error("the caller was left with neither a value nor an error (REQ-27)")),
    2000,
  );
  try {
    return await Promise.race([caller, timeout.promise]);
  } finally {
    clearTimeout(timer);
  }
}

// REQ-27 — the read the caller waited on was disowned by a discard: it is
// answered with the value of the daemon now active.
test("a caller whose read a discard disowned is answered with the value of the daemon now active", async () => {
  let reads = 0;
  const disowned = deferred<string>();
  const kind = kindOf<string>({
    key: "check-disowned-read-answers-with-a-value",
    read: async () => {
      reads += 1;
      return reads === 1 ? await disowned.promise : "current-daemon";
    },
    periodMs: 60_000,
  });

  const caller = kind.read();
  await until(() => reads === 1, "the first read to be in flight");

  // The active endpoint changes while that read is in flight, so its result
  // describes the daemon left behind and is stored nowhere.
  discardHeldValues();
  disowned.resolve("previous-daemon");

  const held = await settled(caller);
  assert.equal(held.value, "current-daemon", "the caller was not answered with a read against the endpoint now active");
  assert.equal(held.stale, false);
  assert.equal(held.error, undefined);
});

// REQ-27 — when the daemon now active refuses, the caller gets that refusal
// verbatim, not "the value could not be read".
test("a caller whose read a discard disowned is answered with the new daemon's own failure", async () => {
  let reads = 0;
  const disowned = deferred<string>();
  const kind = kindOf<string>({
    key: "check-disowned-read-answers-with-a-failure",
    read: async () => {
      reads += 1;
      if (reads === 1) return await disowned.promise;
      throw new Error("Cannot connect to the Docker daemon at tcp://198.51.100.7:2375");
    },
    periodMs: 60_000,
  });

  const caller = kind.read();
  await until(() => reads === 1, "the first read to be in flight");

  discardHeldValues();
  disowned.resolve("previous-daemon");

  await assert.rejects(settled(caller), (failure: Error) => {
    assert.match(
      failure.message,
      /Cannot connect to the Docker daemon at tcp:\/\/198\.51\.100\.7:2375/,
      "the caller was not handed the failure of the daemon now active",
    );
    return true;
  });
});

// REQ-27 — the same hole on the other waiting path: a held value the caller was
// waiting to see covered, discarded while that read was in flight.
test("a caller waiting for a change to be covered is answered after a discard, not left with neither", async () => {
  let reads = 0;
  const disowned = deferred<string>();
  const kind = kindOf<string>({
    key: "check-disowned-change-coverage",
    read: async () => {
      reads += 1;
      if (reads === 1) return "before-the-change";
      if (reads === 2) return await disowned.promise;
      return "current-daemon";
    },
    periodMs: 60_000,
  });

  await kind.read();
  // The scripted read above answers instantly, and read times are millisecond
  // stamps: the change is separated from it so the held value provably predates
  // it, which is what puts the caller on the change-coverage path.
  await wait(5);
  kind.markChanged();
  await until(() => reads === 2, "the read covering the change to be in flight");

  const caller = kind.read();
  await wait(20);

  discardHeldValues();
  disowned.resolve("previous-daemon");

  const held = await settled(caller);
  assert.equal(held.value, "current-daemon", "the caller was not answered with a read against the endpoint now active");
  assert.notEqual(held.value, "previous-daemon", "a value read from the daemon left behind was served");
});

// refresh-cache.md — a chain of discards is bounded, so the caller is never
// held indefinitely: it ends with a value or with an error, and the cache does
// not read on its behalf without end.
test("a chain of discards ends the caller instead of holding it, and does not read without end", async () => {
  let reads = 0;
  const kind = kindOf<string>({
    key: "check-disowned-read-attempts-are-bounded",
    read: async () => {
      reads += 1;
      // Every read is disowned: the endpoint changes again before it lands.
      discardHeldValues();
      return `value-${reads}`;
    },
    periodMs: 60_000,
  });

  const outcome = await settled(kind.read().then(
    () => "answered" as const,
    () => "failed" as const,
  ));

  assert.ok(outcome === "answered" || outcome === "failed");
  assert.ok(reads <= 5, `the caller kept reading against a chain of discards (${reads} reads)`);
});
