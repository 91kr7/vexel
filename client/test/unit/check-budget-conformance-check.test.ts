import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * The check-budget conformance check
 * (`check-budgets/specs/check-budget-conformance-check.md`), run as a black box
 * over sources of this test's own.
 *
 * The rule it keeps: a test declares a budget that covers what its steps spend,
 * and the part a machine can decide from the source alone is that no step is
 * allowed more patience than the test that runs it
 * (`plan-docker_management_app-containers_card_view/REQ-64`, `REQ-69`).
 *
 * The guard takes the tree to scan as its first argument, so every case here
 * writes its sources in a throwaway directory outside the repository and no spec
 * of this test's making is ever left where Playwright would run it (REQ-72).
 */

// Resolved from the client workspace root (vitest's working directory), not
// import.meta.url: the jsdom environment does not preserve a file: URL suitable
// for path resolution.
const clientRoot = process.cwd();
const guardPath = join(clientRoot, 'scripts', 'check-budget-conformance.mjs');
const realConfigPath = join(clientRoot, 'playwright.config.ts');
const e2eRoot = join(clientRoot, 'e2e');

interface CheckResult {
  status: number;
  stdout: string;
  stderr: string;
}

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

/** A throwaway directory, outside every tree of the repository, removed when the case ends. */
function throwawayRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'check-budget-conformance-'));
  roots.push(root);
  return root;
}

function write(root: string, path: string, content: string): string {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
  return full;
}

function runGuard(treeDir: string, configPath: string = realConfigPath): CheckResult {
  const run = spawnSync(process.execPath, [guardPath, treeDir, configPath], { cwd: clientRoot, encoding: 'utf8' });
  return { status: run.status ?? -1, stdout: run.stdout, stderr: run.stderr };
}

/** The guard over one fabricated spec file, measured against the product's own default budget. */
function runGuardOverSource(source: string, fileName = 'fabricated.spec.ts'): CheckResult {
  const root = throwawayRoot();
  const tree = join(root, 'tree');
  mkdirSync(tree, { recursive: true });
  write(tree, fileName, source);
  return runGuard(tree);
}

function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...filesUnder(full));
    else found.push(relative(e2eRoot, full).split(sep).join('/'));
  }
  return found.sort();
}

