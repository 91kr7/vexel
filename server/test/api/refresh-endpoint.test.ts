/**
 * The manual reload endpoint, `POST /api/refresh`
 * (plan-docker_management_app-refresh_cache-manual_refresh/REQ-7 to REQ-10;
 * `refresh-cache/specs/refresh-cache.md`) — the check INT-16 of
 * `batch-manual-refresh` asks for.
 *
 * Four claims, and the shape each one needs:
 *
 * - **REQ-7, everything held is read again.** Proved on the context inventory,
 *   whose kind has a 300 s period and no daemon event type at all: a context
 *   created from a terminal cannot reach the held value on its own inside a
 *   test, so a list that carries it after the request carries it *because of*
 *   the request. The same case holds the connection status first, since REQ-7
 *   names it.
 * - **REQ-8, what is not held is not read.** A claim about a call that must not
 *   happen, so it is counted at the kind's own read rather than looked for on
 *   screen.
 * - **REQ-9, a failing read keeps the held value.** The failure is the kind's
 *   own, arranged on a kind registered by this file: pulling the daemon away
 *   from a running server would fail every other kind at once and prove nothing
 *   about which value survived.
 * - **REQ-10, the cache's own behaviour is unchanged.** Period, refresher and
 *   demand are three separate promises, and each is measured on its own
 *   observable: reads still arriving on the period, no refresher started for a
 *   kind nobody asked for, and a demand that still expires when it would have.
 *
 * Every fixture is removed by the test that made it, in a `finally`: contexts
 * carry no label, so the name prefix is the only handle there is, and the kinds
 * registered here are disposed of so no later file inherits them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import { contextsRouter } from "../../src/contexts/contexts-routes.js";
import { contextListCache } from "../../src/contexts/contexts-service.js";
import { connectionStatusCache } from "../../src/connectivity/connection-status-service.js";
import { connectivityRouter } from "../../src/connectivity/connectivity-routes.js";
import { refreshRouter } from "../../src/refresh-cache/refresh-routes.js";
import { registerRefreshKind, resetRefreshCache, type RefreshKind } from "../../src/refresh-cache/refresh-cache.js";
import { startApp } from "../support/fixtures.js";
import { execFileAsync } from "../support/docker-cli.js";

const RUN_ID = `${process.pid}-${Date.now()}`;

interface RefreshAnswer {
  status: number;
  ok: boolean;
  reloaded: string[];
  skipped: string[];
  failed: { key: string; error: string }[];
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/contexts", contextsRouter);
  app.use("/api/connectivity", connectivityRouter);
  app.use("/api/refresh", refreshRouter);
  return app;
}

/** The operator's own request: no body, and the answer read to the end. */
async function requestReload(url: string): Promise<RefreshAnswer> {
  const response = await fetch(`${url}/api/refresh`, { method: "POST" });
  const body = (await response.json()) as Omit<RefreshAnswer, "status">;
  return { status: response.status, ...body };
}

async function getJson<T>(url: string, path: string): Promise<T> {
  const response = await fetch(`${url}${path}`);
  assert.equal(response.status, 200, `GET ${path} answered ${response.status}`);
  return (await response.json()) as T;
}

function contextName(caseName: string): string {
  return `vexel-test-refresh-${caseName}-${RUN_ID}`;
}

async function removeContextQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["context", "rm", "-f", name]).catch(() => undefined);
}

/** A kind of this file's own, so a read can be made to fail, counted, and timed. */
interface CountedKind<T> {
  kind: RefreshKind<T>;
  /** How many times the cache has called the read. */
  calls(): number;
  /** Makes every later read fail with this message. */
  breakWith(message: string): void;
}

let kindSequence = 0;

function countedKind(options: { periodMs: number; demandExpiryMs?: number }): CountedKind<string> {
  kindSequence += 1;
  const key = `test-kind-${RUN_ID}-${kindSequence}`;
  let calls = 0;
  let failure: string | undefined;
  const kind = registerRefreshKind<string>({
    key,
    periodMs: options.periodMs,
    demandExpiryMs: options.demandExpiryMs,
    read: async () => {
      calls += 1;
      if (failure !== undefined) throw new Error(failure);
      return `${key}-read-${calls}`;
    },
  });
  return {
    kind,
    calls: () => calls,
    breakWith: (message: string) => {
      failure = message;
    },
  };
}

