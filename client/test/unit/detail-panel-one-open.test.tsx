/**
 * F5 — one detail panel, one shape, and only one open at a time
 * (`plan-ui-coherence-optimisation/REQ-23`, `REQ-24`, `REQ-28`).
 *
 * The guarantee is the **component's**, not each screen's: two lists on one
 * screen (volumes beside networks) each kept their own expansion and presented
 * two parallel long scrolls, because nothing but a convention said they should
 * not. So it is exercised here at the component level, across independently
 * rendered trees — which is what "across lists, across panels and across
 * screens" means — rather than by driving a screen. It is deliberately inert in
 * this batch: neither of those panels uses `DetailPanel` yet, and batch 6 is
 * where the guarantee first has an observable effect.
 *
 * The presentation variants (`dismissal`, the close control, the `Escape`
 * claim and where the focus lands) are covered by `escape-dismissal.test.tsx`
 * and are not restated here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DetailPanel, type ContentClass, type DefinitionItem } from '../../src/ui';

afterEach(cleanup);

function ruleBody(area: string, file: string, selector: string): string {
  const css = readFileSync(join(process.cwd(), 'src', 'ui', area, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map([...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((rule) => [rule[1].trim(), rule[2]] as const));
  const body = rules.get(selector);
  if (body === undefined) throw new Error(`no CSS rule for ${selector}`);
  return body;
}

function declaration(body: string, property: string): string | undefined {
  return new RegExp(`(?:^|;)\\s*${property}\\s*:([^;]*)`)
    .exec(body)?.[1]
    .trim();
}

function openPanels(): number {
  return document.querySelectorAll('.ui-detail-panel').length;
}

describe('DetailPanel — at most one open anywhere (REQ-24)', () => {
  // detail-panel.md — "A panel being rendered closes any panel already open, through that panel's
  // own `onClose`", so the screen owning it learns the panel is gone
  it('closes the panel already open, through that panel’s own onClose', () => {
    const closeFirst = vi.fn();
    render(<DetailPanel onClose={closeFirst}>first</DetailPanel>);
    expect(closeFirst).not.toHaveBeenCalled();

    render(<DetailPanel onClose={vi.fn()}>second</DetailPanel>);

    expect(closeFirst).toHaveBeenCalledTimes(1);
  });

  // detail-panel.md — "the screen owning it learns the panel is gone rather than being left holding
  // state that says it is still open": a caller that draws its panel from that state stops drawing it
  it('leaves the first list holding no state that says its panel is still open', () => {
    function List({ name }: { name: string }) {
      const [open, setOpen] = useState(true);
      return open ? <DetailPanel onClose={() => setOpen(false)}>{name}</DetailPanel> : <span>{name} closed</span>;
    }

    render(<List name="volumes" />);
    render(<List name="networks" />);

    expect(screen.getByText('volumes closed')).toBeInTheDocument();
    expect(screen.getByText('networks')).toBeInTheDocument();
    expect(openPanels()).toBe(1);
  });

  // detail-panel.md — the guarantee "holds across lists, across panels and across screens, not only
  // within one list": three panels opened in turn leave one
  it('leaves exactly one panel open however many are opened in turn', () => {
    const closes = [vi.fn(), vi.fn(), vi.fn()];
    for (const [index, close] of closes.entries()) {
      render(<DetailPanel onClose={close}>panel {index}</DetailPanel>);
    }

    expect(closes[0]).toHaveBeenCalledTimes(1);
    expect(closes[1]).toHaveBeenCalledTimes(1);
    expect(closes[2]).not.toHaveBeenCalled();
  });

  // detail-panel.md — the panel closed is the one that was open, and it is closed once: a panel
  // that closed itself a moment after opening would be the same defect from the other side
  it('never closes the panel that has just opened, however often its caller re-renders', () => {
    const close = vi.fn();
    const { rerender } = render(
      <DetailPanel onClose={close}>only</DetailPanel>,
    );

    // A caller re-creating its callback on every render is the ordinary case, not a special one.
    rerender(<DetailPanel onClose={() => close()}>only</DetailPanel>);
    rerender(<DetailPanel onClose={() => close()}>only</DetailPanel>);

    expect(close).not.toHaveBeenCalled();
    expect(openPanels()).toBe(1);
  });

  // detail-panel.md — a panel dismissed by its own route leaves nothing behind: opening the next
  // one calls no stale `onClose`
  it('closes nothing when the previous panel had already been dismissed', () => {
    const closeFirst = vi.fn();
    const { unmount } = render(<DetailPanel onClose={closeFirst}>first</DetailPanel>);
    unmount();

    render(<DetailPanel onClose={vi.fn()}>second</DetailPanel>);

    expect(closeFirst).not.toHaveBeenCalled();
    expect(openPanels()).toBe(1);
  });
});

describe('DetailPanel — the shape it insists on (REQ-23)', () => {
  const properties: DefinitionItem[] = [
    { label: 'Driver', value: 'local' },
    { label: 'Scope', value: 'local' },
  ];

  // detail-panel.md — "Properties are stated through `properties`, in the library's two-column
  // grid, left-aligned — structural rather than a convention each screen honours or forgets."
  it('lays its properties out in the library’s property grid', () => {
    render(
      <DetailPanel onClose={vi.fn()} properties={properties}>
        body
      </DetailPanel>,
    );

    const grid = document.querySelector('.ui-definition-list') as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.querySelectorAll('.ui-definition-list__row')).toHaveLength(2);
    expect(screen.getByText('Driver')).toBeInTheDocument();
    expect(screen.getByText('Scope')).toBeInTheDocument();
  });

  // detail-panel.md — the property grid sits "at the top of the body, above `children`"
  it('places the property grid above the body it was given', () => {
    render(
      <DetailPanel onClose={vi.fn()} properties={properties}>
        <span>payload</span>
      </DetailPanel>,
    );

    const grid = document.querySelector('.ui-definition-list') as HTMLElement;
    const payload = screen.getByText('payload');
    expect(grid.compareDocumentPosition(payload) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // detail-panel.md — `propertiesContentClass` "states what those properties hold, from which the
  // grid derives how many columns the panel's width carries"; omitted, it is `'short-scalar'`
  it('hands what the properties hold to the grid, defaulting to short scalars', () => {
    /** The grid's class list for one statement of what the properties hold. */
    function gridClassFor(contentClass?: ContentClass): string {
      const { unmount } = render(
        <DetailPanel onClose={vi.fn()} properties={properties} propertiesContentClass={contentClass}>
          body
        </DetailPanel>,
      );
      const className = (document.querySelector('.ui-definition-list') as HTMLElement).className;
      unmount();
      return className;
    }

    // Stating what the properties hold reaches the grid, and stating nothing is `short-scalar`.
    expect(gridClassFor('long-single-line')).not.toBe(gridClassFor('short-scalar'));
    expect(gridClassFor(undefined)).toBe(gridClassFor('short-scalar'));
  });

  // detail-panel.md — a panel that states no properties renders no grid: the panels delivered
  // before the grid became structural keep the block flow they had
  it('renders no property grid when no properties are stated', () => {
    render(<DetailPanel onClose={vi.fn()}>body</DetailPanel>);

    expect(document.querySelector('.ui-definition-list')).toBeNull();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  // detail-panel.md — "The panel is always the full width of what it is placed in (`width: 100%`,
  // stated rather than inherited from being a block box, so it survives a flex or inline context),
  // and never narrows itself."
  it('states its full width rather than inheriting it from being a block box', () => {
    const body = ruleBody('glass', 'detail-panel.css', '.ui-detail-panel');

    expect(declaration(body, 'width')).toBe('100%');
    expect(declaration(body, 'max-width')).toBeUndefined();
  });
});
