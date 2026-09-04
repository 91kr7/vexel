// What a quality run says: the printed summary and the report file
// (plan-test_coverage_code_quality/REQ-8, REQ-13).
import { limits } from "./quality-rules.config.mjs";
import { minimumTokens } from "./quality-duplication.mjs";
import { scopeRoots } from "./quality-scope.mjs";

const COMPLEXITY_RULE = "sonarjs/cognitive-complexity";
const FILE_SIZE_RULE = "max-lines";
const FUNCTION_SIZE_RULE = "max-lines-per-function";

const percent = (part, whole) => (whole === 0 ? "—" : `${((part / whole) * 100).toFixed(1)}%`);

const workspaceOf = (path) => path.split("/")[0];

// A message is source text: it can hold the one character a markdown table cell
// cannot.
const cell = (text) => text.replaceAll("|", "\\|");

const figureIn = (message) => Number(/(\d+)/.exec(message)?.[1] ?? 0);

function duration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

// The run's own local time, the one the report file is named after.
function moment(at) {
  const part = (value) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${part(at.getMonth() + 1)}-${part(at.getDate())} ${part(at.getHours())}:${part(at.getMinutes())}`;
}

function totalsOf(files) {
  const sum = (pick) => files.reduce((running, file) => running + pick(file), 0);
  return {
    files: files.length,
    lines: sum((file) => file.lines),
    duplicatedLines: sum((file) => file.duplicatedLines),
    overComplexity: sum((file) => file.overComplexity.length),
    oversizedFiles: files.filter((file) => file.oversized !== undefined).length,
    oversizedFunctions: sum((file) => file.oversizedFunctions.length),
    findings: sum((file) => file.findings.length),
  };
}

export function summarize({ eslintFiles, duplication, linesOf, excludedBy }) {
  const silenced = new Map();
  const files = eslintFiles.map((file) => {
    const complexity = [];
    const oversizedFunctions = [];
    const findings = [];
    let oversized;
    for (const message of file.messages) {
      const finding = { path: file.path, rule: message.ruleId ?? "parse error", line: message.line ?? 0, column: message.column ?? 0, message: message.message };
      const exclusion = message.ruleId === null ? undefined : excludedBy(finding);
      if (exclusion !== undefined) {
        silenced.set(exclusion, (silenced.get(exclusion) ?? 0) + 1);
        continue;
      }
      if (finding.rule === COMPLEXITY_RULE) complexity.push({ line: finding.line, column: finding.column, figure: figureIn(finding.message) });
      else if (finding.rule === FILE_SIZE_RULE) oversized = figureIn(finding.message);
      else if (finding.rule === FUNCTION_SIZE_RULE) oversizedFunctions.push({ line: finding.line, column: finding.column, figure: figureIn(finding.message) });
      else findings.push(finding);
    }
    const duplicated = duplication.duplicatedLinesOf(file.path);
    return {
      path: file.path,
      lines: linesOf(file.path),
      duplicatedLines: duplicated.lines,
      clones: duplicated.clones,
      complexity: complexity.sort((one, other) => other.figure - one.figure),
      overComplexity: complexity.filter((entry) => entry.figure > limits.cognitiveComplexity),
      oversized,
      oversizedFunctions: oversizedFunctions.sort((one, other) => other.figure - one.figure),
      findings: findings.sort((one, other) => one.line - other.line || one.column - other.column),
    };
  }).sort((one, other) => one.path.localeCompare(other.path));

  const workspaces = scopeRoots.map(workspaceOf).map((workspace) => ({
    workspace,
    ...totalsOf(files.filter((file) => workspaceOf(file.path) === workspace)),
  }));

  return {
    files,
    workspaces,
    total: totalsOf(files),
    clones: duplication.clones,
    silenced: [...silenced].map(([exclusion, count]) => ({ ...exclusion, count })),
  };
}

const complexityOf = (file) => (file.complexity.length === 0 ? 0 : file.complexity[0].figure);

export function printSummary({ workspaces, total }, { at, took }) {
  console.log(`\nQuality — ${moment(at)}, ${duration(took)}\n`);
  const line = (label, figures) =>
    `  ${label.padEnd(9)} ${String(figures.files).padStart(4)} files  ${percent(figures.duplicatedLines, figures.lines).padStart(6)} duplicated  ` +
    `${String(figures.overComplexity).padStart(3)} over the complexity limit  ` +
    `${String(figures.oversizedFiles + figures.oversizedFunctions).padStart(3)} over a size limit  ` +
    `${String(figures.findings).padStart(4)} rule findings`;
  for (const workspace of workspaces) console.log(line(workspace.workspace, workspace));
  console.log(line("both", total));
}

function silencedSection(silenced) {
  if (silenced.length === 0) {
    return ["Nothing was silenced in this run: no finding reported a rule this project decided on purpose.", ""];
  }
  return [
    "These findings were removed from everything above, because each reports a rule this project",
    "decided on purpose. Every other finding stands.",
    "",
    "| Rule | Where | Removed | The project rule it protects |",
    "| --- | --- | ---: | --- |",
    ...silenced.map((entry) => `| \`${entry.rule}\` | ${entry.paths.map((path) => `\`${path}\``).join(", ")} | ${entry.count} | ${cell(entry.reason)} |`),
    "",
  ];
}

function findingsSection(files) {
  const byRule = new Map();
  for (const file of files) {
    for (const finding of file.findings) byRule.set(finding.rule, [...(byRule.get(finding.rule) ?? []), finding]);
  }
  const rules = [...byRule].sort((one, other) => other[1].length - one[1].length || one[0].localeCompare(other[0]));
  if (rules.length === 0) return ["No rule of the quality configuration was violated.", ""];
  return rules.flatMap(([rule, findings]) => [
    `### \`${rule}\` — ${findings.length}`,
    "",
    "| File | Line | Finding |",
    "| --- | ---: | --- |",
    ...findings.map((finding) => `| \`${finding.path}\` | ${finding.line} | ${cell(finding.message)} |`),
    "",
  ]);
}