function after(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

interface ContextSummary {
  name: string;
}

// REQ-7 — on the operator's request the server reads again every value it holds, the connection
// status included; the endpoint answers only once the reload has ended.
test("POST /api/refresh reads again every value the cache holds, the connection status included", async () => {
  const name = contextName("held");
  const { url, close } = await startApp(buildApp());
  try {
    resetRefreshCache();

    // Both kinds are asked for, so both are held when the request arrives.
    const before = await getJson<ContextSummary[]>(url, "/api/contexts");
    await getJson<unknown>(url, "/api/connectivity/status");
    assert.ok(
      !before.some((one) => one.name === name),
      "the fixture context existed before the test created it",
    );

    await execFileAsync("docker", ["context", "create", name, "--docker", "host=ssh://operator@build-host"]);

    // The contexts kind has a 300 s period and no event type: nothing but the request can carry
    // the new context into the held value inside this test.
    const stillHeld = await getJson<ContextSummary[]>(url, "/api/contexts");
    assert.ok(
      !stillHeld.some((one) => one.name === name),
      "the held context list was read again before the request was made, so the request proves nothing",
    );

    const answer = await requestReload(url);

    assert.equal(answer.status, 200);
    assert.equal(answer.ok, true, `the reload reported failures: ${JSON.stringify(answer.failed)}`);
    assert.ok(answer.reloaded.includes(contextListCache.key), `the context list was not read again: ${JSON.stringify(answer)}`);
    assert.ok(
      answer.reloaded.includes(connectionStatusCache.key),
      `the connection status was not read again: ${JSON.stringify(answer)}`,
    );

    // The answer was written only once the reload had ended, so what is served next is the
    // reloaded value — with no further wait here.
    const afterReload = await getJson<ContextSummary[]>(url, "/api/contexts");
    assert.ok(
      afterReload.some((one) => one.name === name),
      "the list served right after the request still lacked the context created from the terminal",
    );
  } finally {
    await removeContextQuietly(name);
    await close();
  }
});

// REQ-8 — a value the server does not hold is not read by the request.
test("POST /api/refresh skips a kind holding nothing, and reads the one that holds a value", async () => {
  const held = countedKind({ periodMs: 300_000 });
  const untouched = countedKind({ periodMs: 300_000 });
  const { url, close } = await startApp(buildApp());
  try {
    resetRefreshCache();

    // One kind is asked for; the other is registered and never asked for.
    await held.kind.read();
    const callsAfterFirstRead = held.calls();
    assert.equal(untouched.calls(), 0, "registering a kind read it");

    const answer = await requestReload(url);

    assert.equal(answer.status, 200);
    assert.ok(answer.reloaded.includes(held.kind.key), `the held kind was not read again: ${JSON.stringify(answer)}`);
    assert.equal(held.calls(), callsAfterFirstRead + 1, "the held kind was read a number of times other than once");

    assert.ok(answer.skipped.includes(untouched.kind.key), `the kind holding nothing was not skipped: ${JSON.stringify(answer)}`);
    assert.ok(!answer.reloaded.includes(untouched.kind.key), "a kind holding nothing was reported as reloaded");
    assert.equal(untouched.calls(), 0, "the request read a kind the server was holding nothing for");

    // A key is reported in exactly one of the three lists.
    const all = [...answer.reloaded, ...answer.skipped, ...answer.failed.map((one) => one.key)];
    assert.equal(new Set(all).size, all.length, `a key was reported twice: ${JSON.stringify(answer)}`);
  } finally {
    held.kind.dispose();
    untouched.kind.dispose();
    await close();
  }
});

// REQ-9 — a read that fails leaves the held value alone; the request reports the failure instead of
// throwing, and the request itself still succeeded.
test("POST /api/refresh keeps the held value and reports the failure when a read fails", async () => {
  const failing = countedKind({ periodMs: 300_000 });
  const working = countedKind({ periodMs: 300_000 });
  const { url, close } = await startApp(buildApp());
  try {
    resetRefreshCache();

    const first = await failing.kind.read();
    await working.kind.read();
    failing.breakWith("the daemon cannot be reached");

    const answer = await requestReload(url);

    assert.equal(answer.status, 200, "a partial failure was reported as a failed request rather than in the body");
    assert.equal(answer.ok, false, `a failed read left ok true: ${JSON.stringify(answer)}`);
    const reported = answer.failed.find((one) => one.key === failing.kind.key);
    assert.ok(reported !== undefined, `the failed kind was not reported: ${JSON.stringify(answer)}`);
    assert.match(reported.error, /the daemon cannot be reached/, "the failure was reported without its cause");
    assert.ok(!answer.reloaded.includes(failing.kind.key), "a kind whose read failed was reported as reloaded");

    // The held value keeps its last good content, and its read time with it.
    const kept = failing.kind.peek();
    assert.ok(kept !== undefined, "the failed read dropped the value the kind was holding");
    assert.equal(kept.value, first.value, "the failed read replaced the value the kind was holding");
    assert.equal(kept.readAt, first.readAt, "the failed read moved the held value's read time");

    // …and the other kind was read again all the same: one failure does not abandon the rest.
    assert.ok(answer.reloaded.includes(working.kind.key), `a failure stopped the other reads: ${JSON.stringify(answer)}`);
  } finally {
    failing.kind.dispose();
    working.kind.dispose();
    await close();
  }
});

// REQ-10 — the request starts no refresher for a kind nobody is asking for.
test("POST /api/refresh starts no refresher for a kind nobody asks for", async () => {
  const untouched = countedKind({ periodMs: 200 });
  const { url, close } = await startApp(buildApp());
  try {
    resetRefreshCache();
    assert.equal(untouched.kind.isRefreshing(), false, "a registered kind was already refreshing");

    await requestReload(url);
    await after(700);

    assert.equal(untouched.kind.isRefreshing(), false, "the request started a refresher for a kind nobody asked for");
    assert.equal(untouched.calls(), 0, `the request read that kind ${untouched.calls()} times`);
    assert.equal(untouched.kind.peek(), undefined, "the request left a value held for a kind nobody asked for");
  } finally {
    untouched.kind.dispose();
    await close();
  }
});

// REQ-10 — after the request each kind keeps the schedule it had: its refresher is still running and
// its own period still produces reads.
test("POST /api/refresh leaves a held kind's refresher and period as they were", async () => {
  const kind = countedKind({ periodMs: 300, demandExpiryMs: 60_000 });
  const { url, close } = await startApp(buildApp());
  try {
    resetRefreshCache();

    await kind.kind.read();
    assert.equal(kind.kind.isRefreshing(), true, "asking for a kind started no refresher");
    await after(1_000);
    const onItsOwnBefore = kind.calls();
    assert.ok(onItsOwnBefore >= 3, `the kind's own period produced ${onItsOwnBefore} reads in 1000 ms, so nothing is being measured`);

    const answer = await requestReload(url);
    assert.ok(answer.reloaded.includes(kind.kind.key));
    const afterRequest = kind.calls();

    await after(1_000);
    const onItsOwnAfter = kind.calls() - afterRequest;

    assert.equal(kind.kind.isRefreshing(), true, "the request stopped the kind's refresher");
    assert.ok(
      onItsOwnAfter >= onItsOwnBefore - 2,
      `the period changed: ${onItsOwnBefore} reads in the second before the request, ${onItsOwnAfter} in the second after`,
    );
  } finally {
    kind.kind.dispose();
    await close();
  }
});

// REQ-10 — the request renews no demand: a kind nobody asks for again still expires when it would
// have, and its refresher stops with it.
test("POST /api/refresh renews no demand, so the demand gate still closes when it would have", async () => {
  // Expiry 2 s, and the request at ~1 s: without renewal the gate closes by ~2.5 s, with renewal it
  // would stay open until ~3 s. The reading is taken at 2.8 s, between the two.
  const kind = countedKind({ periodMs: 500, demandExpiryMs: 2_000 });
  const { url, close } = await startApp(buildApp());
  try {
    resetRefreshCache();

    const startedAt = Date.now();
    await kind.kind.read();
    await after(1_000 - (Date.now() - startedAt));

    const answer = await requestReload(url);
    assert.ok(answer.reloaded.includes(kind.kind.key), `the kind was not read again: ${JSON.stringify(answer)}`);

    await after(2_800 - (Date.now() - startedAt));

    assert.equal(
      kind.kind.isRefreshing(),
      false,
      "the request renewed the kind's demand: its refresher was still running past the expiry it had",
    );
    assert.equal(kind.kind.peek(), undefined, "the demand expired without the held value being dropped");
  } finally {
    kind.kind.dispose();
    await close();
  }
});

// REQ-10 — the triggers a kind carries still work after the request: the application saying "I have
// just changed this" still reads at once.
test("POST /api/refresh leaves a kind's change trigger working", async () => {
  const kind = countedKind({ periodMs: 300_000, demandExpiryMs: 60_000 });
  const { url, close } = await startApp(buildApp());
  try {
    resetRefreshCache();

    await kind.kind.read();
    await requestReload(url);
    const beforeTrigger = kind.calls();

    kind.kind.markChanged();
    await after(300);

    assert.ok(
      kind.calls() > beforeTrigger,
      "after the request, the kind no longer read again when the application marked it changed",
    );
  } finally {
    kind.kind.dispose();
    await close();
  }
});
