// `npm run quality`: the rule pass and the duplication pass over the same files,
// merged into one report (`.sdd/modules/measurement/specs/quality-runner.md`).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { duplicationArguments, duplicationReportName } from "./quality-duplication.mjs";
import { excludedBy } from "./quality-exclusions.mjs";
import { printSummary, reportOf, summarize } from "./quality-summary.mjs";
import { repositoryRoot, writeReport } from "./report-store.mjs";
import { scopeRoots } from "./quality-scope.mjs";

const collected = join(repositoryRoot, ".quality");
const eslintReport = join(collected, "eslint.json");
const duplicationReport = join(collected, duplicationReportName);
const binary = (name) => join(repositoryRoot, "node_modules", ".bin", name);

const here = (path) => relative(repositoryRoot, path);

function run(command, argv, { quiet = false } = {}) {
  return spawnSync(command, argv, { cwd: repositoryRoot, stdio: ["ignore", quiet ? "ignore" : "inherit", "inherit"] }).status;
}

function read(path) {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function rulePass() {
  // ESLint exits 1 on findings, which is the normal outcome here: only a fatal
  // exit (2) or an unreadable report says the pass did not run.
  const status = run(binary("eslint"), [
    "--no-config-lookup",
    "--config", here(fileURLToPath(new URL("quality-rules.config.mjs", import.meta.url))),
    "--format", "json",
    "--output-file", here(eslintReport),
    ...scopeRoots,
  ]);
  const report = status === 2 ? undefined : read(eslintReport);
  if (report === undefined) return undefined;
  return report.map((file) => ({ path: here(file.filePath), messages: file.messages }));
}

function duplicationPass() {
  // Its console output is the report this command writes itself, plus funding notices.
  run(binary("jscpd"), duplicationArguments(here(collected)), { quiet: true });
  const report = read(duplicationReport);
  if (report === undefined) return undefined;
  const clones = report.duplicates.map((duplicate) => ({
    lines: duplicate.lines,
    tokens: duplicate.tokens,
    first: { path: here(duplicate.firstFile.name), start: duplicate.firstFile.start, end: duplicate.firstFile.end },
    second: { path: here(duplicate.secondFile.name), start: duplicate.secondFile.start, end: duplicate.secondFile.end },
  })).sort((one, other) => other.lines - one.lines);
  const perFile = new Map();
  for (const clone of clones) {
    for (const side of [clone.first, clone.second]) {
      const marked = perFile.get(side.path) ?? { lines: new Set(), clones: 0 };
      for (let line = side.start; line <= side.end; line += 1) marked.lines.add(line);
      marked.clones += 1;
      perFile.set(side.path, marked);
    }
  }
  return {
    clones,
    duplicatedLinesOf: (path) => {
      const marked = perFile.get(path);
      return { lines: marked?.lines.size ?? 0, clones: marked?.clones ?? 0 };
    },
  };
}

const startedAt = new Date();
rmSync(collected, { recursive: true, force: true });
mkdirSync(collected, { recursive: true });

const eslintFiles = rulePass();
const duplication = duplicationPass();

const incomplete = [
  ...(eslintFiles === undefined ? ["the rule pass"] : []),
  ...(duplication === undefined ? ["the duplication pass"] : []),
];
if (incomplete.length > 0) {
  console.error(`\nQuality failed: ${incomplete.join(" and ")} did not complete.\n`);
  process.exit(1);
}

const lineCounts = new Map();
const linesOf = (path) => {
  if (!lineCounts.has(path)) lineCounts.set(path, readFileSync(join(repositoryRoot, path), "utf8").split("\n").length);
  return lineCounts.get(path);
};

const summary = summarize({ eslintFiles, duplication, linesOf, excludedBy });
const measured = { at: startedAt, took: Date.now() - startedAt.getTime() };
printSummary(summary, measured);
console.log(`\n  report → ${writeReport("quality", reportOf(summary, measured))}\n`);
