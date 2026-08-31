// Fails the build when a check declares a step budget larger than the budget of
// the test that runs it. A test that allows one of its steps more patience than
// it has itself can never let that step fail with its own message: the test dies
// somewhere else, on a message that says nothing. That is what killed
// `containers-card-geometry.spec.ts` on 2026-08-31 — a 40s poll inside a 30s
// test (plan-docker_management_app-containers_card_view/REQ-64, REQ-69).
//
// The tree to scan is the first argument, the Playwright configuration the
// second, both optional. The default budget is read from that configuration and
// never assumed: a configuration that does not state it fails the check
// (REQ-70).
//
// Wired into `npm run lint` and `npm run test` (client workspace), and runnable
// on its own as `npm run lint:check-budgets -w client`.
//
// THREE LIMITS, so nobody trusts this guard further than it goes.
//
//  1. It does not add budgets up. A test whose steps sum to more than it has
//     still passes. Summing would mean deciding which worst cases can occur in
//     one run, which the guard cannot know; it would refuse correct code, and a
//     guard that refuses correct code is worked around rather than read. The
//     arithmetic written beside each budget is what a human reads instead.
//  2. It resolves helper functions within one file, not across files. A budget
//     declared in `e2e/support/` is not attributed to its callers, so the guard
//     under-reports rather than reports wrongly. Same rule for anything else it
//     cannot resolve on the file's own text: a budget held in a parameter or
//     computed at run time is skipped, not guessed at.
//  3. It counts every numeric `timeout:` option, whatever API it belongs to. A
//     `docker build` allowed 300s is a patience the test must be able to spend,
//     exactly as a locator's is. Telling one API from another is neither
//     possible here nor needed.
//
// And it refuses a step budget STRICTLY greater than its test's. Equal is a lie
// too — a test cannot spend its whole budget on one step and still do anything
// else — but `openApp` declares exactly the default, so `>=` would refuse every
// test in the suite at once for one helper. The borderline is stated here
// instead of being hidden in an allow-list, and there is no allow-list and no
// exception marker: a budget that cannot be met is repaired, never exempted.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

const clientRoot = new URL("..", import.meta.url).pathname;
const repositoryRoot = join(clientRoot, "..");
const defaultBudgetConstant = "DEFAULT_TEST_BUDGET_MS";

const scanRoot = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : join(clientRoot, "e2e");
const configPath = process.argv[3] ? resolve(process.cwd(), process.argv[3]) : join(clientRoot, "playwright.config.ts");

function fail(message) {
  console.error(`Check-budget conformance check failed:\n\n  ${message}\n`);
  process.exit(1);
}

function shown(filePath) {
  const path = relative(repositoryRoot, filePath).split(sep).join("/");
  return path.startsWith("..") ? filePath : path;
}

// Whether the `/` at this offset opens a regular expression rather than a
// division: what decides it is the token before it.
const regexPrecedent = /[(,=:[!&|?{};+\-*%~^<>]$/;
const regexKeyword = /\b(?:return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/;

function opensRegularExpression(out, index) {
  let scan = index - 1;
  while (scan >= 0 && /\s/.test(out[scan])) scan -= 1;
  if (scan < 0) return true;
  if (regexPrecedent.test(out[scan])) return true;
  if (!/[\w$]/.test(out[scan])) return false;
  let word = "";
  while (scan >= 0 && /[\w$]/.test(out[scan])) {
    word = out[scan] + word;
    scan -= 1;
  }
  return regexKeyword.test(word);
}

// A copy of the source with comments and the contents of string, template and
// regular-expression literals blanked out, newlines kept: offsets and line
// numbers stay those of the original, and a budget merely quoted in a comment
// takes no part. Regular expressions are blanked because they are where a
// bracket or a quote appears with no partner — `/^\/[^/]+$/` alone made a test
// declaration look as if its argument list never closed. Quoted literals stop at
// the end of their line, so an apostrophe cannot swallow the rest of the file.
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

    if (char === "/" && next !== "/" && next !== "*" && opensRegularExpression(out, index)) {
      let scan = index + 1;
      let inClass = false;
      let closed = false;
      while (scan < content.length) {
        const inner = content[scan];
        if (inner === "\\") {
          scan += 2;
          continue;
        }
        if (inner === "\n") break;
        if (inner === "[") inClass = true;
        else if (inner === "]") inClass = false;
        else if (inner === "/" && !inClass) {
          closed = true;
          break;
        }
        scan += 1;
      }
      if (closed) {
        blank(index + 1, scan);
        index = scan;
        continue;
      }
    }

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
      const singleLine = char !== "`";
      let scan = index + 1;
      while (scan < content.length && content[scan] !== char) {
        if (singleLine && content[scan] === "\n") break;
        if (content[scan] === "\\") scan += 1;
        scan += 1;
      }
      blank(index + 1, scan);
      index = scan;
    }
  }

  return out.join("");
}