export function reportOf(summary, { at, took }) {
  const { files, workspaces, total, clones } = summary;
  const overComplexity = files.flatMap((file) => file.overComplexity.map((entry) => ({ path: file.path, ...entry })))
    .sort((one, other) => other.figure - one.figure);
  const oversizedFunctions = files.flatMap((file) => file.oversizedFunctions.map((entry) => ({ path: file.path, ...entry })))
    .sort((one, other) => other.figure - one.figure);
  const oversizedFiles = files.filter((file) => file.oversized !== undefined).sort((one, other) => other.oversized - one.oversized);
  return [
    `# Quality — ${moment(at)}`,
    "",
    `Run of \`npm run quality\`, ${duration(took)}. Two passes over the same files: ESLint with`,
    "`eslint-plugin-sonarjs` for the rules, the cognitive complexity and the sizes, `jscpd` for the",
    `duplication. What they read is ${scopeRoots.map((root) => `\`${root}\``).join(" and ")} — the hand-written TypeScript of the two`,
    "workspaces, and nothing else.",
    "",
    "The limits applied below, and only below: cognitive complexity",
    `${limits.cognitiveComplexity} per function, ${limits.fileLines} lines per file, ${limits.functionLines} lines per function, and a block repeated over`,
    `${minimumTokens} tokens or more. Nothing here fails a build, and nothing here is a work order: what is worth`,
    "fixing becomes an entry in `.sdd/tech-debt/`.",
    "",
    "## Workspaces",
    "",
    "| Workspace | Files | Lines | Duplicated lines | Over the complexity limit | Files over the size limit | Functions over the size limit | Rule findings |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...[...workspaces, { workspace: "both", ...total }].map((figures) =>
      `| ${figures.workspace} | ${figures.files} | ${figures.lines} | ${figures.duplicatedLines} (${percent(figures.duplicatedLines, figures.lines)}) | ${figures.overComplexity} | ${figures.oversizedFiles} | ${figures.oversizedFunctions} | ${figures.findings} |`),
    "",
    "## Files",
    "",
    "One row per measured file. *Complexity* is the cognitive complexity of its heaviest function.",
    "",
    "| File | Lines | Duplicated lines | Clones | Complexity | Functions over a size limit | Rule findings |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...files.map((file) =>
      `| \`${file.path}\` | ${file.lines} | ${file.duplicatedLines} (${percent(file.duplicatedLines, file.lines)}) | ${file.clones} | ${complexityOf(file)} | ${file.oversizedFunctions.length} | ${file.findings.length} |`),
    "",
    "## Duplication",
    "",
    `Every block repeated over ${minimumTokens} tokens or more, longest first. A block is counted in both files it`,
    "appears in.",
    "",
    ...(clones.length === 0 ? ["No repeated block was found.", ""] : [
      "| Lines | Tokens | First | Second |",
      "| ---: | ---: | --- | --- |",
      ...clones.map((clone) =>
        `| ${clone.lines} | ${clone.tokens} | \`${clone.first.path}\` ${clone.first.start}–${clone.first.end} | \`${clone.second.path}\` ${clone.second.start}–${clone.second.end} |`),
      "",
    ]),
    `## Functions above the complexity limit (${limits.cognitiveComplexity})`,
    "",
    ...(overComplexity.length === 0 ? ["No function is above it.", ""] : [
      "| File | Function at | Cognitive complexity |",
      "| --- | ---: | ---: |",
      ...overComplexity.map((entry) => `| \`${entry.path}\` | ${entry.line} | ${entry.figure} |`),
      "",
    ]),
    `## Files above the size limit (${limits.fileLines} lines)`,
    "",
    ...(oversizedFiles.length === 0 ? ["No file is above it.", ""] : [
      "| File | Lines |",
      "| --- | ---: |",
      ...oversizedFiles.map((file) => `| \`${file.path}\` | ${file.oversized} |`),
      "",
    ]),
    `## Functions above the size limit (${limits.functionLines} lines)`,
    "",
    ...(oversizedFunctions.length === 0 ? ["No function is above it.", ""] : [
      "| File | Function at | Lines |",
      "| --- | ---: | ---: |",
      ...oversizedFunctions.map((entry) => `| \`${entry.path}\` | ${entry.line} | ${entry.figure} |`),
      "",
    ]),
    "## Rule findings",
    "",
    ...findingsSection(files),
    "## What this report leaves out",
    "",
    ...silencedSection(summary.silenced),
  ].join("\n");
}
