import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as library from '../../src/ui';

/**
 * **The retirement's closing statement** (`plan-ui-coherence-optimisation/REQ-82`,
 * `REQ-94`).
 *
 * Successor to `card-list-retirement-budget.test.ts`, whose premise the deletion
 * retires: a budget cannot count the call sites of a name nothing declares, and
 * REQ-94 requires it removed **with** the component rather than left asserting
 * zero. What replaces it is the requirement's own claim, in the requirement's own
 * form — "grep-able, and checked as such": the component, its export, its
 * stylesheet rules and the affordance whose sole call site it was are gone from
 * the product.
 *
 * **The product's tree, not the checks'.** A check names the retired component
 * precisely in order to assert that nothing draws it, and one that failed on
 * itself would say nothing about the product; the e2e comparison against the
 * delivered build names its class for the same reason.
 */

const clientRoot = process.cwd();

/** Every source file the product ships or builds with: the client's own code and its build scripts. */
function productFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : productFiles(path);
    return /\.(tsx?|css|mjs)$/.test(entry.name) ? [path] : [];
  });
}

function filesMatching(pattern: RegExp, ...roots: string[]): string[] {
  return roots
    .flatMap((root) => productFiles(join(clientRoot, root)))
    .filter((path) => pattern.test(readFileSync(path, 'utf8')))
    .map((path) => path.slice(clientRoot.length + 1).split('\\').join('/'))
    .sort();
}

describe('the second list component is gone from the product (REQ-82)', () => {
  // REQ-82 — "A list component left exported is the next screen's fifth answer": the component and
  // its props and row types, by name, anywhere the product is written.
  it('no source file of the client names it', () => {
    expect(filesMatching(/\bCardList\b/, 'src', 'scripts'), 'the retired list component is still named in the product').toEqual([]);
  });

  // REQ-82 — the export, which is what makes a deleted component still reachable.
  it('the library’s public entry point exports nothing named after it', () => {
    expect(Object.keys(library).filter((name) => /CardList/.test(name))).toEqual([]);
  });

  // REQ-82 — and its rules, since a component that no longer emits a class whose rule still exists
  // leaves the product one `className` away from drawing the arrangement again.
  it('no stylesheet of the library carries its rules', () => {
    expect(filesMatching(/ui-card-list/, 'src'), 'the retired list component’s rules are still in a stylesheet').toEqual([]);
  });
});

describe('the affordance it was the last consumer of went with it (REQ-82, REQ-27)', () => {
  /**
   * The orphan the batch record names: `Badge`'s click handler, whose only call
   * site anywhere was inside the deleted component. A dead prop is untidy; this
   * one manufactured, in one line, the badge-that-is-a-button REQ-27 forbids —
   * so it is removed by name rather than merely left unused. That `Badge` renders
   * no click target is `badge.test.tsx`'s; that it cannot be asked for one is
   * this.
   */
  it('the badge takes no click handler at all', () => {
    const badge = readFileSync(join(clientRoot, 'src', 'ui', 'controls', 'Badge.tsx'), 'utf8');
    expect(badge, 'the badge can still be asked to be a control').not.toMatch(/onClick/);
  });

  it('the controls stylesheet carries no clickable-badge rule', () => {
    const controls = readFileSync(join(clientRoot, 'src', 'ui', 'controls', 'controls.css'), 'utf8');
    expect(controls, 'the clickable badge’s rule survives the prop that drew it').not.toMatch(/ui-badge--clickable/);
  });
});

describe('the call-site budget retired with the component (REQ-94)', () => {
  /**
   * REQ-94's own closing condition. The budget existed to catch a **new** call
   * site appearing during the eight batches the component stayed exported, since
   * a count that merely fell would still look like progress; with the component
   * deleted there is nothing left to count, and an assertion of zero against a
   * name nothing declares is not a guard.
   *
   * REQ-84's other half — that the script's blur allow-list is unchanged — is
   * `blur-policy.test.ts`'s and is not restated here.
   */
  it('the conformance script holds no budget over a name nothing declares', () => {
    const script = readFileSync(join(clientRoot, 'scripts', 'check-ui-conformance.mjs'), 'utf8');
    expect(script, 'the retired component is still counted by the build check').not.toMatch(/\bCardList\b/);
  });
});
