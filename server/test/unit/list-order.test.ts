import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// The single ordering rule (list-order.md): the name comparison, the exact
// identity comparison that makes it total, and the two comparator builders.
// The shape that matters throughout is REQ-6's: the same rows supplied in both
// input orders must come out the same way, since a name-only comparison passes
// an alphabetical assertion and reshuffles when the input order changes.

import {
  compareNames,
  compareIdentities,
  byNameThenIdentity,
  byNamedThenUnnamedNewest,
} from "../../src/list-order/list-order.js";

interface Row {
  id: string;
  label: string | null | undefined;
  rank?: number;
  created?: number | string | null;
}

const serverRoot = new URL("../../", import.meta.url);

function idsSorted<T extends { id: string }>(rows: readonly T[], comparator: (left: T, right: T) => number): string[] {
  return [...rows].sort(comparator).map((row) => row.id);
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += 1) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) result.push([items[index]!, ...tail]);
  }
  return result;
}

function assertSameOrderFromEveryInputOrder<T extends { id: string }>(
  rows: readonly T[],
  comparator: (left: T, right: T) => number,
): string[] {
  const orders = permutations(rows).map((input) => idsSorted(input, comparator));
  const expected = orders[0]!;
  for (const order of orders) assert.deepEqual(order, expected);
  return expected;
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const target = state % (index + 1);
    [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  }
  return copy;
}

const byLabelThenId = byNameThenIdentity<Row>({
  name: (row) => row.label ?? "",
  identity: (row) => row.id,
});

const byRankThenLabelThenId = byNameThenIdentity<Row>({
  group: (row) => row.rank ?? 0,
  name: (row) => row.label ?? "",
  identity: (row) => row.id,
});

const byNamedThenNewest = byNamedThenUnnamedNewest<Row>({
  name: (row) => row.label,
  createdAt: (row) => row.created ?? null,
  identity: (row) => row.id,
});

// REQ-3: runs of digits inside a name compare as numbers, not as text.
test("compareNames places app-2 before app-10, in either argument order", () => {
  assert.ok(compareNames("app-2", "app-10") < 0);
  assert.ok(compareNames("app-10", "app-2") > 0);
});

// REQ-2: case does not split a list into two alphabets.
test("compareNames keeps Redis beside redis-cache rather than in a separate alphabet", () => {
  assert.ok(compareNames("Redis", "redis-cache") < 0);
  assert.ok(compareNames("redis-cache", "redisz") < 0);
  assert.ok(compareNames("Redis", "redisz") < 0);
});

// REQ-2: names differing only in case, and only in diacritics, compare equal.
test("compareNames ties on case-only and diacritic-only differences", () => {
  assert.equal(compareNames("Data", "data"), 0);
  assert.equal(compareNames("data", "Data"), 0);
  assert.equal(compareNames("cafe", "café"), 0);
  assert.equal(compareNames("café", "cafe"), 0);
});

// REQ-3: leading zeros make no numeric difference, so the two names tie.
test("compareNames ties on a leading-zero-only difference", () => {
  assert.equal(compareNames("app-1", "app-01"), 0);
  assert.equal(compareNames("app-01", "app-1"), 0);
});

// list-order.md: a composite name is compared segment by segment, shorter prefix first.
test("compareNames compares composite names segment by segment", () => {
  assert.ok(compareNames(["nginx", "1.25"], ["nginx", "latest"]) < 0);
  assert.ok(compareNames(["nginx", "latest"], ["nginx", "1.25"]) > 0);
  assert.ok(compareNames(["mysql", "9"], ["nginx", "1.25"]) < 0);
  assert.ok(compareNames(["nginx"], ["nginx", "1.25"]) < 0);
  assert.ok(compareNames(["nginx", "1.25"], ["nginx"]) > 0);
  assert.equal(compareNames(["nginx", "1.25"], ["NGINX", "1.25"]), 0);
});

// REQ-4: the result is the rule's own, not the host's collation.
test("compareNames sorts z after a-diaeresis, the result its fixed locale gives", () => {
  assert.ok(compareNames("z", "ä") > 0);
  assert.ok(compareNames("ä", "z") < 0);
});

// REQ-4: the same pair compares the same way under any operator locale.
test("compareNames returns the same result in a process running under a Swedish locale", () => {
  const script = `const m = await import(${JSON.stringify(new URL("src/list-order/list-order.ts", serverRoot).href)});
console.log(JSON.stringify([Math.sign(m.compareNames("z", "\\u00e4")), Math.sign(m.compareNames("app-2", "app-10"))]));`;
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", script],
    { cwd: serverRoot.pathname, env: { ...process.env, LC_ALL: "sv_SE.UTF-8", LANG: "sv_SE.UTF-8" }, encoding: "utf8" },
  );
  assert.deepEqual(JSON.parse(output.trim().split("\n").at(-1)!), [1, -1]);
});

