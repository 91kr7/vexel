// Fails the build when a list ordering is written anywhere under server/src/
// outside the ordering area (server/src/list-order/). The rule that orders lists
// of named objects exists in exactly one place
// (plan-docker_management_app-list_ordering/REQ-1), and without this guard
// that is true on the day it is written and decays silently afterwards: the
// defect being fixed is precisely seven services having grown one comparison
// each while six grew none.
// Wired into `npm run test` (server workspace) and runnable on its own as
// `npm run lint:list-order -w server`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const serverRoot = new URL("..", import.meta.url).pathname;
const srcRoot = join(serverRoot, "src");
const orderingArea = join(srcRoot, "list-order");
const exceptionMarker = "list-order-exception:";

// The orderings whose result carries meaning: a path, a size ranking, a
// chronology. None of them is a name comparison, and each is named individually
// so that widening this list is a decision rather than an accident. `only`, when
// present, pins the entry to that comparison within the file instead of
// exempting the whole of it.
const meaningfulOrderings = [
  { file: "image-analysis/image-diff-service.ts", reason: "diff tree, path-ordered" },
  { file: "image-analysis/filesystem-extraction-service.ts", reason: "filesystem tree, path-ordered" },
  { file: "image-analysis/secret-pattern-scan.ts", reason: "findings, path-ordered" },
  { file: "image-analysis/layer-duplicate-detection.ts", reason: "duplicates, ranked by wasted size" },
  { file: "image-analysis/layer-waste-analysis.ts", reason: "wasted files, ranked by size" },
  { file: "swarm/swarm-services-service.ts", reason: "task history, newest first", only: /timestamp/ },
];

// The services that ordered by name before the shared rule existed and adopt it
// in batch 5 of plan-docker_management_app-list_ordering. Temporary by
// construction: an entry that no longer carries an ordering of its own is itself
// reported, so the list empties as the adoption lands and cannot outlive it.
const awaitingAdoption = [
  "swarm/swarm-services-service.ts",
  "swarm/swarm-stacks-service.ts",
  "swarm/swarm-nodes-service.ts",
  "swarm/swarm-secrets-service.ts",
  "plugins/daemon-plugins-service.ts",
  "plugins/cli-plugins-service.ts",
  "registries/registries-service.ts",
];

/** @type {string[]} */
const violations = [];

function collectSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (full === orderingArea || full.startsWith(orderingArea + sep)) continue;
    const info = statSync(full);
    if (info.isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (extname(entry) === ".ts") out.push(full);
  }
  return out;
}

// A copy of the source in which comments and the contents of string, template
// and regular-expression literals are blanked out, newlines kept. Offsets and
// line numbers are therefore those of the original, and a comparison named in a
// comment or quoted in a message is not mistaken for one that runs.
function blankNonCode(content) {
  const out = content.split("");
  const blank = (from, to) => {
    for (let index = from; index < to && index < out.length; index += 1) {
      if (out[index] !== "\n") out[index] = " ";
    }
  };

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === "/" && next === "/") {
      const end = content.indexOf("\n", index);
      const stop = end === -1 ? content.length : end;
      blank(index, stop);
      index = stop;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = content.indexOf("*/", index + 2);
      const stop = end === -1 ? content.length : end + 2;
      blank(index, stop);
      index = stop - 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      let scan = index + 1;
      while (scan < content.length && content[scan] !== char) {
        if (content[scan] === "\\") scan += 1;
        scan += 1;
      }
      blank(index + 1, scan);
      index = scan;
    }
  }

  return out.join("");
}

// The text between the parentheses opened at `openIndex`, so a finding can be
// judged on the comparison it actually is rather than on the line it sits on.
function parenthesizedText(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  return source.slice(openIndex + 1);
}

function lineOf(content, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (content[index] === "\n") line += 1;
  return line;
}

// Every ordering decided on the spot. It fails closed: a comparator written
// inline is reported whatever it compares, because judging what a comparator
// sorts by needs the types the guard does not have — and a name comparison is
// what an inline comparator most often turns out to be.
function findOrderings(content) {
  const source = blankNonCode(content);
  const findings = [];

  for (const match of source.matchAll(/\.(?:sort|toSorted)\s*\(/g)) {
    const openIndex = match.index + match[0].length - 1;
    const argument = parenthesizedText(source, openIndex).trim();
    const isInlineComparator = argument.startsWith("(") || /^(?:async\s+)?function\b/.test(argument);
    if (argument.length > 0 && !isInlineComparator) continue;
    findings.push({
      offset: match.index,
      context: argument,
      message:
        argument.length === 0
          ? "a comparator-less sort, which compares names as text"
          : "a comparator written inline",
    });
  }

  for (const match of source.matchAll(/\blocaleCompare\s*\(/g)) {
    findings.push({ offset: match.index, context: "", message: "a `localeCompare` name comparison" });
  }

  for (const match of source.matchAll(/\bIntl\s*\.\s*Collator\b/g)) {
    findings.push({ offset: match.index, context: "", message: "a collator of its own" });
  }

  return findings;
}

function isExempted(lines, line, finding, allowed) {
  const ownLine = lines[line - 1] ?? "";
  const previousLine = lines[line - 2] ?? "";
  if (ownLine.includes(exceptionMarker) || previousLine.includes(exceptionMarker)) return true;
  const context = finding.context.length > 0 ? finding.context : ownLine;
  return allowed.some((entry) => entry.only === undefined || entry.only.test(context));
}

for (const filePath of collectSourceFiles(srcRoot)) {
  const relativePath = relative(srcRoot, filePath).split(sep).join("/");
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const allowed = meaningfulOrderings.filter((entry) => entry.file === relativePath);

  const reported = new Set();
  for (const finding of findOrderings(content)) {
    const line = lineOf(content, finding.offset);
    if (reported.has(line)) continue;
    if (isExempted(lines, line, finding, allowed)) continue;
    reported.add(line);
    if (awaitingAdoption.includes(relativePath)) continue;
    violations.push(
      `server/src/${relativePath}:${line} — ordering written outside server/src/list-order/: ${finding.message}`,
    );
  }

  if (awaitingAdoption.includes(relativePath) && reported.size === 0) {
    violations.push(
      `server/src/${relativePath} — orders nothing of its own any more: remove it from the awaitingAdoption list of ${relative(serverRoot, process.argv[1])}`,
    );
  }
}

if (violations.length > 0) {
  console.error("List ordering conformance check failed:\n");
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(
    `\n${violations.length} violation(s). Order lists through server/src/list-order/list-order.ts; an ordering whose result carries meaning goes on the check's own allow-list, or carries a "${exceptionMarker}" comment.`,
  );
  process.exit(1);
}

console.log("List ordering conformance check passed.");
