/**
 * F5 — the empty state insists on its own shape
 * (`plan-ui-coherence-optimisation/REQ-25`, `REQ-28`, `REQ-30`).
 *
 * Two halves, and the second is the one the requirement is actually about. The
 * first is what the operator sees: a placeholder is drawn on a surface of the
 * library's own, always, whatever the caller passes. The second is what a caller
 * can obtain: `description` and `action` are **required**, so a bare title is
 * not reachable through the API and `null` is a decision written in the source
 * rather than a default nobody took. The second half lives in the types, so it
 * is asserted with `@ts-expect-error` — the test-tree typecheck
 * (`npm run test:typecheck -w client`) is what fails if either prop ever
 * becomes optional again.
 *
 * jsdom loads no stylesheet, so the surface itself is read from the library's
 * own CSS, as `menu.test.tsx` and `design-tokens-contrast.test.ts` do.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Button, EmptyState } from '../../src/ui';

afterEach(cleanup);

/** The declarations of a rule, keyed by selector, with comments stripped. */
function rules(area: string, file: string): Map<string, string> {
  const css = readFileSync(join(process.cwd(), 'src', 'ui', area, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return new Map([...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((rule) => [rule[1].trim(), rule[2]] as const));
}

function ruleBody(area: string, file: string, selector: string): string {
  const body = rules(area, file).get(selector);
  if (body === undefined) throw new Error(`no CSS rule for ${selector}`);
  return body;
}

/** A declaration's value, e.g. `background` of the empty state's own rule. */
function declaration(body: string, property: string): string | undefined {
  return new RegExp(`(?:^|;)\\s*${property}\\s*:([^;]*)`)
    .exec(body)?.[1]
    .trim();
}

function root(): HTMLElement {
  return document.querySelector('.ui-empty-state') as HTMLElement;
}

describe('EmptyState — the surface it always renders on (REQ-25)', () => {
  // empty-state.md — "It renders on a surface of the library's own, always —
  // whatever the caller passes and wherever it is placed."
  it('draws its own surface even when nothing but a title is stated', () => {
    render(<EmptyState title="No results" description={null} action={null} />);

    expect(root()).not.toBeNull();
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  // empty-state.md — the material is the nested wash (`--color-wash-1`, a hairline, the medium
  // radius), "the same treatment `FormSection` and the property bands take", and deliberately not
  // `Surface`'s glass
  it('carries the nested wash, a hairline and the medium radius, exactly as FormSection does', () => {
    const emptyState = ruleBody('feedback', 'feedback.css', '.ui-empty-state');
    const formSection = ruleBody('controls', 'controls.css', '.ui-form-section');

    for (const property of ['background', 'border', 'border-radius']) {
      expect(declaration(emptyState, property), `.ui-empty-state declares no ${property}`).toBeDefined();
      expect(declaration(emptyState, property)).toBe(declaration(formSection, property));
    }
    expect(declaration(emptyState, 'background')).toBe('var(--color-wash-1)');
    expect(declaration(emptyState, 'border-radius')).toBe('var(--radius-md)');
    expect(declaration(emptyState, 'border')).toMatch(/var\(--border-width-hairline\)/);
  });

  // empty-state.md — the surface costs no width and two pixels of height: `box-sizing: border-box`
  // is global, and the hairline is the only box the component gained
  it('costs no width, the hairline being its whole geometry', () => {
    const foundation = readFileSync(join(process.cwd(), 'src', 'ui', 'foundation.css'), 'utf8');

    expect(foundation).toMatch(/box-sizing:\s*border-box/);
    expect(declaration(ruleBody('feedback', 'feedback.css', '.ui-empty-state'), 'border')).toMatch(
      /^var\(--border-width-hairline\)\s+solid\b/,
    );
  });

  // empty-state.md — "it carries the surface too, 'whatever the caller passes' including this
  // presentation", and gains the horizontal inset a wash needs to hold its text off its own edge
  it('carries the same surface in the compact presentation, with a --space-4 horizontal inset', () => {
    render(<EmptyState title="Nothing selected" description={null} action={null} compact />);
    const compact = ruleBody('feedback', 'feedback.css', '.ui-empty-state--compact');

    // The modifier adds to the base rule rather than replacing it: the surface is declared once.
    expect(root().className).toContain('ui-empty-state');
    expect(root().className).toContain('ui-empty-state--compact');
    for (const property of ['background', 'border', 'border-radius']) {
      expect(declaration(compact, property), `the compact presentation redeclares ${property}`).toBeUndefined();
    }
    expect(declaration(compact, 'padding')).toMatch(/\bvar\(--space-4\)\s*$/);
  });

  // empty-state.md — the compact presentation's own figure: "+10px of height", which is the two
  // hairlines plus the vertical padding it grew when it gained the inset. Stated here in tokens
  // because the single compact call site is not reachable in a screen sweep.
  it('costs the compact presentation ten pixels of height, in tokens', () => {
    const tokens = readFileSync(join(process.cwd(), 'src', 'ui', 'tokens.css'), 'utf8');
    const token = (name: string) => Number(new RegExp(`${name}:\\s*(\\d+)px`).exec(tokens)?.[1]);
    const [vertical] = (declaration(ruleBody('feedback', 'feedback.css', '.ui-empty-state--compact'), 'padding') ?? '')
      .split(/\s+/)
      .map((value) => /var\((--[a-z0-9-]+)\)/.exec(value)?.[1] ?? '');

    // The delivered compact padding was `var(--space-2) 0`; it is now `var(--space-3) var(--space-4)`.
    const grown = 2 * (token(vertical) - token('--space-2')) + 2 * token('--border-width-hairline');
    expect(grown).toBe(10);
  });

  // empty-state.md — "`compact` changes the presentation and nothing else: same wording, same
  // structure, same API"
  it('renders the same wording and structure in both presentations', () => {
    const { unmount } = render(
      <EmptyState title="Nothing to show" description="Pull an image to fill this list." action={null} />,
    );
    const full = root().innerHTML;
    unmount();

    render(<EmptyState title="Nothing to show" description="Pull an image to fill this list." action={null} compact />);

    expect(root().innerHTML).toBe(full);
  });
});

describe('EmptyState — what a caller must decide (REQ-25)', () => {
  // empty-state.md — "The explanation and the resolving action are required props, not optional
  // ones. This is the whole of the component's insistence." A bare title must not compile.
  it('cannot be rendered with a bare title', () => {
    // @ts-expect-error — `description` and `action` are required: `null` is how a caller states
    // that there is nothing to explain, or nothing that would resolve the condition.
    const bareTitle = <EmptyState title="No results" />;

    expect(bareTitle.props).not.toHaveProperty('description');
    expect(bareTitle.props).not.toHaveProperty('action');
  });

  // empty-state.md — an omitted explanation is refused on its own, not merely as part of a pair
  it('cannot be rendered without an explanation', () => {
    // @ts-expect-error — `description` is required even when an action is stated.
    const noDescription = <EmptyState title="No results" action={null} />;

    expect(noDescription.props).not.toHaveProperty('description');
  });

  // empty-state.md — and neither can the resolving action be left unsaid
  it('cannot be rendered without a resolving action', () => {
    // @ts-expect-error — `action` is required even when an explanation is stated.
    const noAction = <EmptyState title="No results" description="Nothing matches this filter." />;

    expect(noAction.props).not.toHaveProperty('action');
  });

  // empty-state.md — "A `null` description renders nothing where the description would be, exactly
  // as an omitted optional prop did: the change is to what a caller must say, never to what the
  // operator sees."
  it('renders nothing where a null description would be', () => {
    render(<EmptyState title="No results" description={null} action={null} />);

    expect(root().querySelector('.ui-empty-state__description')).toBeNull();
    expect(root().textContent).toBe('No results');
  });

  // empty-state.md — the same for a null action: no control-shaped thing that is not a control
  it('renders no control where a null action would be', () => {
    render(<EmptyState title="No results" description="Nothing matches this filter." action={null} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Nothing matches this filter.')).toBeInTheDocument();
  });

  // empty-state.md — "There is no variant that renders bare text, and none that renders a
  // control-shaped thing that is not a control: an action is a control, passed as one."
  it('renders the stated action as the control it was passed as', () => {
    render(
      <EmptyState
        title="No results"
        description="Nothing matches this filter."
        action={<Button onClick={() => undefined}>Clear the filter</Button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Clear the filter' })).toBeInTheDocument();
    expect(root().contains(screen.getByRole('button', { name: 'Clear the filter' }))).toBe(true);
  });
});