// REQ-5: the identity comparison separates exactly what the name comparison calls equal.
test("compareIdentities separates the pairs compareNames ties on", () => {
  assert.ok(compareIdentities("Data", "data") < 0);
  assert.ok(compareIdentities("data", "Data") > 0);
  assert.ok(compareIdentities("app-01", "app-1") < 0);
  assert.ok(compareIdentities("app-1", "app-01") > 0);
  assert.notEqual(compareIdentities("cafe", "café"), 0);
});

// REQ-5: an exact comparison is equal only for identical strings.
test("compareIdentities returns equal only for identical strings", () => {
  assert.equal(compareIdentities("data", "data"), 0);
  assert.equal(compareIdentities("", ""), 0);
  assert.notEqual(compareIdentities("data", "data "), 0);
});

// REQ-5, REQ-6: rows tying on case come out the same way from both input orders.
test("byNameThenIdentity orders a case-only tie identically from both input orders", () => {
  const rows: Row[] = [
    { id: "i-1", label: "Data" },
    { id: "i-2", label: "data" },
  ];
  assert.deepEqual(assertSameOrderFromEveryInputOrder(rows, byLabelThenId), ["i-1", "i-2"]);
});

// REQ-5, REQ-6: rows tying on leading zeros come out the same way from both input orders.
test("byNameThenIdentity orders a leading-zero tie identically from both input orders", () => {
  const rows: Row[] = [
    { id: "app-1", label: "app-1" },
    { id: "app-01", label: "app-01" },
  ];
  assert.deepEqual(assertSameOrderFromEveryInputOrder(rows, byLabelThenId), ["app-01", "app-1"]);
});

// REQ-5: no two distinct rows ever compare equal.
test("byNameThenIdentity never returns zero for two distinct rows", () => {
  const rows: Row[] = [
    { id: "a", label: "Data" },
    { id: "b", label: "data" },
    { id: "c", label: "app-1" },
    { id: "d", label: "app-01" },
    { id: "e", label: "cafe" },
    { id: "f", label: "café" },
  ];
  for (const left of rows) {
    for (const right of rows) {
      if (left === right) continue;
      assert.notEqual(byLabelThenId(left, right), 0, `${left.id} vs ${right.id}`);
    }
  }
});

// REQ-3, REQ-5: the whole rule applies at once — numeric name first, identity last.
test("byNameThenIdentity applies the numeric name comparison before the identity one", () => {
  const rows: Row[] = [
    { id: "z", label: "app-2" },
    { id: "a", label: "app-10" },
    { id: "m", label: "app-2" },
  ];
  assert.deepEqual(assertSameOrderFromEveryInputOrder(rows, byLabelThenId), ["m", "z", "a"]);
});

// list-order.md: an ascending group rank is compared before the name.
test("byNameThenIdentity compares the group rank before the name", () => {
  const rows: Row[] = [
    { id: "n-1", label: "zulu", rank: 0 },
    { id: "n-2", label: "alpha", rank: 1 },
    { id: "n-3", label: "beta", rank: 1 },
  ];
  assert.deepEqual(assertSameOrderFromEveryInputOrder(rows, byRankThenLabelThenId), ["n-1", "n-2", "n-3"]);
});

// REQ-6: a set full of ties produces one and the same sequence from any input order.
test("byNameThenIdentity produces one sequence whatever order the rows arrive in", () => {
  const rows: Row[] = [
    { id: "1", label: "Data" },
    { id: "2", label: "data" },
    { id: "3", label: "DATA" },
    { id: "4", label: "app-1" },
    { id: "5", label: "app-01" },
    { id: "6", label: "app-001" },
    { id: "7", label: "cafe" },
    { id: "8", label: "café" },
    { id: "9", label: "app-10" },
    { id: "10", label: "app-2" },
  ];
  const expected = idsSorted(rows, byLabelThenId);
  for (let seed = 1; seed <= 40; seed += 1) {
    assert.deepEqual(idsSorted(shuffled(rows, seed), byLabelThenId), expected, `seed ${seed}`);
  }
});

// REQ-13, REQ-21 shape: every named row precedes every unnamed one.
test("byNamedThenUnnamedNewest places every named row before every unnamed one", () => {
  const rows: Row[] = [
    { id: "u-1", label: null, created: 300 },
    { id: "n-1", label: "zulu", created: 100 },
    { id: "u-2", label: undefined, created: 200 },
    { id: "n-2", label: "alpha", created: 400 },
  ];
  assert.deepEqual(assertSameOrderFromEveryInputOrder(rows, byNamedThenNewest), ["n-2", "n-1", "u-1", "u-2"]);
});

// REQ-14, REQ-21: the unnamed group is ordered newest first.
test("byNamedThenUnnamedNewest orders the unnamed group newest first", () => {
  const rows: Row[] = [
    { id: "u-old", label: null, created: 100 },
    { id: "u-new", label: null, created: 300 },
    { id: "u-mid", label: null, created: 200 },
  ];
  assert.deepEqual(assertSameOrderFromEveryInputOrder(rows, byNamedThenNewest), ["u-new", "u-mid", "u-old"]);
});

