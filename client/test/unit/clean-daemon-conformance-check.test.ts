import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * The clean-daemon conformance check
 * (`check-budgets/specs/clean-daemon-conformance-check.md`), run as a black box
 * over spec files of this test's own.
 *
 * The rule it keeps: every daemon-backed test file empties Docker before it
 * runs, which the two trees reach differently — a per-file registration in the
 * end-to-end specs, a preload in the server pass
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-72).
 *
 * The tree to scan is the guard's first argument, so every fabricated spec is
 * written outside the repository and none is ever left where Playwright would
 * run it. The server manifest is the one input the guard resolves from its own
 * location, so the cases about the preload copy the guard into a throwaway root
 * holding a manifest of theirs.
 */

// Resolved from the client workspace root (vitest's working directory), not
// import.meta.url: the jsdom environment does not preserve a file: URL suitable
// for path resolution.
const guardPath = join(process.cwd(), '..', 'scripts', 'check-clean-daemon-conformance.mjs');

interface CheckResult {
  status: number;
  stdout: string;
  stderr: string;
}

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function throwawayRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'clean-daemon-conformance-'));
  roots.push(root);
  return root;
}

function write(root: string, path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

/** The real guard over a tree holding exactly `files`, measured against the repository's own server manifest. */
function runGuardOver(files: Record<string, string>): CheckResult {
  const root = throwawayRoot();
  const tree = join(root, 'tree');
  mkdirSync(tree, { recursive: true });
  for (const [path, content] of Object.entries(files)) write(tree, path, content);
  const run = spawnSync(process.execPath, [guardPath, tree], { encoding: 'utf8' });
  return { status: run.status ?? -1, stdout: run.stdout, stderr: run.stderr };
}

function runGuardOverSpec(source: string, fileName = 'fabricated.spec.ts'): CheckResult {
  return runGuardOver({ [fileName]: source });
}

/** A copy of the guard in a root whose `server/package.json` declares `test:api` as the case says. */
function runGuardWithApiScript(apiScript: string): CheckResult {
  const root = throwawayRoot();
  const script = join(root, 'scripts', 'check-clean-daemon-conformance.mjs');
  mkdirSync(dirname(script), { recursive: true });
  copyFileSync(guardPath, script);
  write(root, 'server/package.json', JSON.stringify({ name: 'server', scripts: { 'test:api': apiScript } }));
  const tree = join(root, 'e2e');
  mkdirSync(tree, { recursive: true });
  const run = spawnSync(process.execPath, [script, tree], { encoding: 'utf8' });
  return { status: run.status ?? -1, stdout: run.stdout, stderr: run.stderr };
}

const conforming = [
  "import { test, expect } from './support/test.js';",
  "import { cleanDaemonBeforeAll } from './support/lifecycle.js';",
  '',
  'cleanDaemonBeforeAll();',
  '',
  'test.beforeAll(async () => {',
  '  await prepare();',
  '});',
  '',
  "test('lists the container it created', async ({ page }) => {",
  '  await page.goto("/");',
  '});',
  '',
].join('\n');

describe('Clean-daemon conformance check — what it refuses', () => {
  it('refuses a spec that never registers the reset', () => {
    const result = runGuardOverSpec(
      ["import { test } from './support/test.js';", "test('lists containers', async () => {});", ''].join('\n'),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/fabricated\.spec\.ts/);
    expect(result.stderr).toMatch(/cleanDaemonBeforeAll/);
  });

  it('refuses a spec whose registration sits inside a describe instead of the top level', () => {
    const result = runGuardOverSpec(
      [
        "import { test } from './support/test.js';",
        "import { cleanDaemonBeforeAll } from './support/lifecycle.js';",
        '',
        "test.describe('containers', () => {",
        '  cleanDaemonBeforeAll();',
        '});',
        '',
      ].join('\n'),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/fabricated\.spec\.ts/);
  });

  // Hooks run in registration order, so a `test.*` call registered ahead of the
  // reset would build its fixtures on a daemon the reset then prunes.
  it.each([
    ["test('lists containers', async () => {});", 'a test'],
    ['test.beforeAll(async () => { await prepare(); });', 'a beforeAll hook'],
    ["test.describe('containers', () => {});", 'a describe'],
  ])('refuses %s registered before the reset (%s)', (earlier) => {
    const result = runGuardOverSpec(
      [
        "import { test } from './support/test.js';",
        "import { cleanDaemonBeforeAll } from './support/lifecycle.js';",
        '',
        earlier,
        '',
        'cleanDaemonBeforeAll();',
        '',
      ].join('\n'),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/fabricated\.spec\.ts:4\b/);
    expect(result.stderr).toMatch(/\b6\b/);
  });

  it('refuses a server pass that no longer preloads the reset', () => {
    const result = runGuardWithApiScript('node --test --import tsx "test/api/**/*.test.ts"');

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/server\/package\.json/);
    expect(result.stderr).toMatch(/test\/support\/api-lifecycle\.ts/);
  });

  it('accepts a server pass that preloads it', () => {
    const result = runGuardWithApiScript(
      'node --import tsx --import ./test/support/api-lifecycle.ts --test "test/api/**/*.test.ts"',
    );

    expect(result.status, result.stderr).toBe(0);
  });

  // "A file the check cannot find the call in is a failure, never a skip."
  it('fails on a spec naming the registration only in a comment', () => {
    const result = runGuardOverSpec(
      [
        "import { test } from './support/test.js';",
        '// This file used to call cleanDaemonBeforeAll();',
        "test('lists containers', async () => {});",
        '',
      ].join('\n'),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/fabricated\.spec\.ts/);
  });
});

