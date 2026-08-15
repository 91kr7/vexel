/**
 * F5 — the retirement guard for the second list component
 * (`plan-ui-coherence-optimisation/REQ-94`), and the half of `REQ-84` that a
 * green run cannot show.
 *
 * `CardList` stays exported through the eight batches that migrate its call
 * sites onto the object-list primitive, which is exactly the window in which a
 * screen could quietly acquire a **new** one — and nothing else in the plan
 * would catch it, since the migrations remove call sites and a count that
 * merely fell still looks like progress. So the count is **pinned**, and a
 * guard is only shown to guard by being seen to fail: it is perturbed here in
 * **both** directions.
 *
 * The perturbations are run against a **byte-for-byte copy of the script** over
 * a synthetic tree, never against `client/src`. Lowering the real count would
 * mean removing a real call site, and raising it would put a violating file in
 * the tree that `ui-conformance-check.test.ts` asserts is conformant — a test
 * depending on what another test did, which CLAUDE.md refuses. The real tree is
 * only ever read.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Resolved from the client workspace root (vitest's working directory), as
// `ui-conformance-check.test.ts` does: the jsdom environment does not preserve a
// module URL suitable for path resolution.
const clientRoot = process.cwd();
const repositoryRoot = join(clientRoot, '..');
const scriptPath = join(clientRoot, 'scripts', 'check-ui-conformance.mjs');
const script = readFileSync(scriptPath, 'utf8');

/**
 * The count the requirement states: "seeded with the count measured at the start
 * of the programme", which `ui-conformance-check.md` records as **17**. It is
 * kept as the figure every later budget is read against, not as a live
 * expectation: the pin is lowered by each migration, in that migration's own
 * commit.
 */
const BUDGET_AT_THE_START_OF_THE_PLAN = 17;

/**
 * What the budget stands at now: **11**, the volumes and networks migration
 * (`plan-ui-coherence-optimisation/REQ-31`) having removed the two call sites
 * those panels held, the registries migration (`REQ-36`) the two its own screen
 * held, and the builders migration (`REQ-39`) the two the builder list and the
 * build-cache list held — "lower the `CardList` call-site budget by the two
 * sites removed here", batch 8. Zero at the deletion (batch 13), at which point
 * the check goes with the component.
 */
const BUDGET_NOW = 11;

/** The call sites the migrations have removed so far, which is what "lowered deliberately" means. */
const MIGRATED_AWAY = BUDGET_AT_THE_START_OF_THE_PLAN - BUDGET_NOW;

/** The directories whose screens have been migrated, and which therefore hold no call site at all. */
const MIGRATED_DIRECTORIES = [join('src', 'volumes-networks'), join('src', 'registries'), join('src', 'builders')];

/**
 * The state of the conformance script **before this plan touched anything** —
 * the point REQ-84 measures "byte-identical" from. Overridable so the check
 * survives the branch being merged or rebased.
 */
function preplanScript(): string {
  const base =
    process.env.VEXEL_PREPLAN_REF ??
    spawnSync('git', ['merge-base', 'HEAD', 'main'], { cwd: repositoryRoot, encoding: 'utf8' }).stdout.trim();
  expect(base, 'no pre-plan revision to compare the conformance script against').not.toBe('');
  const shown = spawnSync('git', ['show', `${base}:client/scripts/check-ui-conformance.mjs`], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  expect(shown.status, `git could not read the conformance script at ${base}: ${shown.stderr}`).toBe(0);
  return shown.stdout;
}

/** Every `.ts`/`.tsx` file of the client's **feature** code — everything under `src/` except `src/ui/`. */
function featureFiles(directory = join(clientRoot, 'src'), inUi = false): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return featureFiles(path, inUi || entry.name === 'ui');
    if (inUi || !/\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

const sandboxes: string[] = [];

/**
 * A tree of the shape the script scans — `scripts/` beside `src/ui/` — holding
 * the stated number of call sites in feature code and in the library, with the
 * real script copied into it unchanged.
 *
 * It lives inside the client workspace so that the copy resolves `typescript`
 * from the same `node_modules` the real one does, and it is removed in an
 * `afterAll` so a failure cleans up as thoroughly as a pass.
 */
function sandboxWith({ feature, library = 0 }: { feature: number; library?: number }): string {
  const root = mkdtempSync(join(clientRoot, '.card-list-budget-sandbox-'));
  sandboxes.push(root);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'src', 'ui'), { recursive: true });
  copyFileSync(scriptPath, join(root, 'scripts', 'check-ui-conformance.mjs'));
  writeFileSync(join(root, 'src', 'Screen.tsx'), callSites(feature), 'utf8');
  writeFileSync(join(root, 'src', 'ui', 'Library.tsx'), callSites(library), 'utf8');
  return root;
}

