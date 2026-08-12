import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

// The list-order conformance check (list-order-conformance-check.md), run as a
// black box over a source tree of the test's own: what it reports, what it
// accepts, and the self-expiry of its awaiting-adoption list. The script
// resolves the tree it scans from its own location, so each case copies it into
// a throwaway root next to a fabricated `src/`, and removes the root afterwards.

const realScript = new URL("../../scripts/check-list-order-conformance.mjs", import.meta.url).pathname;

// The services the check tolerates until batch 5 converts them, each carrying
// the name ordering it has today; a case that omits one is asserting about that
// omission.
const awaitingAdoptionFiles: Record<string, string> = {
  "swarm/swarm-services-service.ts": "export const listed = (rows: string[]) => [...rows].sort((a, b) => a.localeCompare(b));\n",
  "swarm/swarm-stacks-service.ts": "export const listed = (rows: string[]) => [...rows].sort((a, b) => a.localeCompare(b));\n",
  "swarm/swarm-nodes-service.ts": "export const listed = (rows: string[]) => [...rows].sort((a, b) => a.localeCompare(b));\n",
  "swarm/swarm-secrets-service.ts": "export const listed = (rows: string[]) => [...rows].sort((a, b) => a.localeCompare(b));\n",
  "plugins/daemon-plugins-service.ts": "export const listed = (rows: string[]) => [...rows].sort((a, b) => a.localeCompare(b));\n",
  "plugins/cli-plugins-service.ts": "export const listed = (rows: string[]) => [...rows].sort((a, b) => a.localeCompare(b));\n",
  "registries/registries-service.ts": "export const listed = (rows: string[]) => [...rows].sort((a, b) => a.localeCompare(b));\n",
};

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

function runCheckOverTreeWith(files: Record<string, string>): CheckResult {
  return runCheckOver({ ...awaitingAdoptionFiles, ...files });
}

// REQ-1: a tree in which every ordering goes through the shared rule passes.
test("exits zero and says so when no ordering is written outside the ordering area", () => {
  const result = runCheckOverTreeWith({ "containers/containers-service.ts": orderedThroughTheSharedRule });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed/i);
  assert.equal(result.stderr, "");
});

// REQ-1: a comparator written inline is reported, with the file and the line.
test("reports a comparator written inline in a sort", () => {
  const result = runCheckOverTreeWith({
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
  const result = runCheckOverTreeWith({
    "images/images-service.ts": "export const listed = (rows: string[]) => rows.toSorted((left, right) => (left < right ? -1 : 1));\n",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /server\/src\/images\/images-service\.ts:1\b/);
  assert.match(result.stderr, /a comparator written inline/);
});

// REQ-1: a sort with no comparator compares names as text and is reported.
test("reports a comparator-less sort and a comparator-less toSorted", () => {
  const sortResult = runCheckOverTreeWith({
    "volumes/volumes-service.ts": "export const listed = (rows: string[]) => [...rows].sort();\n",
  });
  const toSortedResult = runCheckOverTreeWith({
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
  const result = runCheckOverTreeWith({
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
  const result = runCheckOverTreeWith({
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
  const result = runCheckOverTreeWith({
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
  const result = runCheckOverTreeWith({
    "image-analysis/image-diff-service.ts": "export const listed = (rows: { path: string }[]) => [...rows].sort((left, right) => (left.path < right.path ? -1 : 1));\n",
    "image-analysis/layer-waste-analysis.ts": "export const listed = (rows: { size: number }[]) => [...rows].sort((left, right) => right.size - left.size);\n",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed/i);
});

// list-order-conformance-check.md: the escape hatch, on the line and on the line above.
test("accepts an ordering carrying a list-order-exception comment", () => {
  const onTheLineAbove = runCheckOverTreeWith({
    "builders/builders-service.ts": [
      "// list-order-exception: the reason it cannot go through the shared rule",
      "export const listed = (rows: number[]) => [...rows].sort((left, right) => left - right);",
      "",
    ].join("\n"),
  });
  const onItsOwnLine = runCheckOverTreeWith({
    "builders/builders-service.ts": "export const listed = (rows: number[]) => [...rows].sort((left, right) => left - right); // list-order-exception: the reason\n",
  });

  assert.equal(onTheLineAbove.status, 0, onTheLineAbove.stderr);
  assert.equal(onItsOwnLine.status, 0, onItsOwnLine.stderr);
});

// list-order-conformance-check.md: comments and literals take no part.
test("ignores an ordering merely named in a comment or inside a literal", () => {
  const result = runCheckOverTreeWith({
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

// list-order-conformance-check.md: the awaiting-adoption list is self-expiring.
test("reports an awaiting-adoption entry whose file no longer orders anything of its own", () => {
  const adopted = { ...awaitingAdoptionFiles };
  adopted["plugins/cli-plugins-service.ts"] = orderedThroughTheSharedRule;
  const result = runCheckOver(adopted);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /server\/src\/plugins\/cli-plugins-service\.ts/);
  assert.match(result.stderr, /remove/i);
});

// list-order-conformance-check.md: a violation never suppresses another.
test("lists every violation of a pass, at most one per line of source, with their count", () => {
  const result = runCheckOverTreeWith({
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
