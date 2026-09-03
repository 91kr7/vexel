// What a mutation run says: the printed summary and the report file
// (plan-test_coverage_code_quality/REQ-6).
const CAUGHT = ["Killed", "Timeout"];
const NOT_CAUGHT = ["Survived", "NoCoverage"];

const percent = (value) => `${value.toFixed(1)}%`;

// A replacement is source text: it can hold the two characters a markdown table
// cell cannot, a pipe and a backtick.
function code(text) {
  const cell = (text.length > 120 ? `${text.slice(0, 120)}…` : text).replaceAll("|", "\\|");
  return cell.includes("`") ? `\`\` ${cell} \`\`` : `\`${cell}\``;
}

const scoreOf = (figures) => (figures.tested === 0 ? undefined : (figures.caught / figures.tested) * 100);

const printedScore = (figures) => (scoreOf(figures) === undefined ? "—" : percent(scoreOf(figures)));

function duration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  return `${parts[0] > 0 ? `${parts[0]}h ` : ""}${parts[1]}m ${String(parts[2]).padStart(2, "0")}s`;
}

// The run's own local time, the one the report file is named after.
function moment(at) {
  const part = (value) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${part(at.getMonth() + 1)}-${part(at.getDate())} ${part(at.getHours())}:${part(at.getMinutes())}`;
}

// A report of one workspace can never be read as a score for both.
function coveredNote(workspaces, areas) {
  const covered = workspaces.map((workspace) => workspace.workspace);
  const missing = areas.filter((area) => !covered.includes(area));
  if (missing.length === 0) return ["This run covered the unit trees of both workspaces."];
  return [
    `This run covered the ${covered.join(" and ")} unit tree alone. The ${missing.join(" and ")} one was not`,
    "run, is absent from every table below, and this report is no score for it.",
  ];
}

const outcomeOf = (workspace) => {
  if (workspace.passFailed) return "the pass did not complete";
  if (workspace.tested === 0) return "no change was tested";
  return `${workspace.caught} of ${workspace.tested} changes caught, ${workspace.notCaught} not caught, over ${workspace.files} file${workspace.files === 1 ? "" : "s"}`;
};

function figuresOf(mutants) {
  const caught = mutants.filter((mutant) => CAUGHT.includes(mutant.status)).length;
  const notCaught = mutants.filter((mutant) => NOT_CAUGHT.includes(mutant.status)).length;
  return { caught, notCaught, tested: caught + notCaught };
}

const uncaughtOf = (mutants) =>
  mutants
    .filter((mutant) => NOT_CAUGHT.includes(mutant.status))
    .map((mutant) => ({
      line: mutant.location.start.line,
      column: mutant.location.start.column,
      change: mutant.mutatorName,
      replacement: (mutant.replacement ?? "").replace(/\s+/g, " ").trim(),
      status: mutant.status,
    }))
    .sort((one, other) => one.line - other.line || one.column - other.column);

export function summarize(passes) {
  const files = passes.flatMap((pass) =>
    Object.entries(pass.stryker?.files ?? {}).map(([path, file]) => ({
      path: `${pass.workspace}/${path}`,
      ...figuresOf(file.mutants),
      uncaught: uncaughtOf(file.mutants),
    })));
  const workspaces = passes.map((pass) => {
    const own = files.filter((file) => file.path.startsWith(`${pass.workspace}/`));
    return {
      workspace: pass.workspace,
      label: pass.label,
      passFailed: pass.passFailed || pass.stryker === undefined,
      files: own.length,
      ...figuresOf(Object.values(pass.stryker?.files ?? {}).flatMap((file) => file.mutants)),
    };
  });
  return { workspaces, files: files.sort((one, other) => one.path.localeCompare(other.path)) };
}

export function printSummary({ workspaces }, { at, took, areas }) {
  const partial = workspaces.length < areas.length ? ` — ${workspaces.map((workspace) => workspace.workspace).join(", ")} only` : "";
  console.log(`\nMutation — ${moment(at)}, ${duration(took)}${partial}\n`);
  for (const workspace of workspaces) {
    console.log(`  ${workspace.workspace.padEnd(8)} ${printedScore(workspace).padStart(6)}   ${outcomeOf(workspace)}`);
  }
}

export function reportOf({ workspaces, files }, { at, took, areas }) {
  const withUncaught = files.filter((file) => file.uncaught.length > 0);
  return [
    `# Mutation — ${moment(at)}`,
    "",
    `Run of \`npm run mutation\`, ${duration(took)}. Stryker changed the sources on purpose, one change at`,
    "a time, and ran the unit tests against each: a change no test failed on is a change no test caught.",
    "The score is the share of caught changes among those the run tested.",
    "",
    ...coveredNote(workspaces, areas),
    "",
    "## Workspaces",
    "",
    "| Workspace | Unit tests | Changes caught | Changes not caught | Score | Files |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...workspaces.map((workspace) =>
      `| ${workspace.workspace} | ${workspace.passFailed ? "the pass did not complete" : "ran"} | ${workspace.caught} | ${workspace.notCaught} | ${printedScore(workspace)} | ${workspace.files} |`),
    "",
    "## Files",
    "",
    "| File | Changes caught | Changes not caught | Score |",
    "| --- | ---: | ---: | ---: |",
    ...files.map((file) => `| \`${file.path}\` | ${file.caught} | ${file.notCaught} | ${printedScore(file)} |`),
    "",
    "## Changes no test caught",
    "",
    "`Survived` means the tests ran the changed line and passed anyway; `not covered` means no test ran",
    "it at all.",
    "",
    ...(withUncaught.length === 0 ? ["Every change the run tested was caught.", ""] : []),
    ...withUncaught.flatMap((file) => [
      `### \`${file.path}\``,
      "",
      "| Line | Change | Becomes | Outcome |",
      "| ---: | --- | --- | --- |",
      ...file.uncaught.map((mutant) =>
        `| ${mutant.line}:${mutant.column} | ${mutant.change} | ${code(mutant.replacement)} | ${mutant.status === "Survived" ? "survived" : "not covered"} |`),
      "",
    ]),
  ].join("\n");
}