// list-order.md: an ISO-8601 creation instant is compared as an exact string, newest first.
test("byNamedThenUnnamedNewest orders ISO-8601 creation instants newest first", () => {
  const rows: Row[] = [
    { id: "u-a", label: null, created: "2026-01-02T03:04:05Z" },
    { id: "u-b", label: null, created: "2026-01-02T03:04:06Z" },
    { id: "u-c", label: null, created: "2025-12-31T23:59:59Z" },
  ];
  assert.deepEqual(assertSameOrderFromEveryInputOrder(rows, byNamedThenNewest), ["u-b", "u-a", "u-c"]);
});

// list-order.md: a row with no creation instant comes after the rows that have one.
test("byNamedThenUnnamedNewest places a row with no creation instant after those with one", () => {
  const rows: Row[] = [
    { id: "u-none", label: null, created: null },
    { id: "u-old", label: null, created: 100 },
    { id: "u-new", label: null, created: 300 },
  ];
  assert.deepEqual(assertSameOrderFromEveryInputOrder(rows, byNamedThenNewest), ["u-new", "u-old", "u-none"]);
});

// REQ-5, REQ-6, REQ-21: unnamed rows sharing a creation instant are separated by identity.
test("byNamedThenUnnamedNewest separates same-instant unnamed rows by identity, from both input orders", () => {
  const rows: Row[] = [
    { id: "sha-b", label: null, created: 1_700_000_000 },
    { id: "sha-a", label: null, created: 1_700_000_000 },
  ];
  assert.deepEqual(assertSameOrderFromEveryInputOrder(rows, byNamedThenNewest), ["sha-a", "sha-b"]);
});

// REQ-5, REQ-6: named rows tying on the name are separated by identity, from both input orders.
test("byNamedThenUnnamedNewest separates tying named rows by identity, from both input orders", () => {
  const rows: Row[] = [
    { id: "vol-b", label: "Data", created: 100 },
    { id: "vol-a", label: "data", created: 900 },
  ];
  assert.deepEqual(assertSameOrderFromEveryInputOrder(rows, byNamedThenNewest), ["vol-a", "vol-b"]);
});

// REQ-5: no two distinct rows ever compare equal, unnamed group included.
test("byNamedThenUnnamedNewest never returns zero for two distinct rows", () => {
  const rows: Row[] = [
    { id: "a", label: "Data", created: 100 },
    { id: "b", label: "data", created: 100 },
    { id: "c", label: null, created: 100 },
    { id: "d", label: undefined, created: 100 },
    { id: "e", label: null, created: null },
    { id: "f", label: null, created: "2026-01-01T00:00:00Z" },
  ];
  for (const left of rows) {
    for (const right of rows) {
      if (left === right) continue;
      assert.notEqual(byNamedThenNewest(left, right), 0, `${left.id} vs ${right.id}`);
    }
  }
});

// REQ-6, REQ-16, REQ-22: one sequence whatever order the rows arrive in.
test("byNamedThenUnnamedNewest produces one sequence whatever order the rows arrive in", () => {
  const rows: Row[] = [
    { id: "1", label: "Data", created: 10 },
    { id: "2", label: "data", created: 20 },
    { id: "3", label: "app-1", created: 30 },
    { id: "4", label: "app-01", created: 40 },
    { id: "5", label: null, created: 500 },
    { id: "6", label: null, created: 500 },
    { id: "7", label: undefined, created: 500 },
    { id: "8", label: null, created: 400 },
    { id: "9", label: null, created: null },
    { id: "10", label: "app-10", created: 60 },
  ];
  const expected = idsSorted(rows, byNamedThenNewest);
  for (let seed = 1; seed <= 40; seed += 1) {
    assert.deepEqual(idsSorted(shuffled(rows, seed), byNamedThenNewest), expected, `seed ${seed}`);
  }
});

// REQ-7: ordering a list of the size these panels reach costs no perceptible time.
test("ordering a few thousand rows costs no perceptible time", () => {
  const rows: Row[] = Array.from({ length: 5000 }, (_, index) => ({
    id: `id-${index}`,
    label: index % 7 === 0 ? null : `service-${index % 500}`,
    created: index % 11,
  }));
  const shuffledRows = shuffled(rows, 99);

  const startedAt = process.hrtime.bigint();
  const byName = idsSorted(shuffledRows, byLabelThenId);
  const byGroup = idsSorted(shuffledRows, byNamedThenNewest);
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  assert.equal(byName.length, 5000);
  assert.equal(byGroup.length, 5000);
  assert.ok(elapsedMs < 500, `ordering 5000 rows twice took ${elapsedMs.toFixed(0)}ms`);
});
