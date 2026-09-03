// `npm run mutation [-- client|server]`: Stryker over the unit trees, one report
// for the run (`.sdd/modules/measurement/specs/mutation-runner.md`).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { printSummary, reportOf, summarize } from "./mutation-summary.mjs";
import { repositoryRoot, writeReport } from "./report-store.mjs";

const collected = join(repositoryRoot, ".mutation");
const strykerCommand = join(repositoryRoot, "node_modules", ".bin", "stryker");

const passes = [
  { workspace: "client", label: "the client unit tests" },
  { workspace: "server", label: "the server unit tests" },
];

const areas = passes.map((pass) => pass.workspace);
const asked = process.argv.slice(2);
const unknown = asked.filter((area) => !areas.includes(area));
if (unknown.length > 0) {
  console.error(`\nUnknown area: ${unknown.join(", ")}. npm run mutation takes ${areas.join(" or ")}, or no argument for both.\n`);
  process.exit(1);
}
const chosen = asked.length === 0 ? passes : passes.filter((pass) => asked.includes(pass.workspace));

function run({ workspace }) {
  const directory = join(repositoryRoot, workspace);
  const status = spawnSync(strykerCommand, ["run", "stryker.config.mjs"], { cwd: directory, stdio: "inherit" }).status;
  // Stryker writes one setup file per worker beside its configuration and
  // removes them only when it exits cleanly.
  for (const name of readdirSync(directory).filter((name) => /^stryker-setup-\d+\.js$/.test(name))) {
    rmSync(join(directory, name), { force: true });
  }
  return status;
}

const startedAt = new Date();
mkdirSync(collected, { recursive: true });

const summary = summarize(chosen.map((pass) => {
  const strykerReport = join(collected, `${pass.workspace}.json`);
  // Only this pass's own report goes: what else lives here is the incremental
  // file the next run reads to re-test nothing it already knows about.
  rmSync(strykerReport, { force: true });
  const failed = run(pass) !== 0;
  return {
    ...pass,
    passFailed: failed,
    stryker: existsSync(strykerReport) ? JSON.parse(readFileSync(strykerReport, "utf8")) : undefined,
  };
}));

const measured = { at: startedAt, took: Date.now() - startedAt.getTime(), areas };
printSummary(summary, measured);
console.log(`\n  report → ${writeReport("mutation", reportOf(summary, measured))}\n`);

const incomplete = summary.workspaces.filter((workspace) => workspace.passFailed);
if (incomplete.length > 0) {
  console.error(`Mutation failed: ${incomplete.map((workspace) => workspace.label).join(", ")} did not complete.\n`);
  process.exit(1);
}
