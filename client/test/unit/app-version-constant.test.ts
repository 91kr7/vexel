// @vitest-environment node
// The version constant is read by the build configs, which run in Node: jsdom
// rewrites module URLs to a scheme `node:fs` cannot open, so this file is the
// one that runs outside the browser environment. The `define` substitution is
// independent of the environment, so `__APP_VERSION__` is checked here all the
// same.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appVersionDefine, readAppVersion } from '../../app-version';

// The build-time version constant (app-shell/specs/app-version-constant.md):
// the running version must reach the client as a plain constant, from the one
// place the repository declares it, without a request and without a second
// version string anywhere.

const repositoryRoot = join(process.cwd(), '..');

function rootVersion(): string {
  const manifest = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as { version?: string };
  if (!manifest.version) throw new Error('the repository root package.json declares no version');
  return manifest.version;
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('node:fs');
});

describe('Build-time version constant (app-shell/specs/app-version-constant.md)', () => {
  // "a string constant available to every module of the client, holding the version the repository
  // root package.json declares"
  it('substitutes the declared version into client code', () => {
    expect(typeof __APP_VERSION__).toBe('string');
    expect(__APP_VERSION__).toBe(rootVersion());
  });

  // "it is substituted into the code when the client is built, and equally when the client is run
  // under unit test": this file running at all is the unit-test half; the build half is the define
  // the app's own config carries
  it('is defined for the application build from the same reading', () => {
    expect(appVersionDefine.__APP_VERSION__).toBe(JSON.stringify(rootVersion()));
    expect(readAppVersion()).toBe(rootVersion());
  });

  // "The root package.json is the single place the running version lives"
  it('leaves the workspace manifests unversioned, so no two strings can disagree', () => {
    for (const workspace of ['client', 'server']) {
      const manifest = JSON.parse(readFileSync(join(repositoryRoot, workspace, 'package.json'), 'utf8')) as { version?: string };
      expect(manifest.version, `${workspace}/package.json declares a version of its own`).toBe('0.0.0');
    }
  });

  // "A root package.json declaring no version fails the build rather than producing a build that
  // displays nothing"
  it('fails rather than producing a build with nothing to display', async () => {
    for (const manifest of ['{}', '{"version": ""}', '{"version": 3}']) {
      vi.resetModules();
      vi.doMock('node:fs', () => ({ readFileSync: () => manifest }));

      // Configuring the build is where the reading happens, so the failure is
      // the module refusing to load at all rather than a value nobody checked.
      await expect(import('../../app-version'), `a root manifest of ${manifest} configured a build instead of failing`).rejects.toThrow();
    }
  });
});