/** A file stating `count` call sites of the retiring component, and nothing else. */
function callSites(count: number): string {
  const elements = Array.from({ length: count }, (_, index) => `<CardList key="${index}" />`).join(', ');
  return `export const lists = [${elements}];\n`;
}

function runIn(root: string) {
  return spawnSync(process.execPath, [join(root, 'scripts', 'check-ui-conformance.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
}

afterAll(() => {
  for (const root of sandboxes) rmSync(root, { recursive: true, force: true });
});

function callSiteCount(files: string[]): number {
  return files
    .map((file) => readFileSync(file, 'utf8').match(/<CardList\b/g)?.length ?? 0)
    .reduce((total, count) => total + count, 0);
}

describe('the retirement budget — the count it holds (REQ-94)', () => {
  // ui-conformance-check.md — "the expected count is 17 at the start of
  // plan-ui-coherence-optimisation, lowered by each screen migration in its own commit"; batch 8 —
  // "lower the CardList call-site budget by the two sites removed here", from the 13 the volumes,
  // networks and registries migrations left
  it('pins the expected count at the number the migrations so far have left', () => {
    const expected = /expectedCallSites:\s*(\d+)/.exec(script)?.[1];

    expect(expected, 'the script holds no expected call-site count').toBeDefined();
    expect(Number(expected)).toBe(BUDGET_NOW);
    expect(BUDGET_NOW, 'the budget rose above the count measured at the start of the plan').toBeLessThan(
      BUDGET_AT_THE_START_OF_THE_PLAN,
    );
  });

  // REQ-94 — the budget is only true of the tree if the tree actually holds that many
  it('is the number of call sites the feature code actually holds', () => {
    expect(callSiteCount(featureFiles())).toBe(BUDGET_NOW);
  });

  // REQ-31, REQ-36, REQ-39, REQ-82 — a migration **deletes** the arrangement it replaces: the six
  // sites the drop from 17 to 11 accounts for are the two those panels held, the two the registries
  // screen held and the two the builders screen held, and none of them is left standing
  it('accounts for the drop by the sites the migrated screens no longer hold', () => {
    expect(MIGRATED_AWAY).toBe(6);

    for (const directory of MIGRATED_DIRECTORIES) {
      const migratedScreen = featureFiles().filter((file) => file.includes(directory));

      expect(migratedScreen.length, `no feature file lives under ${directory}`).toBeGreaterThan(0);
      expect(callSiteCount(migratedScreen), `${directory} still holds a call site of the retiring component`).toBe(0);
    }
  });

  // ui-conformance-check.md — "The budget counts feature code only. The component's own definition,
  // its spec and its export are not call sites."
  it('counts feature code only, and passes when the library holds call sites of its own', () => {
    const result = runIn(sandboxWith({ feature: BUDGET_NOW, library: 5 }));

    expect(result.stderr).not.toMatch(/call-site budget/);
    expect(result.status).toBe(0);
  });
});

describe('the retirement budget — it fails in both directions (REQ-94)', () => {
  // ui-conformance-check.md — "more than expected → a screen acquired a new call site while the
  // component is still exported"
  it('fails when a screen has acquired a new call site', () => {
    const result = runIn(sandboxWith({ feature: BUDGET_NOW + 1 }));

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(new RegExp(`CardList call-site budget: ${BUDGET_NOW + 1} in feature code, ${BUDGET_NOW} expected`));
    expect(result.stderr).toMatch(/more than the budget/);
  });

  // ui-conformance-check.md — "fewer than expected → a migration landed without the budget being
  // lowered on purpose". A ceiling would have let this through, which is the whole reason the count
  // is pinned rather than bounded.
  it('fails when a migration landed without the budget being lowered', () => {
    const result = runIn(sandboxWith({ feature: BUDGET_NOW - 1 }));

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(new RegExp(`CardList call-site budget: ${BUDGET_NOW - 1} in feature code, ${BUDGET_NOW} expected`));
    expect(result.stderr).toMatch(/fewer than the budget/);
  });

  // ui-conformance-check.md — "the violation line states both counts, which direction they differ
  // in, and what to do about it; it carries no file or line number, being a fact about the tree
  // rather than about one file"
  it('states both counts and what to do, without naming a file or a line', () => {
    const result = runIn(sandboxWith({ feature: BUDGET_NOW + 3 }));
    const line = result.stderr.split('\n').find((text) => text.includes('call-site budget')) ?? '';

    expect(line).toMatch(new RegExp(`${BUDGET_NOW + 3} in feature code, ${BUDGET_NOW} expected`));
    expect(line).toMatch(/expectedCallSites/);
    expect(line).not.toMatch(/\.tsx?:\d+/);
    expect(result.stderr).toMatch(/1 violation\(s\)/);
  });

  // ui-conformance-check.md — "A violation of one rule never suppresses the reporting of another"
  it('reports a boundary violation alongside a budget one', () => {
    const root = sandboxWith({ feature: BUDGET_NOW + 1 });
    writeFileSync(join(root, 'src', 'RawTag.tsx'), 'export function R() { return <span>raw</span>; }\n', 'utf8');

    const result = runIn(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/raw DOM tag/);
    expect(result.stderr).toMatch(/call-site budget/);
    expect(result.stderr).toMatch(/2 violation\(s\)/);
  });
});

describe('the blur half of the conformance script (REQ-84)', () => {
  // REQ-84 — "The script's blur half is not edited at all, and an edit to it is a signal that
  // something went wrong, reported rather than made." Its boundary half receives exactly one
  // planned addition: the call-site budget.
  it('states every blur rule exactly as it did before the plan began', () => {
    const before = preplanScript();
    const blurLines = (source: string) => source.split('\n').filter((line) => /blur/i.test(line));

    expect(blurLines(script)).toEqual(blurLines(before));
  });

  // REQ-84 — `blurAllowedOverlaySelectors` "stays byte-identical to its state before batch 1", the
  // half a green run cannot show: a run stays green while the list is widened
  it('keeps the allow-list constant byte-identical to its pre-plan state', () => {
    const constant = (source: string) =>
      /const blurAllowedOverlaySelectors = new Set\(\[[\s\S]*?\]\);/.exec(source)?.[0] ?? '';

    expect(constant(script)).not.toBe('');
    expect(constant(script)).toBe(constant(preplanScript()));
  });

  // REQ-84 — and every function the blur policy is made of, not only the list it consults
  it('keeps every function of the blur policy byte-identical to its pre-plan state', () => {
    const before = preplanScript();
    const declaration = (source: string, name: string) => {
      const match = new RegExp(`^(?:function|const) ${name}\\b[\\s\\S]*?^}`, 'm').exec(source)?.[0];
      if (match === undefined) throw new Error(`the conformance script declares no ${name}`);
      return match;
    };

    for (const name of [
      'collectCssDeclarations',
      'blurDeclarationValue',
      'ruleTargetsAllowedOverlay',
      'blurValueIsTokenBound',
      'checkBlurPolicy',
    ]) {
      expect(declaration(script, name), `${name} was edited by this plan`).toBe(declaration(before, name));
    }
  });
});