describe('Clean-daemon conformance check — what it accepts', () => {
  it('accepts a spec that registers the reset above every hook and every test', () => {
    const result = runGuardOver({ 'fabricated.spec.ts': conforming });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/passed/i);
  });

  // A `test(` inside a title or any other quoted literal is not a declaration.
  it.each([
    ["const title = \"test('lists containers')\";", 'a string literal'],
    ['const title = `test(${name})`;', 'a template literal'],
    ['const named = /^test\\(/.test(source);', "a regular expression's own .test("],
  ])('accepts %s standing before the registration (%s)', (line) => {
    const result = runGuardOverSpec(
      [
        "import { test } from './support/test.js';",
        "import { cleanDaemonBeforeAll } from './support/lifecycle.js';",
        '',
        line,
        '',
        'cleanDaemonBeforeAll();',
        '',
      ].join('\n'),
    );

    expect(result.status, result.stderr).toBe(0);
  });

  it('scans the tree recursively and only its spec files', () => {
    const result = runGuardOver({
      'fabricated.spec.ts': conforming,
      'nested/deeper.spec.ts': conforming,
      'support/lifecycle.ts': "export function cleanDaemonBeforeAll() {}\ntest('not a spec', () => {});\n",
      'notes.md': 'cleanDaemonBeforeAll is not called here.\n',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/\b2\b/);
  });

  // Comments are blanked with their newlines kept, so a reported line is the
  // file's own however long the comment above it is.
  it('reports the line a violation is written on, under a comment of any length', () => {
    const result = runGuardOverSpec(
      [
        '/*',
        ' * A file whose header runs on',
        ' * for several lines.',
        ' */',
        "import { cleanDaemonBeforeAll } from './support/lifecycle.js';",
        '',
        "test('lists containers', async () => {});",
        '',
        'cleanDaemonBeforeAll();',
        '',
      ].join('\n'),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/fabricated\.spec\.ts:7\b/);
  });
});

describe('Clean-daemon conformance check — the escape hatch there is not', () => {
  it.each(['clean-daemon-exception:', 'ui-blur-exception:', 'list-order-exception:'])(
    'is not exempted by a "%s" comment',
    (marker) => {
      const result = runGuardOverSpec(
        [`// ${marker} this file must not reset the daemon`, "test('lists containers', async () => {});", ''].join('\n'),
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/cleanDaemonBeforeAll/);
    },
  );
});

describe('Clean-daemon conformance check — how it answers', () => {
  it('exits zero over a conforming tree and says how much it checked', () => {
    const result = runGuardOver({ 'fabricated.spec.ts': conforming });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/spec files/i);
    expect(result.stdout).toMatch(/preload/i);
    expect(result.stderr).toBe('');
  });

  it('lists every violation, then their count and what a conforming file looks like', () => {
    const result = runGuardOver({
      'one.spec.ts': "test('lists containers', async () => {});\n",
      'two.spec.ts': "test('lists images', async () => {});\n",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/one\.spec\.ts/);
    expect(result.stderr).toMatch(/two\.spec\.ts/);
    expect(result.stderr).toMatch(/2 violation\(s\)/);
    expect(result.stderr).toMatch(/cleanDaemonBeforeAll/);
  });

  // REQ-63, REQ-67, REQ-72 — the repository's own two daemon-backed trees
  // conform, which is what the guard exists for. Run with no argument, so the
  // default tree is the one it scans.
  it('passes over the repository’s own end-to-end tree and server pass', () => {
    const run = spawnSync(process.execPath, [guardPath], { encoding: 'utf8' });

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/passed/i);
  });
});
