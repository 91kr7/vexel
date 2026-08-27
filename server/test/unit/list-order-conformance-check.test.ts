import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

// The list-order conformance check (list-order-conformance-check.md), run as a
// black box over a source tree of the test's own: what it reports, what it
// accepts, and the self-expiry of its awaiting-adoption list. The script
// resolves the tree it scans from its own location, so each case copies it into
// a throwaway root next to a fabricated `src/`, and removes the root afterwards.

const realScript = new URL("../../scripts/check-list-order-conformance.mjs", import.meta.url).pathname;

// The name ordering the seven services carried before they adopted the shared
// rule. The awaiting-adoption list that tolerated it is now empty
// (list-order-conformance-check.md), so it is a violation like any other.
const anOrderingOfItsOwn = "export const listed = (rows: string[]) => [...rows].sort((a, b) => a.localeCompare(b));\n";

const orderedThroughTheSharedRule = `import { byNameThenIdentity } from "../list-order/list-order.js";

const comparator = byNameThenIdentity<{ name: string; id: string }>({ name: (row) => row.name, identity: (row) => row.id });

export const listed = (rows: { name: string; id: string }[]) => [...rows].sort(comparator);
`;

interface CheckResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runCheckOver(files: Record<string, string>): CheckResult {
  const root = mkdtempSync(join(tmpdir(), "list-order-conformance-"));
  try {
    const script = join(root, "scripts", "check-list-order-conformance.mjs");
    mkdirSync(dirname(script), { recursive: true });
    copyFileSync(realScript, script);
    mkdirSync(join(root, "src"), { recursive: true });
    for (const [path, content] of Object.entries(files)) {
      const full = join(root, "src", path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    const run = spawnSync(process.execPath, [script], { encoding: "utf8" });
    return { status: run.status ?? -1, stdout: run.stdout, stderr: run.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * The same check, run over a copy of the script whose awaiting-adoption list has
 * been given `entries`. The real list is empty and stays empty, but the
 * mechanism itself is contracted to survive ("an entry added to it still cannot
 * outlive its adoption"), and this is the only way to exercise it.
 */
function runCheckWithAwaitingAdoption(entries: string[], files: Record<string, string>): CheckResult {
  const root = mkdtempSync(join(tmpdir(), "list-order-conformance-"));
  try {
    const script = join(root, "scripts", "check-list-order-conformance.mjs");
    mkdirSync(dirname(script), { recursive: true });
    const source = readFileSync(realScript, "utf8").replace(
      "const awaitingAdoption = [];",
      `const awaitingAdoption = ${JSON.stringify(entries)};`,
    );
    assert.match(source, /const awaitingAdoption = \[".+"\]/, "the awaiting-adoption list must still be there to be populated");
    writeFileSync(script, source);
    mkdirSync(join(root, "src"), { recursive: true });
    for (const [path, content] of Object.entries(files)) {
      const full = join(root, "src", path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    const run = spawnSync(process.execPath, [script], { encoding: "utf8" });
    return { status: run.status ?? -1, stdout: run.stdout, stderr: run.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// REQ-1: a tree in which every ordering goes through the shared rule passes.
test("exits zero and says so when no ordering is written outside the ordering area", () => {
  const result = runCheckOver({ "containers/containers-service.ts": orderedThroughTheSharedRule });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed/i);
  assert.equal(result.stderr, "");
});

// REQ-1: a comparator written inline is reported, with the file and the line.
test("reports a comparator written inline in a sort", () => {
  const result = runCheckOver({
    "containers/containers-service.ts": [
      "export const listed = (rows: { name: string }[]) =>",
      "  [...rows].sort((left, right) => (left.name < right.name ? -1 : 1));",
      "",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /server\/src\/containers\/containers-service\.ts:2\b/);
  assert.match(result.stderr, /a comparator written inline/);
});

// REQ-1: an inline comparator in a toSorted is reported like one in a sort.
test("reports a comparator written inline in a toSorted", () => {
  const result = runCheckOver({
    "images/images-service.ts": "export const listed = (rows: string[]) => rows.toSorted((left, right) => (left < right ? -1 : 1));\n",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /server\/src\/images\/images-service\.ts:1\b/);
  assert.match(result.stderr, /a comparator written inline/);
});

// REQ-1: a sort with no comparator compares names as text and is reported.
test("reports a comparator-less sort and a comparator-less toSorted", () => {
  const sortResult = runCheckOver({
    "volumes/volumes-service.ts": "export const listed = (rows: string[]) => [...rows].sort();\n",
  });
  const toSortedResult = runCheckOver({
    "volumes/volumes-service.ts": "export const listed = (rows: string[]) => rows.toSorted();\n",
  });

  assert.equal(sortResult.status, 1);
  assert.match(sortResult.stderr, /server\/src\/volumes\/volumes-service\.ts:1\b/);
  assert.match(sortResult.stderr, /a comparator-less sort/);
  assert.equal(toSortedResult.status, 1);
  assert.match(toSortedResult.stderr, /a comparator-less sort/);
});

// REQ-1: a localeCompare name comparison outside the ordering area is reported.
test("reports a localeCompare call", () => {
  const result = runCheckOver({
    "networks/networks-service.ts": [
      "export function compareRows(left: { name: string }, right: { name: string }) {",
      "  return left.name.localeCompare(right.name);",
      "}",
      "",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /server\/src\/networks\/networks-service\.ts:2\b/);
  assert.match(result.stderr, /localeCompare/);
});

// REQ-1: a collator built outside the ordering area is a second rule and is reported.
test("reports an Intl.Collator of its own", () => {
  const result = runCheckOver({
    "contexts/contexts-service.ts": [
      'export const collator = new Intl.Collator("en-US", { numeric: true });',
      "",
    ].join("\n"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /server\/src\/contexts\/contexts-service\.ts:1\b/);
  assert.match(result.stderr, /a collator of its own/);
});

// list-order-conformance-check.md: the ordering area itself is not scanned.
test("does not scan the ordering area", () => {
  const result = runCheckOver({
    "list-order/list-order.ts": [
      'const collator = new Intl.Collator("en-US", { numeric: true });',
      "export const listed = (rows: string[]) => [...rows].sort((left, right) => collator.compare(left, right));",
      "",
    ].join("\n"),
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed/i);
});

// list-order-conformance-check.md: an ordering whose result carries meaning is allow-listed.
test("accepts an ordering on the allow-list of meaningful orderings", () => {
  const result = runCheckOver({
    "image-analysis/image-diff-service.ts": "export const listed = (rows: { path: string }[]) => [...rows].sort((left, right) => (left.path < right.path ? -1 : 1));\n",
    "image-analysis/layer-waste-analysis.ts": "export const listed = (rows: { size: number }[]) => [...rows].sort((left, right) => right.size - left.size);\n",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed/i);
});

// list-order-conformance-check.md: the escape hatch, on the line and on the line above.
test("accepts an ordering carrying a list-order-exception comment", () => {
  const onTheLineAbove = runCheckOver({
    "builders/builders-service.ts": [
      "// list-order-exception: the reason it cannot go through the shared rule",
      "export const listed = (rows: number[]) => [...rows].sort((left, right) => left - right);",
      "",
    ].join("\n"),
  });
  const onItsOwnLine = runCheckOver({
    "builders/builders-service.ts": "export const listed = (rows: number[]) => [...rows].sort((left, right) => left - right); // list-order-exception: the reason\n",
  });

  assert.equal(onTheLineAbove.status, 0, onTheLineAbove.stderr);
  assert.equal(onItsOwnLine.status, 0, onItsOwnLine.stderr);
});

// list-order-conformance-check.md: comments and literals take no part.
test("ignores an ordering merely named in a comment or inside a literal", () => {
  const result = runCheckOver({
    "system/prune-service.ts": [
      "// The rows arrive ordered; a localeCompare here would be a second rule.",
      'export const hint = "call .sort() or rows.localeCompare(other) at your peril";',
      "export const pattern = /\\.sort\\(\\)/;",
      "",
    ].join("\n"),
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed/i);
});

// list-order-conformance-check.md: "all seven have adopted the rule, so it is empty: every ordering
// written in a service is now a violation, none of them a pending adoption" — the closing of the
// self-expiry, seen from the outside (REQ-23).
test("reports a service that still writes an ordering of its own, the awaiting-adoption list being empty", () => {
  const result = runCheckOver({
    "contexts/contexts-service.ts": anOrderingOfItsOwn,
    "registries/registries-service.ts": anOrderingOfItsOwn,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /server\/src\/contexts\/contexts-service\.ts:1\b/);
  assert.match(result.stderr, /server\/src\/registries\/registries-service\.ts:1\b/);
  assert.match(result.stderr, /a comparator written inline/);
});

// list-order-conformance-check.md: the awaiting-adoption list is self-expiring, and "the mechanism
// stays, and an entry added to it still cannot outlive its adoption".
test("reports an awaiting-adoption entry whose file no longer orders anything of its own", () => {
  const result = runCheckWithAwaitingAdoption(["plugins/cli-plugins-service.ts"], {
    "plugins/cli-plugins-service.ts": orderedThroughTheSharedRule,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /server\/src\/plugins\/cli-plugins-service\.ts/);
  assert.match(result.stderr, /remove/i);
});

// The other half of the mechanism: while an entry is on the list, the ordering its file still
// carries is tolerated rather than reported.
test("tolerates the ordering of a file that is on the awaiting-adoption list", () => {
  const result = runCheckWithAwaitingAdoption(["plugins/cli-plugins-service.ts"], {
    "plugins/cli-plugins-service.ts": anOrderingOfItsOwn,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed/i);
});

// list-order-conformance-check.md: a violation never suppresses another.
test("lists every violation of a pass, at most one per line of source, with their count", () => {
  const result = runCheckOver({
    "containers/containers-service.ts": [
      "export const byName = (rows: string[]) => [...rows].sort();",
      "export const byLabel = (rows: { name: string }[]) => [...rows].sort((left, right) => left.name.localeCompare(right.name));",
      "",
    ].join("\n"),
    "networks/networks-service.ts": 'export const collator = new Intl.Collator("en-US");\n',
  });

  assert.equal(result.status, 1);
  const violationLines = result.stderr.split("\n").filter((line) => /server\/src\/\S+\.ts:\d+/.test(line));
  assert.equal(violationLines.length, 3, result.stderr);
  assert.equal(violationLines.filter((line) => line.includes("containers-service.ts:1")).length, 1);
  assert.equal(violationLines.filter((line) => line.includes("containers-service.ts:2")).length, 1);
  assert.equal(violationLines.filter((line) => line.includes("networks-service.ts:1")).length, 1);
  assert.match(result.stderr, /\b3\b/);
  assert.match(result.stderr, /list-order/);
});

// REQ-1: the repository's own source tree conforms, which is what the check is for.
test("passes over the repository's own server source tree", () => {
  const run = spawnSync(process.execPath, [realScript], { encoding: "utf8" });

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /passed/i);
});

// list-order-conformance-check.md: "The allow-list is explicit and small" — an entry exempting a
// file the server no longer has exempts nothing and hides the next ordering written at that path.
// The one that pinned a task history inside a swarm service left with the file
// (plan-docker_management_app-swarm_removal/REQ-5, REQ-13).
test("every allow-listed ordering names a file the server source tree still holds", () => {
  const source = readFileSync(realScript, "utf8");
  const allowList = source.slice(source.indexOf("const meaningfulOrderings"), source.indexOf("const awaitingAdoption"));
  const files = [...allowList.matchAll(/file: "([^"]+)"/g)].map((match) => match[1] as string);

  assert.ok(files.length > 0, "the allow-list must still be readable from the check");
  for (const file of files) {
    assert.ok(
      existsSync(new URL(`../../src/${file}`, import.meta.url).pathname),
      `the allow-list exempts server/src/${file}, which the source tree does not hold`,
    );
  }
});
