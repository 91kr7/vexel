import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * **The source-level half of "absence is a behaviour, not a label"**
 * (`plan-docker_management_app-remove_copy_controls/REQ-25`).
 *
 * The human's report is one line — remove every copy button — and this file
 * answers the question "is it actually gone from what ships", over the client's
 * own trees.
 *
 * **The string `Copy` is never the criterion here, and that is the point.** Every
 * instance on the delivered build happened to be labelled `Copy`, which is a fact
 * about that build and not about the design: the removed component took a `label`
 * prop, so an icon-only or differently-worded instance was one edit away. A check
 * that grepped for the word would pass on a build still shipping the thing, which
 * is this report's first-named failure mode. What is asserted instead is the
 * **capability**: the clipboard API, the component, its public field, its
 * confirmation string, and the permission a check would have to be granted to
 * exercise one.
 *
 * **This file makes no geometric and no runtime claim.** It reads sources; it
 * cannot see a write arriving through a bundled dependency and it knows nothing
 * about layout. The runtime half — the page instrumented so that any clipboard
 * write is recorded, over all eight screens — is `e2e/copy-affordance-absence.spec.ts`
 * (REQ-25b), and the geometry the removal leaves behind is
 * `e2e/copy-affordance-geometry.spec.ts`. Neither is replaceable by this one.
 *
 * **The figures on the delivered build**, measured by this very check before the
 * removal existed (2026-08-14, this environment): 1 clipboard implementation,
 * 1 library export, 5 render sites, 13 `copyValue` props across 11 feature files,
 * 3 clipboard permission grants in the e2e tree — every one of which must now
 * count zero.
 */

const clientRoot = process.cwd();
const repositoryRoot = join(clientRoot, '..');

/**
 * The two checks that name the removed capability **in order to deny it**, and are therefore not
 * evidence of it.
 *
 * This file names every forbidden token so that it can assert nothing else does. Its runtime
 * counterpart replaces `navigator.clipboard` with a recorder before the application loads — the
 * instrument that proves no write occurs, which is the opposite of the dead scaffolding REQ-5
 * refuses. Both are exempted **by name and with the reason**, never by a pattern loose enough to
 * exempt a third file that quietly reinstates the capability.
 */
const CHECKS_THAT_DENY_IT = [join('test', 'unit', 'copy-affordance-absence.test.ts'), join('e2e', 'copy-affordance-absence.spec.ts')];

interface SourceFile {
  path: string;
  text: string;
}

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : filesUnder(path);
    return /\.(tsx?|css|mjs)$/.test(entry.name) ? [path] : [];
  });
}

function tree(...parts: string[]): SourceFile[] {
  return filesUnder(join(clientRoot, ...parts))
    .map((path) => ({ path: relative(clientRoot, path), text: readFileSync(path, 'utf8') }))
    .filter((file) => !CHECKS_THAT_DENY_IT.includes(file.path));
}

const shippedSources = tree('src');
/** Everything the client owns: what ships, and the checks that drive it. */
const allClientTrees = [...shippedSources, ...tree('test'), ...tree('e2e')];

function hits(files: SourceFile[], pattern: RegExp): string[] {
  return files.flatMap((file) =>
    file.text
      .split('\n')
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => pattern.test(line))
      .map(({ line, number }) => `${file.path}:${number} — ${line.trim()}`),
  );
}

