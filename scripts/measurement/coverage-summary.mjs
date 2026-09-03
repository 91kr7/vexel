// What a coverage run says: the printed summary, the report file, and the one
// failure the command has (plan-test_coverage_code_quality/REQ-5).
const percent = (value) => `${value.toFixed(1)}%`;

const coverageOf = (file) => (file.executed ? percent((file.covered / file.known) * 100) : "not executed");

function duration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

const outcomeOf = (contribution) => (contribution.suiteFailed ? "the suite failed" : "ok");

const sourceFiles = (count) => `${count} source file${count === 1 ? "" : "s"} no suite executed`;

// The run's own local time, the one the report file is named after.
function moment(at) {
  const part = (value) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${part(at.getMonth() + 1)}-${part(at.getDate())} ${part(at.getHours())}:${part(at.getMinutes())}`;
}

export function contributionsWithNoData(merged) {
  return merged.contributions.filter((contribution) => contribution.executedFiles === 0);
}

export function printSummary(merged, { at, took }) {
  const width = Math.max(...merged.contributions.map((contribution) => contribution.label.length));
  console.log(`\nCoverage — ${moment(at)}, ${duration(took)}\n`);
  for (const workspace of merged.workspaces) {
    const missing = workspace.notExecuted === 0 ? "" : `, ${sourceFiles(workspace.notExecuted)}`;
    console.log(`  ${workspace.workspace.padEnd(8)} ${percent(workspace.percent).padStart(6)}  (${workspace.covered}/${workspace.known} lines${missing})`);
  }
  console.log("");
  for (const contribution of merged.contributions) {
    console.log(`  ${contribution.label.padEnd(width)}  ${outcomeOf(contribution).padEnd(16)} ${contribution.executedFiles} files`);
  }
}

export function reportOf(merged, { at, took }) {
  const lines = [
    `# Coverage — ${moment(at)}`,
    "",
    `Run of \`npm run coverage\`, ${duration(took)}. One figure per source file: the lines every suite`,
    "of this repository executed, over the lines those suites know the file has.",
    "",
    "## Workspaces",
    "",
    "| Workspace | Lines covered | Lines known | Coverage | Files no suite executed |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...merged.workspaces.map((workspace) =>
      `| ${workspace.workspace} | ${workspace.covered} | ${workspace.known} | ${percent(workspace.percent)} | ${workspace.notExecuted} |`),
    "",
    "## Suites",
    "",
    "| Suite | Outcome | Files with an executed line |",
    "| --- | --- | ---: |",
    ...merged.contributions.map((contribution) =>
      `| ${contribution.label} | ${outcomeOf(contribution)} | ${contribution.executedFiles} |`),
    "",
    "## Files",
    "",
    "A file no suite loaded carries no known lines: it is named here rather than counted, so it",
    "cannot raise or lower the figure of its workspace by being absent.",
    "",
    "| File | Lines covered | Lines known | Coverage |",
    "| --- | ---: | ---: | ---: |",
    ...merged.files.map((file) =>
      `| \`${file.path}\` | ${file.covered} | ${file.executed ? file.known : "—"} | ${coverageOf(file)} |`),
    "",
  ];
  return lines.join("\n");
}
