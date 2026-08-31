import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DefinitionList } from '../../src/ui';

/**
 * **What the retirement of the caller-stated count has to leave behind.** REQ ids
 * belong to `plan-docker_management_app-detail_property_columns`.
 *
 * Written beside `property-columns-contract.test.tsx`, not instead of it: that
 * file checks what a caller may state and that no feature file states a layout
 * constant. What is checked here is the other half of REQ-25 — that the two-track
 * rule itself is **gone from the product**, not merely unreferenced — the
 * invariant the deletion of the row's `space-between` now rests on, and the
 * record REQ-38 asks for.
 *
 * **Contract and state only, and deliberately so** (REQ-43): jsdom has no layout
 * and reports every box as zero, so no column count and no width is asserted
 * here. The geometry lives in the Playwright tree.
 */

const clientRoot = process.cwd();
const source = (...parts: string[]) => readFileSync(join(clientRoot, ...parts), 'utf8');

/** Every file of the client's own trees — sources, unit tests and specs alike. */
function clientFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : clientFiles(path);
    return /\.(tsx?|css|mjs)$/.test(entry.name) ? [path] : [];
  });
}

afterEach(cleanup);

describe('the two-track rule is removed from the product, not merely unused', () => {
  /**
   * REQ-25 — the class **and** its `grid-template-columns: 1fr 1fr` rule are what
   * produced the ~150–180px cell, so a stylesheet still carrying them would leave
   * the product one `className` away from the delivered defect. A component that
   * no longer emits a rule that still exists is not a retirement.
   */
  // The product's own trees, not the checks': a check names the retired class precisely in order to
  // assert that nothing draws it, and one that failed on itself would say nothing about the product.
  it('no source file names the retired two-track class', () => {
    const naming = clientFiles(join(clientRoot, 'src'))
      .filter((path) => /ui-definition-list--columns-2/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(clientRoot.length + 1));
    expect(naming, 'the retired two-track class is still written somewhere in the client').toEqual([]);
  });

  // REQ-25 — and the stylesheet that drew the property bands states no fixed track count for them.
  it('the property list stylesheet declares no fixed two-track template', () => {
    const stylesheet = source('src', 'ui', 'data', 'data-table.css');
    // The rules between the definition list's first one and the next component's. The upper bound
    // used to be the card list's, which `plan-ui-coherence-optimisation/REQ-82` deleted from the
    // stylesheet — an `indexOf` of -1 that silently widened the slice to the whole file.
    const definitionListRules = stylesheet.slice(stylesheet.indexOf('.ui-definition-list'), stylesheet.indexOf('.ui-code-viewer'));
    expect(definitionListRules, 'a definition-list rule still states a track template of its own').not.toMatch(/grid-template-columns/);
  });
});

describe('every list takes the one arrangement that is left', () => {
  /**
   * REQ-1, REQ-25 — the bound on the label→value run is carried by the rule
   * keyed on the shared arrangement (`.ui-content-columns > .ui-definition-list__row`),
   * and the row's own rule no longer states a justification of its own. A list
   * that did not carry the arrangement class would therefore be an unbounded band
   * again, which is the defect in a new spelling — so **every** list carries it,
   * whatever content class it declares and when it declares none.
   */
  it.each([[undefined], ['short-scalar'], ['long-single-line'], ['free-text']] as const)(
    'a list declaring %s carries the shared arrangement',
    (contentClass) => {
      const { container } = render(<DefinitionList items={[{ label: 'Id', value: 'sha256:abc' }]} contentClass={contentClass} />);
      const list = container.firstElementChild!;
      expect(list.className, 'the list does not carry the shared arrangement, so the bound on its label→value run is not applied to it').toContain('ui-content-columns');
      // The band is a direct child of the arrangement: the bound rule is a child selector.
      expect(list.querySelector('.ui-definition-list__row')?.parentElement).toBe(list);
    },
  );
});

describe('the classification of every call site is on record', () => {
  /**
   * REQ-38, REQ-6 — the record is what makes the next screen a decision rather
   * than a guess, and this batch is where it is completed with the five surfaces
   * that used to state a count. "Four and a shrug" is how it gets got wrong, so
   * the check is over **every** file that renders a property section, not over a
   * list written here.
   *
   * `.sdd/modules/` is the module documentation, not a plan artefact: it outlives
   * this report, which is why a check may rest on it.
   */
  const featureRoot = join(clientRoot, 'src');
  const record = readFileSync(join(clientRoot, '..', '.sdd', 'modules', 'ui-library', 'specs', 'content-columns.md'), 'utf8');

  function componentsRenderingASection(): string[] {
    return clientFiles(featureRoot)
      .filter((path) => !path.includes(`${join('src', 'ui')}`) && path.endsWith('.tsx'))
      .filter((path) => /<(DefinitionList|ContentColumns)\b/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(path.lastIndexOf('/') + 1).replace('.tsx', ''));
  }

  it('every component that renders a property section is classified in the library spec', () => {
    const unrecorded = componentsRenderingASection().filter((component) => !record.includes(`\`${component}\``));
    expect(unrecorded, 'these components render a property section whose content class is recorded nowhere').toEqual([]);
  });

  // REQ-6 — and the surface that used to state a count is recorded as taking the default
  // deliberately, which its source must then actually do: a record and a source that disagree is
  // worse than no record at all. The other four were the swarm screen's panels and left with the
  // area on 2026-08-27 (plan-docker_management_app-swarm_removal/REQ-1).
  it.each([['coverage/CoverageMatrixScreen.tsx']])('%s is recorded, and states what the record says it states', (path) => {
    const component = path.slice(path.lastIndexOf('/') + 1).replace('.tsx', '');
    const rows = record.split('\n').filter((line) => line.startsWith(`| \`${component}\``));
    expect(rows.length, `${component} carries no row in the classification table`).toBeGreaterThan(0);

    const declaresDefault = rows.every((row) => /short scalar \(default\)/.test(row));
    const statesAClass = /contentClass/.test(source('src', ...path.split('/')));
    expect(statesAClass, `${component} declares a content class where the record says it takes the default`).toBe(!declaresDefault);
  });
});
