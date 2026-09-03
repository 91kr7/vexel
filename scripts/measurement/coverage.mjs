// `npm run coverage`: the four suites, merged into one figure per workspace and
// per source file (`.sdd/modules/measurement/specs/coverage-runner.md`).
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { readCoverageOf, mergeCoverage } from "./coverage-merge.mjs";
import { contributionsWithNoData, printSummary, reportOf } from "./coverage-summary.mjs";
import { repositoryRoot, writeReport } from "./report-store.mjs";

const collected = join(repositoryRoot, ".coverage");
const rawRoot = join(collected, "raw");
const workRoot = join(collected, "istanbul");

const withSourceMaps = [process.env.NODE_OPTIONS, "--enable-source-maps"].filter(Boolean).join(" ");

const suites = [
  {
    command: ["run", "test:unit", "-w", "client", "-s"],
    env: { VEXEL_COVERAGE_DIR: rawRoot },
    contributions: [{ id: "client-unit", label: "the client unit tests", format: "istanbul" }],
  },
  {
    command: ["run", "test:unit", "-w", "server", "-s"],
    env: { NODE_V8_COVERAGE: join(rawRoot, "server-unit"), NODE_OPTIONS: withSourceMaps },
    contributions: [{ id: "server-unit", label: "the server unit tests", format: "raw" }],
  },
  {
    command: ["run", "test:api", "-w", "server", "-s"],
    env: { NODE_V8_COVERAGE: join(rawRoot, "server-api"), NODE_OPTIONS: withSourceMaps },
    contributions: [{ id: "server-api", label: "the daemon-backed suite", format: "raw" }],
  },
  {
    command: ["run", "test:e2e", "-w", "client", "-s", "--", "--quiet"],
    env: { VEXEL_COVERAGE_DIR: rawRoot },
    contributions: [
      { id: "e2e-server", label: "the browser-driven suite, the server it drives", format: "raw" },
      { id: "e2e-browser", label: "the browser-driven suite, the code the browser runs", format: "raw" },
    ],
  },
];

function run(command, env = {}) {
  return spawnSync("npm", command, { cwd: repositoryRoot, stdio: "inherit", env: { ...process.env, ...env } }).status;
}

const startedAt = new Date();
rmSync(collected, { recursive: true, force: true });

const outcomes = new Map();
try {
  for (const suite of suites) {
    outcomes.set(suite, run(suite.command, suite.env));
  }
} finally {
  // The daemon-backed passes leave the run's registry container up on purpose;
  // nothing outlives the measurement (plan-test_coverage_code_quality/REQ-15).
  run(["run", "test:sweep", "-w", "server", "-s"]);
}

const merged = mergeCoverage(
  suites.flatMap((suite) =>
    suite.contributions.map((contribution) => ({
      ...contribution,
      suiteFailed: outcomes.get(suite) !== 0,
      coverage: readCoverageOf(contribution, rawRoot, workRoot),
    }))),
);

const measured = { at: startedAt, took: Date.now() - startedAt.getTime() };
printSummary(merged, measured);
console.log(`\n  report → ${writeReport("coverage", reportOf(merged, measured))}\n`);

const silent = contributionsWithNoData(merged);
if (silent.length > 0) {
  console.error(`Coverage failed: ${silent.map((contribution) => contribution.label).join(", ")} ran and recorded no coverage data.\n`);
  process.exit(1);
}
