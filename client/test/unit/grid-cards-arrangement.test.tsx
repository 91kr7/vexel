import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Grid, GridSpan } from '../../src/ui';

afterEach(cleanup);

/**
 * `ui-library/specs/layout-primitives.md` — "`cards` — a list of entity cards, **three to a row**;
 * two tracks where three would each fall under a readable card width (≤1200px), one below the phone
 * breakpoint. Every card of a row is as tall as the tallest card of that row; rows are **not**
 * matched to each other and no minimum height is imposed."
 * (`plan-docker_management_app-containers_card_view/REQ-1`, `REQ-23`, `REQ-32`).
 *
 * jsdom performs no layout, so what a track *resolves* to is measured in the browser
 * (`e2e/containers-card-geometry.spec.ts`). What is pinned here is what the arrangement is required
 * to declare — a stated count rather than an auto-fit, and the two breakpoints that change it.
 */

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

function declarationsOf(selector: string, media: RegExp | null = null): string {
  return layoutRules()
    .filter((rule) => rule.selector.split(',').some((one) => one.trim() === selector))
    .filter((rule) => (media === null ? rule.media === null : rule.media !== null && media.test(rule.media)))
    .map((rule) => rule.declarations)
    .join(' ');
}

function trackCount(declarations: string): number {
  const repeat = /grid-template-columns:\s*repeat\((\d+)\s*,/.exec(declarations);
  if (repeat) return Number(repeat[1]);
  return /grid-template-columns:\s*minmax\([^)]*\)\s*;/.test(declarations) ? 1 : Number.NaN;
}

describe('Grid — the cards arrangement (containers_card_view/REQ-1)', () => {
  // layout-primitives.md — "the caller asks for the shape and states no template and no gap".
  it('owns the tracks and the gap, ignoring any template the caller passes', () => {
    const { container } = render(
      <Grid arrangement="cards" columns="repeat(4, 1fr)" gap="40px">
        <span>one</span>
      </Grid>,
    );

    const grid = container.querySelector('.ui-grid') as HTMLElement;
    expect(grid.classList.contains('ui-grid--cards')).toBe(true);
    expect(grid.style.gridTemplateColumns, "the caller's template reached the element").toBe('');
    expect(grid.style.gap, "the caller's gap reached the element").toBe('');
  });

  // "three to a row; two tracks at ≤1200px, one below the phone breakpoint" — the count is stated,
  // never discovered from whatever the widest card's content happened to be.
  it('states three tracks, two at 1200px and one at the phone breakpoint, and auto-fits nothing', () => {
    const base = declarationsOf('.ui-grid--cards');

    expect(base, 'the cards arrangement declares no tracks at all').not.toBe('');
    expect(trackCount(base), `three cards to a row are not declared: ${base}`).toBe(3);
    expect(base, 'the track count is discovered from the content instead of being stated').not.toMatch(/auto-fit|auto-fill/);
    expect(trackCount(declarationsOf('.ui-grid--cards', /max-width:\s*1200px/))).toBe(2);
    expect(trackCount(declarationsOf('.ui-grid--cards', /max-width:\s*720px/))).toBe(1);
  });

  // "Its two breakpoints are the only widths at which the stated count changes."
  it('changes its count at those two widths and at no third one', () => {
    const widths = layoutRules()
      .filter((rule) => rule.selector.split(',').some((one) => one.trim() === '.ui-grid--cards'))
      .filter((rule) => rule.media !== null)
      .map((rule) => /max-width:\s*(\d+)px/.exec(rule.media!)?.[1]);

    expect(new Set(widths)).toEqual(new Set(['1200', '720']));
  });

  // "Every card of a row is as tall as the tallest card of that row; rows are not matched to each
  // other and no minimum height is imposed."
  it('equalises the cards of a row and imposes no height of its own', () => {
    const base = declarationsOf('.ui-grid--cards');

    expect(base, 'the cards of a row are not laid out to a shared height').toMatch(/align-items:\s*stretch/);
    expect(base, 'a height is imposed on every card of the grid').not.toMatch(/(^|;|\s)(min-height|height|grid-auto-rows)\s*:/);
  });
});

describe('GridSpan — a child taking the whole row (containers_card_view/REQ-23)', () => {
  it('takes every track of whatever arrangement it stands in', () => {
    const { container } = render(
      <Grid arrangement="cards">
        <span>a card</span>
        <GridSpan>
          <span>the expansion</span>
        </GridSpan>
      </Grid>,
    );

    const span = container.querySelector('.ui-grid__span-full') as HTMLElement;
    expect(span.textContent).toBe('the expansion');
    expect(declarationsOf('.ui-grid__span-full'), 'the span does not take the whole row').toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });

  it('imposes nothing on the child it holds', () => {
    const { container } = render(
      <Grid arrangement="cards">
        <GridSpan>
          <span className="probe">held</span>
        </GridSpan>
      </Grid>,
    );

    expect((container.querySelector('.ui-grid__span-full') as HTMLElement).className).toBe('ui-grid__span-full');
    expect(container.querySelector('.probe')?.textContent).toBe('held');
  });
});