function matchingBracket(code, openIndex, open, close) {
  let depth = 0;
  for (let index = openIndex; index < code.length; index += 1) {
    if (code[index] === open) depth += 1;
    else if (code[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

// The `{` that opens a body, skipping a return-type annotation: an object type
// inside `Promise<{ … }>` is not a function body. `=>` inside a type does not
// close the annotation.
function bodyBraceAfter(code, fromIndex) {
  let angles = 0;
  for (let index = fromIndex; index < code.length; index += 1) {
    const char = code[index];
    if (char === "<") angles += 1;
    else if (char === ">" && code[index - 1] !== "=") angles = Math.max(0, angles - 1);
    else if (char === ";") return -1;
    else if (char === "{" && angles === 0) return index;
  }
  return -1;
}

function milliseconds(token, constants) {
  if (token === undefined) return undefined;
  const text = token.trim();
  if (/^\d[\d_]*$/.test(text)) return Number(text.replaceAll("_", ""));
  return constants.get(text);
}

function readDefaultTestBudget() {
  let content;
  try {
    content = readFileSync(configPath, "utf8");
  } catch {
    fail(`${shown(configPath)} cannot be read, so the default test budget is unknown. The guard states no budget it has not read.`);
  }
  const code = blankNonCode(content);
  const declaration = new RegExp(`\\b(?:const|let)\\s+${defaultBudgetConstant}\\s*(?::\\s*number\\s*)?=\\s*(\\d[\\d_]*)\\s*;`).exec(code);
  if (declaration === null) {
    fail(`${shown(configPath)} declares no \`${defaultBudgetConstant}\`, so the budget every step is measured against is unknown. Declare it there rather than assuming Playwright's own default.`);
  }
  if (!new RegExp(`\\btimeout\\s*:\\s*${defaultBudgetConstant}\\b`).test(code)) {
    fail(`${shown(configPath)} declares \`${defaultBudgetConstant}\` but does not use it as its \`timeout\`, so the constant is not the budget the tests actually get.`);
  }
  return Number(declaration[1].replaceAll("_", ""));
}

function collectSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (extname(entry) === ".ts") out.push(full);
  }
  return out;
}

// Every named function of the file, with the range of its body: what "the helper
// functions of its own file" means, and the unit a call is resolved to.
function collectFunctions(code) {
  const functions = [];

  for (const match of code.matchAll(/\b(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^<>]*>\s*)?\(/g)) {
    const open = match.index + match[0].length - 1;
    const close = matchingBracket(code, open, "(", ")");
    if (close === -1) continue;
    const body = bodyBraceAfter(code, close + 1);
    if (body === -1) continue;
    const end = matchingBracket(code, body, "{", "}");
    if (end === -1) continue;
    functions.push({ name: match[1], start: body, end });
  }

  for (const match of code.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=\s*(?:async\s+)?\(/g)) {
    const open = match.index + match[0].length - 1;
    const close = matchingBracket(code, open, "(", ")");
    if (close === -1) continue;
    const arrow = code.indexOf("=>", close);
    if (arrow === -1 || /[;{}]/.test(code.slice(close + 1, arrow))) continue;
    const rest = code.slice(arrow + 2);
    const offset = rest.length - rest.trimStart().length;
    const body = arrow + 2 + offset;
    if (code[body] !== "{") continue;
    const end = matchingBracket(code, body, "{", "}");
    if (end === -1) continue;
    functions.push({ name: match[1], start: body, end });
  }

  return functions;
}

// A test's title, read from the original source so it reads as it was written.
function titleAt(content, openIndex) {
  let index = openIndex + 1;
  while (index < content.length && /\s/.test(content[index])) index += 1;
  const quote = content[index];
  if (quote !== "'" && quote !== '"' && quote !== "`") return undefined;
  let scan = index + 1;
  while (scan < content.length && content[scan] !== quote) {
    if (content[scan] === "\\") scan += 1;
    scan += 1;
  }
  return content
    .slice(index + 1, scan)
    .replace(/\\(['"`\\])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const declarationModifiers = new Set(["only", "skip", "fixme", "fail", "slow"]);
const describeModifiers = new Set(["only", "skip", "fixme", "serial", "parallel"]);

function parseFile(content) {
  const code = blankNonCode(content);

  const constants = new Map();
  for (const match of code.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::\s*number\s*)?=\s*(\d[\d_]*)\s*;/g)) {
    constants.set(match[1], Number(match[2].replaceAll("_", "")));
  }

  const functions = collectFunctions(code);
  const blocks = [];
  const declaredBudgets = [];
  const configuredRanges = [];
  const unreadable = [];

  // `(?<![\w$.])` keeps a regular expression's own `.test(` out of this: it is a
  // call on a value, not a declaration of a test.
  for (const match of code.matchAll(/(?<![\w$.])test\s*((?:\.\s*[A-Za-z_$][\w$]*\s*)*)\(/g)) {
    const open = match.index + match[0].length - 1;
    const close = matchingBracket(code, open, "(", ")");
    // A call whose arguments never close is a call this guard has not read, and
    // a test it has not read is a test it has not checked. Said out loud rather
    // than skipped in silence.
    if (close === -1) {
      unreadable.push(match.index);
      continue;
    }
    const chain = match[1].replace(/[\s.]/g, ".").split(".").filter((part) => part.length > 0);
    const argument = code.slice(open + 1, close);

    if (chain[0] === "setTimeout") {
      const ms = milliseconds(argument, constants);
      if (ms !== undefined) declaredBudgets.push({ offset: match.index, ms });
      continue;
    }
    if (chain[0] === "describe" && chain[1] === "configure") {
      configuredRanges.push({ start: open, end: close });
      const option = /\btimeout\s*:\s*([\w$]+)/.exec(argument);
      const ms = option === null ? undefined : milliseconds(option[1], constants);
      if (ms !== undefined) declaredBudgets.push({ offset: match.index, ms });
      continue;
    }
    if (chain[0] === "describe" && chain.slice(1).every((part) => describeModifiers.has(part))) {
      blocks.push({ kind: "describe", start: open, end: close });
      continue;
    }
    if (chain[0] === "beforeEach" || chain[0] === "afterEach") {
      blocks.push({ kind: "hook", start: open, end: close });
      continue;
    }
    if (chain.every((part) => declarationModifiers.has(part))) {
      // `test.skip(condition, reason)` is a modifier, not a declaration: what
      // tells them apart is a title where the condition would be.
      const title = titleAt(content, open);
      if (title === undefined) continue;
      blocks.push({ kind: "test", start: open, end: close, title, line: lineOf(content, match.index) });
    }
  }

  const steps = [];
  for (const match of code.matchAll(/\btimeout\s*:\s*([\w$]+)/g)) {
    if (configuredRanges.some((range) => match.index > range.start && match.index < range.end)) continue;
    const ms = milliseconds(match[1], constants);
    if (ms === undefined) continue;
    steps.push({ offset: match.index, ms });
  }

  return { code, blocks, declaredBudgets, steps, functions, unreadable };
}

function lineOf(content, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (content[index] === "\n") line += 1;
  return line;
}

function innermost(candidates, offset) {
  let found;
  for (const candidate of candidates) {
    if (offset <= candidate.start || offset >= candidate.end) continue;
    if (found === undefined || candidate.end - candidate.start < found.end - found.start) found = candidate;
  }
  return found;
}

// The named functions called from a region, and the ones those call in turn:
// resolution stops at the file's edge, per limit 2.
function reachableFunctions(code, regions, functions, reached = new Set()) {
  for (const region of regions) {
    for (const match of code.slice(region.start, region.end).matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
      const called = functions.filter((entry) => entry.name === match[1] && !reached.has(entry));
      for (const entry of called) {
        reached.add(entry);
        reachableFunctions(code, [entry], functions, reached);
      }
    }
  }
  return reached;
}

const defaultBudget = readDefaultTestBudget();
const violations = [];
const unread = [];
let checked = 0;

for (const filePath of collectSourceFiles(scanRoot)) {
  const content = readFileSync(filePath, "utf8");
  const { code, blocks, declaredBudgets, steps, functions, unreadable } = parseFile(content);
  for (const offset of unreadable) {
    unread.push(`${shown(filePath)}:${lineOf(content, offset)} — the guard could not read this \`test\` call to its end, so whatever it declares went unchecked.`);
  }
  const scopes = blocks.filter((block) => block.kind === "test" || block.kind === "describe");
  const tests = blocks.filter((block) => block.kind === "test");
  const hooks = blocks.filter((block) => block.kind === "hook");

  for (const test of tests) {
    checked += 1;

    // The scopes a budget may be declared in, innermost first: the test, the
    // describes around it, then the file.
    const chain = [test];
    let outer = innermost(scopes.filter((scope) => scope !== test), test.start);
    while (outer !== undefined) {
      chain.push(outer);
      outer = innermost(scopes.filter((scope) => scope !== outer), outer.start);
    }

    let budget = defaultBudget;
    for (const scope of [...chain, undefined]) {
      const owned = declaredBudgets.filter((entry) => innermost(scopes, entry.offset) === scope);
      if (owned.length > 0) {
        budget = Math.max(...owned.map((entry) => entry.ms));
        break;
      }
    }

    // What the test can spend: its own body, the per-test hooks of the scopes
    // around it — which share the test's budget — and the file's own functions
    // any of them calls.
    const regions = [test];
    for (const hook of hooks) {
      const hookScope = innermost(scopes, hook.start);
      if (hookScope === undefined || chain.includes(hookScope)) regions.push(hook);
    }
    const helpers = reachableFunctions(code, regions, functions);

    for (const step of steps) {
      if (step.ms <= budget) continue;
      const helper = innermost(functions, step.offset);
      const inReach =
        helper === undefined
          ? regions.some((region) => step.offset > region.start && step.offset < region.end)
          : helpers.has(helper);
      if (!inReach) continue;
      violations.push({
        file: shown(filePath),
        line: lineOf(content, step.offset),
        title: test.title,
        testLine: test.line,
        budget,
        step: step.ms,
        helper: helper?.name,
      });
    }
  }
}

if (unread.length > 0 || violations.length > 0) {
  console.error("Check-budget conformance check failed:\n");
  for (const line of unread) console.error(`  ${line}`);
  if (unread.length > 0 && violations.length > 0) console.error("");
  for (const violation of violations) {
    const where = violation.helper === undefined ? "" : ` (in \`${violation.helper}\`)`;
    console.error(
      `  ${violation.file}:${violation.line} — a step allows ${violation.step} ms${where}, inside the test at line ${violation.testLine}, which has ${violation.budget} ms:\n      "${violation.title}"`,
    );
  }
  if (violations.length === 0) {
    console.error(`\n${unread.length} unread test declaration(s).`);
    process.exit(1);
  }
  console.error(
    `\n${violations.length} violation(s) over ${checked} test(s), against a ${defaultBudget} ms default. A step budget must be smaller than the budget of the test that runs it: lower the step to what the product's own cadence requires, or declare a test budget that covers it, with the arithmetic written beside the number.`,
  );
  process.exit(1);
}

console.log(`Check-budget conformance check passed (${checked} tests, ${defaultBudget} ms default).`);
