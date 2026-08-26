import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, Card, Surface } from '../../src/ui';

/**
 * `ui-library/specs/surface.md` — the selectable treatment, the state accent and the footer band.
 * What the component renders is asserted on the markup; what it paints is asserted on the
 * stylesheet, jsdom applying none.
 */

afterEach(cleanup);

const surfaceCss = readFileSync(join(process.cwd(), 'src/ui/glass/surface.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tableCss = readFileSync(join(process.cwd(), 'src/ui/data/data-table.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations written for one selector, joined in source order. */
function declarationsOf(css: string, selector: string): string {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((rule) => rule[1].split(',').some((one) => one.trim() === selector))
    .map((rule) => rule[2])
    .join(' ');
}

function surface(root: HTMLElement): HTMLElement {
  return root.querySelector<HTMLElement>('.ui-surface')!;
}

// surface.md — the additions are reachable only by asking (containers_card_view/REQ-30).
describe('Surface — the additions are reachable only by asking (REQ-30)', () => {
  it('renders a plain Surface exactly as it did before the two props existed', async () => {
    const user = userEvent.setup();
    const { container } = render(<Surface>content</Surface>);

    const plain = surface(container);
    expect(plain.className).toBe('ui-surface ui-surface--flat ui-surface--pad-none');
    expect(plain.hasAttribute('aria-selected')).toBe(false);
    await user.click(plain);
    expect(plain.className).toBe('ui-surface ui-surface--flat ui-surface--pad-none');
  });

  it('renders a plain Card exactly as it did, and creates no card stylesheet to do it', () => {
    const { container } = render(<Card>content</Card>);

    expect(surface(container).className).toBe('ui-surface ui-surface--flat ui-surface--pad-lg');
    expect(readFileSync(join(process.cwd(), 'src/ui/glass/Card.tsx'), 'utf8')).not.toMatch(/import\s+['"]\.\/card\.css['"]/);
  });
});

// surface.md — selectable: the pointer cursor, the hover highlight, and which one is selected (REQ-23, REQ-28, REQ-29).
describe('Surface — selectable (REQ-23, REQ-28, REQ-29)', () => {
  it('reports a click anywhere on it, and says whether it is the selected one', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(
      <Surface onSelect={onSelect} selected>
        content
      </Surface>,
    );

    const selectable = surface(container);
    expect(selectable.className).toContain('ui-surface--selectable');
    expect(selectable.className).toContain('ui-surface--selected');
    expect(selectable.getAttribute('aria-selected')).toBe('true');

    await user.click(selectable);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('reports itself as not selected while another one is', () => {
    const { container } = render(<Surface onSelect={vi.fn()}>content</Surface>);

    expect(surface(container).className).not.toContain('ui-surface--selected');
    expect(surface(container).getAttribute('aria-selected')).toBe('false');
  });

  it('lets a control inside it swallow the click that belongs to the control', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onPress = vi.fn();
    render(
      <Surface onSelect={onSelect}>
        <div onClick={(event) => event.stopPropagation()}>
          <Button onClick={onPress}>Stop</Button>
        </div>
      </Surface>,
    );

    await user.click(screen.getByRole('button', { name: 'Stop' }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  // surface.md — the highlights are the table row's own tokens, referenced and not re-declared.
  it('takes the hover and selected highlights from the tokens the table row already carries', () => {
    const hover = declarationsOf(surfaceCss, '.ui-surface--selectable:hover');
    const selected = declarationsOf(surfaceCss, '.ui-surface--selected');

    expect(hover).toContain('var(--color-surface-2)');
    expect(declarationsOf(tableCss, '.ui-data-table__row:hover')).toContain('var(--color-surface-2)');
    expect(selected).toContain('var(--color-accent-tint)');
    expect(declarationsOf(tableCss, '.ui-data-table__row--selected')).toContain('var(--color-accent-tint)');
    for (const rule of [hover, selected]) {
      expect(rule, 'a colour value is written here that the tokens already declare').not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|hsla?\(/i);
    }
  });

  // surface.md — the highlight is laid over the fill, not swapped for it.
  it('lays the highlight over the fill instead of replacing it, so a flat surface still highlights', () => {
    expect(declarationsOf(surfaceCss, '.ui-surface--flat')).toContain('var(--color-surface-2)');
    expect(declarationsOf(surfaceCss, '.ui-surface--selectable:hover')).toMatch(/background-image:/);
    expect(declarationsOf(surfaceCss, '.ui-surface--selected')).toMatch(/background-image:/);
  });

  // surface.md — the selected highlight stays in place while the pointer is over it.
  it('keeps the selected highlight under the pointer', () => {
    const compound = declarationsOf(surfaceCss, '.ui-surface--selectable.ui-surface--selected:hover');

    expect(compound, 'a hovered selected surface falls back to the hover highlight').toContain('var(--color-accent-tint)');
  });
});

// surface.md — the state accent edge (containers_card_view/REQ-2, REQ-18).
describe('Surface — the state accent edge (REQ-2, REQ-18)', () => {
  it.each(['success', 'warning', 'danger', 'neutral'] as const)('marks a %s surface with that state and no other', (accent) => {
    const { container } = render(<Surface accent={accent}>content</Surface>);

    const accented = surface(container);
    expect(accented.className).toContain('ui-surface--accent');
    expect(accented.className).toContain(`ui-surface--accent-${accent}`);
    expect(accented.className.match(/ui-surface--accent-\w+/g)).toHaveLength(1);
  });

  it('forwards the accent, the selection and nothing else through Card', () => {
    const { container } = render(
      <Card accent="warning" onSelect={vi.fn()} selected>
        content
      </Card>,
    );

    const card = surface(container);
    expect(card.className).toContain('ui-surface--accent-warning');
    expect(card.className).toContain('ui-surface--selected');
    expect(card.getAttribute('aria-selected')).toBe('true');
  });

  it('runs the bar the surface\'s full height, clipped by the surface\'s own radius, taking no pointer event', () => {
    const bar = declarationsOf(surfaceCss, '.ui-surface--accent::after');

    expect(bar, 'the accent draws no layer at all').not.toBe('');
    expect(bar).toMatch(/inset:\s*0/);
    expect(bar, 'the bar cuts across the corner instead of following the rounding').toMatch(/border-radius:\s*inherit/);
    expect(bar).toMatch(/pointer-events:\s*none/);
  });

  // surface.md — the bar is painted on `::after`, which keeps it out of the blur allow-list (REQ-33).
  it('paints the bar on ::after, and introduces no blur of any kind', () => {
    expect(declarationsOf(surfaceCss, '.ui-surface--accent::before'), 'the accent took the overlay material\'s own layer').toBe('');
    for (const selector of ['.ui-surface--accent::after', '.ui-surface--selectable:hover', '.ui-surface--selected']) {
      expect(declarationsOf(surfaceCss, selector)).not.toMatch(/backdrop-filter|filter:\s*blur/);
    }
  });

  it('colours the bar from the state role tokens, writing no colour of its own', () => {
    const tones = {
      '.ui-surface--accent-success': 'var(--color-success)',
      '.ui-surface--accent-warning': 'var(--color-warning)',
      '.ui-surface--accent-danger': 'var(--color-danger)',
      '.ui-surface--accent-neutral': 'var(--color-text-muted)',
    };

    for (const [selector, token] of Object.entries(tones)) {
      const declarations = declarationsOf(surfaceCss, selector);
      expect(declarations, `${selector} declares no colour`).not.toBe('');
      expect(declarations).toContain(token);
      expect(declarations, `${selector} writes a colour of its own`).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|hsla?\(/i);
    }
  });
});

// surface.md — the footer band that closes the surface
// (plan-docker_management_app-containers_card_view/REQ-4, REQ-28, REQ-29, REQ-30).
describe('Surface — the closing footer band (containers_card_view/REQ-4, REQ-28)', () => {
  it('parts the surface into a content band and a footer, in that order', () => {
    const { container } = render(
      <Surface padding="md" footer={<Button onClick={vi.fn()}>Act</Button>}>
        content
      </Surface>,
    );

    const parted = surface(container);
    expect(parted.className).toContain('ui-surface--parted');
    const bands = Array.from(parted.children).map((band) => band.className);
    expect(bands).toEqual(['ui-surface__body', 'ui-surface__footer']);
    expect(parted.querySelector('.ui-surface__body')?.textContent).toBe('content');
    expect(parted.querySelector('.ui-surface__footer')?.textContent).toBe('Act');
  });

  it('leaves a surface asked for no footer exactly as it was, its children unwrapped', () => {
    const { container } = render(<Surface padding="md">content</Surface>);

    const plain = surface(container);
    expect(plain.className).toBe('ui-surface ui-surface--flat ui-surface--pad-md');
    expect(plain.querySelector('.ui-surface__body')).toBeNull();
    expect(plain.querySelector('.ui-surface__footer')).toBeNull();
    expect(plain.textContent).toBe('content');
  });

  it('forwards the footer through Card, still with no card stylesheet', () => {
    const { container } = render(<Card footer={<Button onClick={vi.fn()}>Act</Button>}>content</Card>);

    expect(surface(container).className).toContain('ui-surface--parted');
    expect(surface(container).querySelector('.ui-surface__footer')?.textContent).toBe('Act');
    expect(readFileSync(join(process.cwd(), 'src/ui/glass/Card.tsx'), 'utf8')).not.toMatch(/import\s+['"]\.\/card\.css['"]/);
  });

  // surface.md — the inset leaves the surface and is taken by each band, which share it.
  it('moves the inset off the surface and onto its two bands, which share it', () => {
    const parted = declarationsOf(surfaceCss, '.ui-surface--parted');
    const body = declarationsOf(surfaceCss, '.ui-surface__body');
    const footer = declarationsOf(surfaceCss, '.ui-surface__footer');

    expect(parted, 'a parted surface keeps its own padding, so the footer stops short of the edges').toMatch(/padding:\s*0/);
    const inset = /padding:\s*var\((--surface-pad)[^)]*\)/.exec(body)?.[1];
    expect(inset, `the content band takes no inset of the surface's: ${body}`).toBe('--surface-pad');
    expect(footer, 'the footer does not stand at the same x as the content above it').toContain('var(--surface-pad');
  });

  // surface.md — a wash under a hairline, its corners inheriting the surface's radius.
  it('grounds the footer in a wash under a hairline, inheriting the surface’s own rounding', () => {
    const footer = declarationsOf(surfaceCss, '.ui-surface__footer');

    expect(footer).toContain('var(--color-wash-1)');
    expect(footer, 'the footer writes a colour of its own').not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|hsla?\(/i);
    expect(footer, 'the footer is not set apart by a hairline').toMatch(
      /border-top:\s*var\(--border-width-hairline\)\s+solid\s+var\(--color-border-subtle\)/,
    );
    expect(footer, 'the footer restates a radius instead of inheriting the surface’s').toMatch(
      /border-bottom-left-radius:\s*inherit/,
    );
    expect(footer).toMatch(/border-bottom-right-radius:\s*inherit/);
  });

  // surface.md — the content band absorbs the slack, so the footer stays on the bottom edge.
  it('lets the content band absorb the slack, so the footer stays on the bottom edge', () => {
    const parted = declarationsOf(surfaceCss, '.ui-surface--parted');
    const body = declarationsOf(surfaceCss, '.ui-surface__body');
    const footer = declarationsOf(surfaceCss, '.ui-surface__footer');

    expect(parted).toMatch(/display:\s*flex/);
    expect(parted).toMatch(/flex-direction:\s*column/);
    expect(body, 'the content band does not take the free space, so the slack falls under the footer').toMatch(/flex:\s*1 1 auto/);
    expect(footer, 'the footer grows or shrinks instead of closing the surface').toMatch(/flex:\s*none/);
    expect(footer, 'the footer is lifted out of flow, which takes its ground off the surface’s edges').not.toMatch(
      /position:\s*(absolute|fixed)|margin-top:\s*auto/,
    );
  });
});
