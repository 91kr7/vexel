import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * How the two daemon-backed passes are arranged
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-67,
 * REQ-68, REQ-70, REQ-71).
 *
 * Every statement below is one a machine can decide from the manifests, the
 * Playwright configuration and the trees themselves, and each is the half of a
 * requirement that says what must *not* be there — a preparation step ahead of a
 * pass, a reset in a tree that reaches no daemon, a separate home for the files
 * that prune the host. An absence is what nobody notices coming back.
 */

const clientRoot = process.cwd();
const repositoryRoot = join(clientRoot, '..');

function manifest(workspace: string): { scripts: Record<string, string> } {
  const path = workspace === '' ? join(repositoryRoot, 'package.json') : join(repositoryRoot, workspace, 'package.json');
  return JSON.parse(readFileSync(path, 'utf8')) as { scripts: Record<string, string> };
}

const rootScripts = manifest('').scripts;
const serverScripts = manifest('server').scripts;
const clientScripts = manifest('client').scripts;

/** The Playwright configuration as Playwright itself resolves it, not as text. */
function playwrightConfig(): { projects: string[]; globalSetup: string | null; globalTeardown: string | null } {
  const source =
    "const config = (await import('./playwright.config.ts')).default;" +
    'console.log(JSON.stringify({' +
    'projects: (config.projects ?? []).map((project) => project.name),' +
    'globalSetup: config.globalSetup ?? null,' +
    'globalTeardown: config.globalTeardown ?? null,' +
    '}));';
  const run = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
    cwd: clientRoot,
    encoding: 'utf8',
  });
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout.trim().split('\n').at(-1)!);
}

function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...filesUnder(full));
    else found.push(full);
  }
  return found;
}

describe('The host-wide tests are kept apart by nothing (REQ-71)', () => {
  it.each(['server/test/exclusive', 'client/e2e/exclusive'])('has no %s directory', (path) => {
    expect(existsSync(join(repositoryRoot, path))).toBe(false);
  });

  it('declares no command of its own for them, in any workspace', () => {
    const named = Object.entries({ ...rootScripts, ...serverScripts, ...clientScripts }).filter(
      ([name, body]) => /destructive|exclusive/i.test(name) || /destructive-tests|test:destructive/i.test(body),
    );

    expect(named).toEqual([]);
  });

  it('runs the whole end-to-end suite as one Playwright project', () => {
    expect(playwrightConfig().projects).toHaveLength(1);
  });
});

describe('No preparation step runs ahead of a pass (REQ-70)', () => {
  it('keeps the two steps as commands an operator types', () => {
    expect(serverScripts['test:images']).toBeTruthy();
    expect(serverScripts['test:registry']).toBeTruthy();
  });

  it.each(['test', 'test:api'])('does not run either of them from the server pass (%s)', (script) => {
    expect(serverScripts[script]).not.toMatch(/test:images|test:registry/);
  });

  it('starts the end-to-end suite with no global setup', () => {
    expect(playwrightConfig().globalSetup).toBeNull();
  });
});

describe('The unit trees reset nothing (REQ-68)', () => {
  it.each(['server', 'client'])('does not preload the reset in the %s unit pass', (workspace) => {
    const script = workspace === 'server' ? serverScripts['test:unit'] : clientScripts['test:unit'];

    expect(script).not.toMatch(/api-lifecycle/);
  });

  // What is looked for is an import of the reset, not the word: a check about
  // the reset is entitled to name it, and two files of this tree do.
  it.each(['server/test/unit', 'client/test/unit'])('holds no file of %s that imports the reset', (tree) => {
    const importing = filesUnder(join(repositoryRoot, tree)).filter((path) => {
      const source = readFileSync(path, 'utf8');
      return /^\s*import\b[^\n]*\bresetDaemon\b/m.test(source) || /^\s*import\b[^\n]*support\/lifecycle/m.test(source);
    });

    expect(importing).toEqual([]);
  });
});

describe('The server pass resets before the file, not beside it (REQ-67)', () => {
  const preload = readFileSync(join(repositoryRoot, 'server', 'test', 'support', 'api-lifecycle.ts'), 'utf8');

  it('awaits the reset at the module top level', () => {
    expect(preload).toMatch(/^await resetDaemon\(\);$/m);
  });

  it('registers it in no hook', () => {
    const hookCalls = preload.split('\n').filter((line) => /^\s*before\s*\(/.test(line));

    expect(hookCalls).toEqual([]);
  });
});