describe('Check-budget conformance check — the rule it keeps', () => {
  // plan-docker_management_app-containers_card_view/REQ-64, REQ-70 — the tree as it stands holds no
  // step allowed more patience than its test, measured against the default read from the config.
  it('passes over the e2e tree, stating what it checked and the default it checked against', () => {
    const run = spawnSync(process.execPath, [guardPath], { cwd: clientRoot, encoding: 'utf8' });

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/passed/);
    expect(run.stdout).toMatch(/30000/);
  });

  // REQ-69 — the violation that killed the run of 2026-08-31, in its smallest form.
  it('refuses a step allowed more patience than the test that runs it, naming the file, the test and both budgets', () => {
    const result = runGuardOverSource(
      [
        "import { expect, test } from '@playwright/test';",
        '',
        "test('a step declares more than this test has', async ({ page }) => {",
        "  await expect(page.locator('.thing')).toBeVisible({ timeout: 40_000 });",
        '});',
        '',
      ].join('\n'),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/fabricated\.spec\.ts/);
    expect(result.stderr).toMatch(/a step declares more than this test has/);
    expect(result.stderr).toMatch(/40000/);
    expect(result.stderr).toMatch(/30000/);
  });

  // REQ-64 — "the steps written in the helper functions of its own file": every violation the
  // planning search found was written in a helper, not in a test body.
  it('refuses a step written in a helper of the same file, naming the helper', () => {
    const result = runGuardOverSource(
      [
        "import { expect, test } from '@playwright/test';",
        '',
        'async function waitForTheThing(page) {',
        "  await expect(page.locator('.thing')).toBeVisible({ timeout: 45_000 });",
        '}',
        '',
        "test('a helper spends the budget this test has', async ({ page }) => {",
        '  await waitForTheThing(page);',
        '});',
        '',
      ].join('\n'),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/waitForTheThing/);
    expect(result.stderr).toMatch(/45000/);
    expect(result.stderr).toMatch(/a helper spends the budget this test has/);
  });

  // REQ-69 — the guard accepts what fits, so that a red says something. Equal is admitted on
  // purpose: `openApp` declares exactly the default, and the borderline is stated in the spec
  // rather than hidden in an allow-list.
  it('accepts a test whose steps fit inside its budget, the one equal to it included', () => {
    const result = runGuardOverSource(
      [
        "import { expect, test } from '@playwright/test';",
        '',
        "test('every step fits inside what this test has', async ({ page }) => {",
        "  await expect(page.locator('.thing')).toBeVisible({ timeout: 20_000 });",
        "  await expect(page.locator('.other')).toBeVisible({ timeout: 30_000 });",
        '});',
        '',
      ].join('\n'),
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/passed/);
  });

  // "What a test's budget is": its own declaration first, and the default only where there is none.
  it('accepts a longer step under a test that declares a budget of its own', () => {
    const result = runGuardOverSource(
      [
        "import { expect, test } from '@playwright/test';",
        '',
        "test('this test declares what it allows itself', async ({ page }) => {",
        '  test.setTimeout(120_000);',
        "  await expect(page.locator('.thing')).toBeVisible({ timeout: 60_000 });",
        '});',
        '',
      ].join('\n'),
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  // The same, declared once for a whole file: what `containers-card-geometry.spec.ts` now does, so
  // twelve tests cannot drift apart.
  it('accepts a longer step under a budget the file declares for all its tests', () => {
    const result = runGuardOverSource(
      [
        "import { expect, test } from '@playwright/test';",
        '',
        'test.describe.configure({ timeout: 120_000 });',
        '',
        "test('the file declares the budget, not the test', async ({ page }) => {",
        "  await expect(page.locator('.thing')).toBeVisible({ timeout: 60_000 });",
        '});',
        '',
      ].join('\n'),
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});

describe('Check-budget conformance check — the default it measures against', () => {
  // REQ-70 — a guard that cannot read the default fails instead of assuming one.
  it('fails when the configuration cannot be read, naming it', () => {
    const root = throwawayRoot();
    const tree = join(root, 'tree');
    mkdirSync(tree, { recursive: true });
    const missing = join(root, 'nowhere', 'playwright.config.ts');

    const result = runGuard(tree, missing);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/playwright\.config\.ts/);
    expect(result.stderr).toMatch(/cannot be read/i);
  });

  // REQ-70 — the same refusal when the configuration is readable but states no default budget.
  it('fails when the configuration declares no default budget constant, naming the constant', () => {
    const root = throwawayRoot();
    const tree = join(root, 'tree');
    mkdirSync(tree, { recursive: true });
    const config = write(root, 'playwright.config.ts', 'export default { timeout: 30_000 };\n');

    const result = runGuard(tree, config);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/playwright\.config\.ts/);
    expect(result.stderr).toMatch(/DEFAULT_TEST_BUDGET_MS/);
  });

  // REQ-70 — a constant that is not the configuration's own `timeout` is not the budget the tests
  // get, so reading it would be assuming a value under another name.
  it('fails when the constant is declared but is not the configuration timeout', () => {
    const root = throwawayRoot();
    const tree = join(root, 'tree');
    mkdirSync(tree, { recursive: true });
    const config = write(root, 'playwright.config.ts', 'const DEFAULT_TEST_BUDGET_MS = 30_000;\nexport default { timeout: 45_000 };\n');

    const result = runGuard(tree, config);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/DEFAULT_TEST_BUDGET_MS/);
  });

  // REQ-70 — and it is that number the violations are measured against, not Playwright's own.
  it('measures against the budget the configuration states, whatever that is', () => {
    const root = throwawayRoot();
    const tree = join(root, 'tree');
    mkdirSync(tree, { recursive: true });
    write(
      tree,
      'fabricated.spec.ts',
      [
        "import { expect, test } from '@playwright/test';",
        '',
        "test('a step of forty seconds', async ({ page }) => {",
        "  await expect(page.locator('.thing')).toBeVisible({ timeout: 40_000 });",
        '});',
        '',
      ].join('\n'),
    );
    const config = write(
      root,
      'playwright.config.ts',
      'const DEFAULT_TEST_BUDGET_MS = 50_000;\nexport default { timeout: DEFAULT_TEST_BUDGET_MS };\n',
    );

    const result = runGuard(tree, config);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/50000/);
  });
});

describe('Check-budget conformance check — where it runs and what it leaves behind', () => {
  // REQ-71 — under both client commands, with no skip and no exception marker.
  it('is invoked by the client workspace lint and test commands', () => {
    const scripts = JSON.parse(readFileSync(join(clientRoot, 'package.json'), 'utf8')).scripts as Record<string, string>;

    expect(scripts['lint:check-budgets']).toContain('check-budget-conformance.mjs');
    expect(scripts.lint).toContain('lint:check-budgets');
    expect(scripts.test).toContain('lint:check-budgets');
  });

  // REQ-71 — no way out: the guard's own source carries no allow-list and no exception marker, so a
  // budget that cannot be met is repaired rather than exempted.
  it('offers no exception marker to exempt a budget with', () => {
    const guard = readFileSync(guardPath, 'utf8');
    const code = guard.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    expect(code).not.toMatch(/allowList|allowlist|exception|eslint-disable|budget-exception/i);
  });

  // REQ-72 — the check that drives the guard writes no spec into the tree Playwright runs.
  it('is driven over sources that never enter the e2e tree', () => {
    const before = filesUnder(e2eRoot);

    const result = runGuardOverSource(
      [
        "import { expect, test } from '@playwright/test';",
        '',
        "test('a step declares more than this test has', async ({ page }) => {",
        "  await expect(page.locator('.thing')).toBeVisible({ timeout: 40_000 });",
        '});',
        '',
      ].join('\n'),
    );

    expect(result.status).toBe(1);
    expect(filesUnder(e2eRoot)).toEqual(before);
  });
});