describe('nothing in the shipped client reaches the clipboard (REQ-2)', () => {
  // REQ-2 — the capability itself, in every spelling the platform offers. The delivered build had
  // exactly one: `CopyButton.tsx:21`.
  it.each([
    ['the clipboard object', /navigator\s*(\.|\[\s*['"])\s*clipboard/],
    ['a clipboard write', /\bwriteText\s*\(/],
    ['the legacy copy command', /execCommand\s*\(\s*['"`]copy['"`]\s*\)/],
    ['a clipboard read', /\breadText\s*\(/],
  ])('the client sources contain no %s', (_what, pattern) => {
    expect(hits(shippedSources, pattern)).toEqual([]);
  });

  // REQ-2 — a helper package would put the same capability back without any of the spellings above
  // appearing in a source file, so the dependency list is checked rather than trusted.
  it('the client depends on no clipboard helper package', () => {
    const manifest = JSON.parse(readFileSync(join(clientRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})];
    expect(declared.filter((name) => /clip(board)?|copy/i.test(name))).toEqual([]);
  });
});

describe('the component is deleted, not orphaned (REQ-6, REQ-8, REQ-10)', () => {
  // REQ-6 — **absent, not empty**: a file left in `client/src/ui/` with no consumer is the product
  // still holding the thing the human asked to remove, in the one place he cannot see it.
  it('the component file no longer exists on disk', () => {
    expect(existsSync(join(clientRoot, 'src', 'ui', 'controls', 'CopyButton.tsx'))).toBe(false);
  });

  // REQ-6 — and the library no longer offers it to the next feature that imports the library.
  it('the library entry point exports no such component', () => {
    const entry = readFileSync(join(clientRoot, 'src', 'ui', 'index.ts'), 'utf8');
    expect(entry.split('\n').filter((line) => /CopyButton/.test(line))).toEqual([]);
  });

  // REQ-6, REQ-10 — no import, no render site, no type reference, anywhere the client owns.
  it('no file in src, test or e2e names the removed component', () => {
    expect(hits(allClientTrees, /\bCopyButton\b/)).toEqual([]);
  });

  // REQ-8 — the retired field of the definition-list item type, in the sources that ship: neither
  // declared nor passed, in any spelling.
  it('no shipped source states the retired copy field', () => {
    expect(hits(shippedSources, /\bcopyValue\b/)).toEqual([]);
  });

  // REQ-8, REQ-10 — and no check passes one either. **A field being *set*, not the word**: a check
  // legitimately names the retired field in prose, and in an assertion that it is gone from the type
  // (`property-columns-contract.test.tsx`), which is a record of what changed rather than a caller
  // of it. `test:typecheck -w client` is what actually proves a caller passing one fails to compile,
  // across `src`, `test` and `e2e` at once; this states the same fact where the count of the
  // delivered thirteen was taken, so the two halves cannot drift apart.
  it('no check passes the retired copy field to a component', () => {
    expect(hits(allClientTrees, /\bcopyValue\s*:/)).toEqual([]);
  });

  // REQ-4 — the confirmation state goes with the control: the swapped label and the timer behind it.
  it('no source carries the confirmation string the control showed', () => {
    expect(hits(allClientTrees, /\bCopied\b/)).toEqual([]);
  });
});

describe('no scaffolding survives the capability it served (REQ-5, REQ-10)', () => {
  // REQ-5 — a suite still asking the browser for a permission nothing uses hides from the next
  // reader whether the removal was complete. Three grants shipped; none may remain.
  it('no check grants a clipboard permission', () => {
    expect(hits(allClientTrees, /clipboard-(read|write)/)).toEqual([]);
  });

  // REQ-10 — and none stubs the API instead, which would be the same scaffolding under another name.
  it('no check stubs the clipboard API', () => {
    expect(hits(allClientTrees, /['"]clipboard['"]\s*,/)).toEqual([]);
  });
});

describe('the records describe the product that ships (REQ-22)', () => {
  // REQ-22 — a spec for a deleted component is the same orphan as an unused file.
  it('the library holds no specification for the removed component', () => {
    expect(existsSync(join(repositoryRoot, '.sdd', 'modules', 'ui-library', 'specs', 'copy-button.md'))).toBe(false);
  });

  // REQ-22 — and its row leaves the module index, which is what a reader consults first.
  it('the library index lists no row for the removed component', () => {
    const index = readFileSync(join(repositoryRoot, '.sdd', 'modules', 'ui-library', 'index.md'), 'utf8');
    expect(index.split('\n').filter((line) => /CopyButton|copy-button/.test(line))).toEqual([]);
  });
});
