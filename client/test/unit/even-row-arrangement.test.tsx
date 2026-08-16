import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Grid } from '../../src/ui';

afterEach(cleanup);

// ui-library/specs/layout-primitives.md — "even-row — every child in a track of its own, all of
// equal width, on one row: the track count **is** the child count, whatever that count is, so no
// child is ever left alone on a row the others do not share. Below the phone breakpoint the row
// becomes a single stacked column." (plan-ui-coherence-optimisation/REQ-63)
//
// jsdom performs no layout, so what a track resolves to is measured in the browser
// (`e2e/container-detail-density.spec.ts`). What is pinned here is the mechanism the arrangement is
// required to use — implicit tracks derived from the children — since a hard-coded count is exactly
// the defect REQ-63 records: a grid fitting four columns to five metrics.

/** The style rules of the layout stylesheet, selector and declarations, comments stripped. */
function layoutRules(): { selector: string; declarations: string; media: string | null }[] {
  const css = readFileSync(join(process.cwd(), 'src/ui/layout/layout.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: { selector: string; declarations: string; media: string | null }[] = [];
  const media = [...css.matchAll(/@media([^{]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g)];
  for (const block of media) {
    for (const rule of block[2].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      rules.push({ selector: rule[1].trim(), declarations: rule[2], media: block[1].trim() });
    }
  }
  const withoutMedia = css.replace(/@media([^{]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g, '');
  for (const rule of withoutMedia.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ selector: rule[1].trim(), declarations: rule[2], media: null });
  }
  return rules;
}

describe('Grid — the even-row arrangement (plan-ui-coherence-optimisation/REQ-63)', () => {
  // layout-primitives.md — "the caller asks for the shape and states no template and no gap
  // (columns and gap are ignored when it is set)"
  it('owns the tracks and the gap, ignoring any template the caller passes', () => {
    const { container } = render(
      <Grid arrangement="even-row" columns="repeat(4, 1fr)" gap="40px">
        <span>one</span>
        <span>two</span>
      </Grid>,
    );

    const grid = container.querySelector('.ui-grid') as HTMLElement;
    expect(grid.classList.contains('ui-grid--even-row')).toBe(true);
    expect(grid.style.gridTemplateColumns, 'the caller\'s template reached the element').toBe('');
    expect(grid.style.gap, 'the caller\'s gap reached the element').toBe('');
  });

  // layout-primitives.md — "the track count **is** the child count, whatever that count is"
  it('places every child in the grid, whatever the count', () => {
    for (const count of [2, 5, 6]) {
      const { container, unmount } = render(
        <Grid arrangement="even-row">
          {Array.from({ length: count }, (_, index) => (
            <span key={index}>{index}</span>
          ))}
        </Grid>,
      );

      expect(container.querySelector('.ui-grid')!.children).toHaveLength(count);
      unmount();
    }
  });

  // layout-primitives.md — the tracks are **implicit**, derived from the children placed in the
  // grid: a `grid-template-columns` with a count in it is what leaves the count and the children out
  // of step, which is the delivered defect
  it('derives its tracks from its children rather than declaring a count', () => {
    const rules = layoutRules().filter((rule) => rule.selector === '.ui-grid--even-row');

    expect(rules.length, 'the library declares no even-row arrangement').toBeGreaterThan(0);
    const above = rules.find((rule) => rule.media === null)!;
    expect(above.declarations, 'the arrangement states a track template instead of deriving one').not.toMatch(
      /grid-template-columns\s*:/,
    );
    expect(above.declarations).toMatch(/grid-auto-flow\s*:\s*column/);
    expect(above.declarations, 'the tracks are not equal, so one child can be narrower than the others').toMatch(
      /grid-auto-columns\s*:\s*minmax\(\s*0\s*,\s*1fr\s*\)/,
    );
  });

  // layout-primitives.md — "Below the phone breakpoint the row becomes a single stacked column", at
  // the one breakpoint the shell already uses (720px)
  it('stacks into one column below the phone breakpoint, and nowhere else', () => {
    const stacking = layoutRules().filter((rule) => rule.selector === '.ui-grid--even-row' && rule.media !== null);

    expect(stacking, 'the arrangement never stacks').toHaveLength(1);
    expect(stacking[0]!.media).toMatch(/max-width\s*:\s*720px/);
    expect(stacking[0]!.declarations).toMatch(/grid-auto-flow\s*:\s*row/);
  });
});
