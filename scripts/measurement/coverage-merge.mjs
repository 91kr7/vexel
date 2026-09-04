// Merged line by line: lines are the one coordinate the three transformations
// behind these suites share (`specs/coverage-runner.md`).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import istanbulCoverage from "istanbul-lib-coverage";
import { repositoryRoot } from "./report-store.mjs";

const { createCoverageMap } = istanbulCoverage;

const c8Command = join(repositoryRoot, "node_modules", "c8", "bin", "c8.js");
const sourceExtensions = [".ts", ".tsx"];

const sourceTrees = [
  { workspace: "client", directory: join(repositoryRoot, "client", "src") },
  { workspace: "server", directory: join(repositoryRoot, "server", "src") },
];

function workspaceOf(path) {
  return sourceTrees.find((tree) => path.startsWith(tree.directory + sep))?.workspace ?? null;
}

function shown(path) {
  return relative(repositoryRoot, path).split(sep).join("/");
}

function sourceFilesOf(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) sourceFilesOf(path, found);
    else if (sourceExtensions.some((extension) => entry.name.endsWith(extension)) && !entry.name.endsWith(".d.ts")) found.push(path);
  }
  return found;
}

function readIstanbulReport(path) {
  if (!existsSync(path)) return null;
  const report = JSON.parse(readFileSync(path, "utf8"));
  return Object.keys(report).length > 0 ? report : null;
}

function istanbulReportOfRawData(rawDirectory, reportDirectory) {
  if (!existsSync(rawDirectory) || readdirSync(rawDirectory).length === 0) return null;
  const run = spawnSync(
    process.execPath,
    [
      c8Command,
      "report",
      "--temp-directory", rawDirectory,
      "--reports-dir", reportDirectory,
      "--reporter", "json",
      "--clean=false",
    ],
    { cwd: repositoryRoot, stdio: ["ignore", "ignore", "inherit"] },
  );
  if (run.status !== 0) throw new Error(`c8 could not read the coverage data in ${shown(rawDirectory)}`);
  return readIstanbulReport(join(reportDirectory, "coverage-final.json"));
}

export function readCoverageOf(contribution, rawRoot, workRoot) {
  const directory = join(rawRoot, contribution.id);
  return contribution.format === "istanbul"
    ? readIstanbulReport(join(directory, "coverage-final.json"))
    : istanbulReportOfRawData(directory, join(workRoot, contribution.id));
}

function linesOf(report) {
  const perFile = new Map();
  const map = createCoverageMap(report);
  for (const file of map.files()) {
    if (!workspaceOf(file)) continue;
    const hits = new Map();
    for (const [line, count] of Object.entries(map.fileCoverageFor(file).getLineCoverage())) {
      hits.set(Number(line), count);
    }
    if (hits.size > 0) perFile.set(file, hits);
  }
  return perFile;
}

export function mergeCoverage(contributions) {
  const merged = new Map();
  const counted = contributions.map((contribution) => {
    const perFile = contribution.coverage ? linesOf(contribution.coverage) : new Map();
    let executedFiles = 0;
    for (const [file, hits] of perFile) {
      if ([...hits.values()].some((count) => count > 0)) executedFiles += 1;
      const lines = merged.get(file) ?? new Map();
      merged.set(file, lines);
      for (const [line, count] of hits) lines.set(line, (lines.get(line) ?? 0) + count);
    }
    return { ...contribution, files: perFile.size, executedFiles };
  });

  const files = [];
  for (const tree of sourceTrees) {
    for (const path of sourceFilesOf(tree.directory).sort()) {
      const lines = merged.get(path);
      const known = lines ? lines.size : 0;
      const covered = lines ? [...lines.values()].filter((count) => count > 0).length : 0;
      files.push({ path: shown(path), workspace: tree.workspace, executed: Boolean(lines), known, covered });
    }
  }

  const perWorkspace = sourceTrees.map((tree) => {
    const own = files.filter((file) => file.workspace === tree.workspace);
    const known = own.reduce((total, file) => total + file.known, 0);
    const covered = own.reduce((total, file) => total + file.covered, 0);
    return {
      workspace: tree.workspace,
      known,
      covered,
      percent: known === 0 ? 0 : (covered / known) * 100,
      notExecuted: own.filter((file) => !file.executed).length,
    };
  });

  return { contributions: counted, files, workspaces: perWorkspace };
}
