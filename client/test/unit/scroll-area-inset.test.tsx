import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ScrollArea } from '../../src/ui';

afterEach(cleanup);

/**
 * `ScrollArea`'s named `inset` (`ui-library/specs/scroll-area.md`,
 * `…-tabs_composition_refactor/REQ-53`).
 *
 * REQ-53 has two halves and the second is the one with the blast radius: *"Every other consumer of
 * the shared scroll region keeps the box it has today."* Eight of the library's own surfaces scroll
 * through this one region and each aligns something of its own against its box — a sticky header, a
 * virtualised run of rows, a gutter of line numbers. What that promise reduces to, and what is
 * checked here, is two facts that hold wherever those surfaces are drawn: **the bare region adds
 * nothing at all to the box its content is measured against**, and **no consumer but the detail's
 * document tabs asks for the room**. What the room actually resolves to on screen — a card's whole
 * drop shadow inside the scroller, a gutter beside the scrollbar — is measured in
 * `e2e/container-detail-config-reading.spec.ts`.
 */

/** The style rules of the region's stylesheet, selector and declarations, comments stripped. */
function scrollAreaRules(): { selector: string; declarations: string }[] {
  const css = readFileSync(join(process.cwd(), 'src/ui/glass/scroll-area.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((rule) => ({ selector: rule[1].trim(), declarations: rule[2] }));
}

/** Every property that moves an edge of the region or of what it holds. */
const BOX_PROPERTIES = /(^|\s)(padding|padding-[a-z]+|margin|margin-[a-z]+|border|border-[a-z-]+|scrollbar-gutter|scrollbar-width|box-sizing|width|height|max-width|min-width|gap)\s*:/;

/** The eight library surfaces the spec names as sharing this region. */
const SHARED_CONSUMERS = [
  'ui/data/LogStream.tsx',
  'ui/console/ConsoleSurface.tsx',
  'ui/data/DataTable.tsx',
  'ui/data/TreeView.tsx',
  'ui/data/ContentViewer.tsx',
  'ui/data/CodeViewer.tsx',
  'ui/feedback/EventStream.tsx',
];

function source(path: string): string {
  return readFileSync(join(process.cwd(), 'src', path), 'utf8');
}

describe('ScrollArea — the room is asked for by name (REQ-53)', () => {
  // scroll-area.md — "`inset` (default off)". A caller that says nothing gets the bare region.
  it('gives a caller that asks for nothing the bare region', () => {
    const { container } = render(
      <ScrollArea>
        <p>content</p>
      </ScrollArea>,
    );

    const region = container.querySelector('.ui-scroll-area') as HTMLElement;
    expect(region, 'the region is not drawn at all').not.toBeNull();
    expect(region.className, 'a caller that asked for nothing was given the inset region').not.toMatch(/ui-scroll-area--inset/);
    expect(region.getAttribute('style'), 'the bare region carries a style of its own').toBeNull();
  });

  it('gives the room to a caller that asks for it by name', () => {
    const { container } = render(
      <ScrollArea inset>
        <p>content</p>
      </ScrollArea>,
    );

    const region = container.querySelector('.ui-scroll-area') as HTMLElement;
    expect(region.className, 'the named inset is not what the caller was given').toMatch(/ui-scroll-area--inset/);
    // The room is the library's, stated once in its own stylesheet: nothing about it reaches the
    // element as a value (REQ-38).
    expect(region.getAttribute('style'), 'the inset reaches the element as an inline value').toBeNull();
  });

  // scroll-area.md — "off, the region adds nothing at all to the box its content is measured
  // against", and "The inset is one bounded set of values, stated once here and nowhere else".
  it('adds nothing to the box of the bare region, the room living on the named one alone', () => {
    const rules = scrollAreaRules();
    const bare = rules.filter((rule) => /(^|,)\s*\.ui-scroll-area\s*(,|$)/.test(rule.selector));
    const inset = rules.filter((rule) => rule.selector.includes('.ui-scroll-area--inset'));

    expect(bare.length, 'the stylesheet declares no bare region at all').toBeGreaterThan(0);
    for (const rule of bare) {
      expect(
        rule.declarations,
        `"${rule.selector}" moves an edge of the bare region — the box eight other surfaces are measured against — with: ${rule.declarations.trim()}`,
      ).not.toMatch(BOX_PROPERTIES);
    }
    expect(inset.length, 'the named inset declares nothing, so asking for it by name buys no room').toBeGreaterThan(0);
    expect(inset.map((rule) => rule.declarations).join(' '), 'the named inset reserves no gutter for the scrollbar').toMatch(/scrollbar-gutter\s*:\s*stable/);
    expect(inset.map((rule) => rule.declarations).join(' '), 'the named inset leaves no room around what it scrolls').toMatch(/padding\s*:/);
  });

  // scroll-area.md — "None of them changes box because another consumer needed room, and a consumer
  // that needs room asks for `inset` rather than stating a value at its own call site."
  it('leaves the eight shared consumers on the bare region', () => {
    for (const path of SHARED_CONSUMERS) {
      const text = source(path);
      const calls = [...text.matchAll(/<ScrollArea[^>]*>/gs)].map((match) => match[0]);
      expect(calls.length, `${path} no longer scrolls through the shared region, so this check has stopped covering it`).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call, `${path} asks the shared region for room, which moves the box it aligns its own content against`).not.toMatch(/\binset\b/);
      }
    }
  });

  // container-detail-panel.md — "Config, Stats and Inspect ask the library's scrolled region for its
  // named `inset` […] The tabs that are surfaces of their own — Logs, Processes, Exec, Attach —
  // take the region as it is, and so does every other consumer of that region in the application."
  it('is asked for the room by the detail’s document tabs and by nothing else in the application', () => {
    const asking: string[] = [];
    for (const path of ['containers/ContainerDetailPanel.tsx', ...SHARED_CONSUMERS]) {
      for (const call of [...source(path).matchAll(/<ScrollArea[^>]*>/gs)].map((match) => match[0])) {
        if (/\binset\b/.test(call)) asking.push(path);
      }
    }

    expect(new Set(asking), `the room is asked for outside the detail's document tabs, by: ${[...new Set(asking)].join(', ') || 'nothing'}`).toEqual(
      new Set(['containers/ContainerDetailPanel.tsx']),
    );
    // Three document tabs, and the panel serves Config and Inspect from one region: Stats has one
    // of its own, so the count is two rather than three.
    expect(asking.length, 'the detail asks for the room in a number of places its three document tabs cannot account for').toBeLessThanOrEqual(3);
  });
});
