import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BandStack } from '../../src/ui';

/**
 * The arrangement "these bands are chrome, this one region takes the remaining height"
 * (ui-library/specs/band-stack.md, plan-docker_management_app-filesystem_browser_layout/REQ-2,
 * REQ-5).
 *
 * **Contract and state only.** jsdom performs no layout — every box it reports is zero — so nothing
 * here claims that the filling region actually absorbed anything, that a band is the height of its
 * content or that the container stopped short of its bound. Those are geometry, and they are
 * measured with a real browser in `client/e2e/filesystem-browser-layout.spec.ts` and in
 * `client/e2e/dialog-sizing.spec.ts`. What is asserted here is what a component's contract can be
 * asked at this level: what it renders, in what order, how many filling regions it admits, what its
 * API accepts, and that it knows nothing of any domain.
 */
afterEach(cleanup);

const SOURCE = readFileSync(join(process.cwd(), 'src/ui/layout/BandStack.tsx'), 'utf8');
const STYLESHEET = readFileSync(join(process.cwd(), 'src/ui/layout/band-stack.css'), 'utf8');

describe('BandStack (ui-library/specs/band-stack.md)', () => {
  // band-stack.md — "the bands render in the order given, above the filling region"
  it('renders the bands in the order given, with the filling region last', () => {
    render(
      <BandStack
        bands={[<span key="a">first</span>, <span key="b">second</span>, <span key="c">third</span>]}
        fill={<span>region</span>}
      />,
    );

    const order = ['first', 'second', 'third', 'region'].map((label) => screen.getByText(label));
    for (let index = 1; index < order.length; index += 1) {
      // Node.DOCUMENT_POSITION_FOLLOWING: each one comes after the one before it.
      expect(order[index - 1]!.compareDocumentPosition(order[index]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  // band-stack.md — "a band given as nothing leaves no band behind": the conditional bands of a
  // surface are passed as `null`, and an empty band would otherwise take spacing of its own.
  it('leaves no band behind for a band that is not given', () => {
    render(<BandStack bands={[<span key="a">first</span>, null, <span key="c">third</span>]} fill={<span>region</span>} />);

    const stack = screen.getByText('first').parentElement!;
    expect(Array.from(stack.children).map((child) => child.textContent)).toEqual(['first', 'third', 'region']);
  });

  // band-stack.md — "exactly one region absorbs the remaining height, and it is the only one".
  // **The type is what refuses a second**: the API offers one `fill` slot and no way to designate
  // another, so `fill={<><a/><b/></>}` is two nodes inside the one region, never two regions.
  it('admits exactly one filling region, whatever it is given to hold', () => {
    const { container } = render(
      <BandStack
        bands={[<span key="a">band</span>]}
        fill={
          <>
            <span>one</span>
            <span>two</span>
          </>
        }
      />,
    );

    expect(container.querySelectorAll('.ui-band-stack__fill')).toHaveLength(1);
    expect(SOURCE.match(/\bfill\??:/g) ?? [], 'the API declares more than one filling slot').toHaveLength(1);
  });

  // band-stack.md — "no length is accepted from the caller": the arrangement is bounded by what it
  // is placed in, never given a height. There is no prop to state one with, which is why a caller
  // cannot reintroduce the pixel constants this arrangement replaces.
  it('offers the caller no way to state a height, and states none of its own', () => {
    const { container } = render(<BandStack bands={[<span key="a">band</span>]} fill={<span>region</span>} />);

    expect(SOURCE.match(/\b(height|maxHeight|minHeight|size)\??:/g) ?? [], 'the API accepts a height from the caller').toEqual([]);
    expect(SOURCE.match(/\bstyle=/g) ?? [], 'the arrangement writes an inline style').toEqual([]);
    expect(container.firstElementChild!.getAttribute('style'), 'the arrangement states a size of its own').toBeNull();
  });

  // band-stack.md — "the spacing between bands comes from the library's spacing tokens".
  // Read from the stylesheet, since jsdom applies none: a length written on the spot is the
  // violation, and it is only visible in the rule itself.
  it('spaces its bands with a spacing token and not with a length', () => {
    const gaps = STYLESHEET.match(/\bgap:[^;]+;/g) ?? [];

    expect(gaps.length, 'the arrangement declares no spacing at all').toBeGreaterThan(0);
    for (const gap of gaps) expect(gap, `the band spacing is a length written on the spot: ${gap}`).toMatch(/var\(\s*--space-/);
    expect(STYLESHEET.match(/:\s*-?\d+(?:\.\d+)?(px|rem|em|vh|vw)/g) ?? [], 'the stylesheet states a length of its own').toEqual([]);
  });

  // band-stack.md — "domain-agnostic: it knows nothing of what a band or the region contains".
  // "Container" is deliberately not on this list: it is the word CSS itself uses for the element a
  // layout is placed in, and it is what the arrangement's own bound comes from.
  it('carries no domain vocabulary of any kind', () => {
    const domainWords = /docker|\bimages?\b|volume|network|\blayers?\b|filesystem|registry|compose|swarm|daemon/i;

    expect(SOURCE.match(domainWords), `the arrangement names a domain concept: ${SOURCE.match(domainWords)?.[0]}`).toBeNull();
    expect(STYLESHEET.match(domainWords), `the stylesheet names a domain concept: ${STYLESHEET.match(domainWords)?.[0]}`).toBeNull();
  });

  // band-stack.md — "each region is a plain container": no padding, no surface, no title of its own.
  it('adds no surface, no title and no chrome of its own', () => {
    const { container } = render(<BandStack bands={[<span key="a">a</span>, <span key="b">b</span>]} fill={<span>c</span>} />);

    expect(container.textContent).toBe('abc');
    expect(screen.queryByRole('heading')).toBeNull();
    expect(container.children).toHaveLength(1);
  });
});
