import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What a comment of the test trees, the check scripts and the manifests names
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-78).
 *
 * The requirement's rule is that no comment names a file, a command or an
 * arrangement that was removed. An arrangement takes a reader to decide; a path
 * and a command do not, and those are the two halves a machine can hold from
 * here on.
 *
 * Only lines that open as a comment are read. A path inside a string literal is
 * fixture content — the conformance-check tests build synthetic trees out of
 * exactly such names — and asserting on those would report the fixture as a
 * defect.
 */

const clientRoot = process.cwd();
const repositoryRoot = join(clientRoot, '..');

/** The ground the requirement's sweep covers. */
const TREES = ['client/e2e', 'client/test', 'server/test', 'client/scripts', 'server/scripts', 'scripts'];
const MANIFESTS = ['package.json', 'client/package.json', 'server/package.json'];

interface Passage {
  where: string;
  /** The workspace a relative path in this passage is resolved against, '' for the repository root. */
  workspace: string;
  text: string;
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

function commentLines(source: string): string[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('//') || line.startsWith('/*') || line.startsWith('*'));
}

function workspaceOf(path: string): string {
  if (path.startsWith('client/')) return 'client';
  if (path.startsWith('server/')) return 'server';
  return '';
}

function passages(): Passage[] {
  const collected: Passage[] = [];

  for (const tree of TREES) {
    const sources = filesUnder(join(repositoryRoot, tree)).filter((path) => /\.(ts|tsx|mjs)$/.test(path));
    for (const path of sources) {
      const where = path.slice(repositoryRoot.length + 1);
      for (const text of commentLines(readFileSync(path, 'utf8'))) {
        collected.push({ where, workspace: workspaceOf(where), text });
      }
    }
  }

  // A manifest carries its prose under keys opening with `//`, which is this
  // repository's comment in a file that admits none.
  for (const manifest of MANIFESTS) {
    const parsed = JSON.parse(readFileSync(join(repositoryRoot, manifest), 'utf8')) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (key.startsWith('//') && typeof value === 'string') {
        collected.push({ where: `${manifest} ${key}`, workspace: workspaceOf(manifest), text: value });
      }
    }
  }

  return collected;
}

const PASSAGES = passages();

describe('Every comment of the test trees names a file that exists (REQ-78)', () => {
  it('reads the whole ground the sweep covers', () => {
    expect(PASSAGES.length).toBeGreaterThan(1000);
  });

  // A path rooted at a workspace or at the repository: what a comment writes
  // when it sends the reader to another file of the project.
  it('resolves every path it writes', () => {
    const pattern = /\b(?:client|server|scripts)\/[A-Za-z0-9_@./-]*[A-Za-z0-9_-]\.(?:ts|tsx|mjs|css|json|md)\b/g;
    const dangling: string[] = [];

    for (const passage of PASSAGES) {
      for (const named of passage.text.match(pattern) ?? []) {
        const candidates = [join(repositoryRoot, named)];
        if (passage.workspace) candidates.push(join(repositoryRoot, passage.workspace, named));
        if (!candidates.some((candidate) => existsSync(candidate))) dangling.push(`${passage.where}: ${named}`);
      }
    }

    expect(dangling).toEqual([]);
  });

  // The form a comment cites a component contract in: `<module>/specs/<component>.md`.
  it('resolves every component spec it cites', () => {
    const pattern = /\b[a-z0-9][a-z0-9-]*\/specs\/[a-z0-9][a-z0-9-]*\.md\b/g;
    const dangling: string[] = [];

    for (const passage of PASSAGES) {
      for (const named of passage.text.match(pattern) ?? []) {
        if (!existsSync(join(repositoryRoot, '.sdd', 'modules', named))) dangling.push(`${passage.where}: ${named}`);
      }
    }

    expect(dangling).toEqual([]);
  });
});

describe('Every comment of the test trees names a command that exists (REQ-78)', () => {
  it('declares every npm script it names', () => {
    const declared = new Set(
      MANIFESTS.flatMap((manifest) => {
        const parsed = JSON.parse(readFileSync(join(repositoryRoot, manifest), 'utf8')) as { scripts?: Record<string, string> };
        return Object.keys(parsed.scripts ?? {});
      }),
    );
    const pattern = /\bnpm run ([a-z0-9:_-]*[a-z0-9])/g;
    const dangling: string[] = [];

    for (const passage of PASSAGES) {
      for (const [, named] of passage.text.matchAll(pattern)) {
        if (!declared.has(named)) dangling.push(`${passage.where}: npm run ${named}`);
      }
    }

    expect(dangling).toEqual([]);
  });
});
