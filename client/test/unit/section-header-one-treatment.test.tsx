/**
 * F5 — one section-header primitive, with one treatment
 * (`plan-ui-coherence-optimisation/REQ-26`, `REQ-28`, `REQ-30`).
 *
 * The sublabel's contract is a geometric one — a header is exactly as tall with
 * a sublabel as without, so a neighbouring header's baseline never moves — and
 * jsdom lays nothing out. What can be settled here is the mechanism that makes
 * the geometry hold: the sublabel is **inside the title's own element**, so it
 * cannot open a line box of its own, its spacing is a margin rather than a text
 * node, and it declares no `display` that would turn it into a block. The
 * measured half belongs to the screen that first carries one (REQ-54).
 *
 * The second half is `Card`: its title is this component rather than a
 * treatment of the card's, which is what leaves one way to title a section.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Card, SectionHeader } from '../../src/ui';

afterEach(cleanup);

function rules(area: string, file: string): Map<string, string> {
  const css = readFileSync(join(process.cwd(), 'src', 'ui', area, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return new Map([...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((rule) => [rule[1].trim(), rule[2]] as const));
}

function ruleBody(area: string, file: string, selector: string): string {
  const body = rules(area, file).get(selector);
  if (body === undefined) throw new Error(`no CSS rule for ${selector}`);
  return body;
}

function declaration(body: string, property: string): string | undefined {
  return new RegExp(`(?:^|;)\\s*${property}\\s*:([^;]*)`)
    .exec(body)?.[1]
    .trim();
}

function title(): HTMLElement {
  return document.querySelector('.ui-section-header__title') as HTMLElement;
}

function sublabel(): HTMLElement | null {
  return document.querySelector('.ui-section-header__sublabel');
}

describe('SectionHeader — the sublabel that moves no baseline (REQ-26)', () => {
  // section-header.md — "Rendered on the title's own line and its own baseline", which is what a
  // sublabel inside the title element is and what one under it could never be
  it('renders the sublabel inside the title element itself', () => {
    render(<SectionHeader title="Configs & stacks" sublabel="CONFIGS" />);

    expect(sublabel()).not.toBeNull();
    expect(title().contains(sublabel())).toBe(true);
  });

  // section-header.md — "A sublabel never changes the header's height": nothing about the header
  // outside the title element changes when one is supplied
  it('adds no element beside the title when a sublabel is supplied', () => {
    const { unmount } = render(<SectionHeader title="Configs & stacks" />);
    const withoutSublabel = (document.querySelector('.ui-section-header') as HTMLElement).children.length;
    const withoutTitleChildren = title().children.length;
    unmount();

    render(<SectionHeader title="Configs & stacks" sublabel="CONFIGS" />);

    expect((document.querySelector('.ui-section-header') as HTMLElement).children.length).toBe(withoutSublabel);
    expect(title().children.length).toBe(withoutTitleChildren + 1);
  });

  // section-header.md — "The space before the sublabel is a margin, not a text node, so it survives
  // a line break between the title and its qualifier."
  it('spaces the sublabel with a margin rather than with a text node', () => {
    render(<SectionHeader title="Configs & stacks" sublabel="CONFIGS" />);

    expect(title().textContent).toBe('Configs & stacksCONFIGS');
    expect(declaration(ruleBody('glass', 'section-header.css', '.ui-section-header__sublabel'), 'margin-inline-start')).toBe(
      'var(--space-2)',
    );
  });

  // section-header.md — a sublabel that opened a line box of its own would be exactly the defect
  // this contract exists to prevent
  it('declares no display that would take the sublabel off the title line', () => {
    const body = ruleBody('glass', 'section-header.css', '.ui-section-header__sublabel');

    expect(declaration(body, 'display')).toBeUndefined();
  });

  // section-header.md — "The sublabel resets the treatment the header's variant applies to the
  // title (letter-spacing, case), so an eyebrow header's sublabel reads as a qualifier rather than
  // as more of the same label."
  it('resets the letter-spacing and the case the variant applies to the title', () => {
    const body = ruleBody('glass', 'section-header.css', '.ui-section-header__sublabel');

    expect(declaration(body, 'letter-spacing')).toBe('normal');
    expect(declaration(body, 'text-transform')).toBe('none');
  });

  // section-header.md — the sublabel is a qualifier, so a header without one renders none
  it('renders no sublabel element when none is stated', () => {
    render(<SectionHeader title="Secrets" />);

    expect(sublabel()).toBeNull();
    expect(title().textContent).toBe('Secrets');
  });

  // section-header.md — the description is the line *under* the title, distinct from the sublabel
  it('keeps the description under the title, where the sublabel never goes', () => {
    render(<SectionHeader title="Secrets" sublabel="4" description="Swarm-wide secrets." />);

    const description = document.querySelector('.ui-section-header__description') as HTMLElement;
    expect(description.textContent).toBe('Swarm-wide secrets.');
    expect(title().contains(description)).toBe(false);
  });

  // section-header.md — the trailing slot is the section's actions
  it('renders the trailing slot beside the title', () => {
    render(<SectionHeader title="Secrets" trailing={<span>actions</span>} />);

    expect(screen.getByText('actions')).toBeInTheDocument();
  });

  // section-header.md — `variant` is the choice between a full title and a column/group heading,
  // and the eyebrow is the uppercase treatment
  it('renders the eyebrow variant as the small uppercase heading', () => {
    render(<SectionHeader title="Identity and license" variant="eyebrow" />);

    expect((document.querySelector('.ui-section-header') as HTMLElement).className).toContain(
      'ui-section-header--eyebrow',
    );
    expect(declaration(ruleBody('glass', 'section-header.css', '.ui-section-header--eyebrow .ui-section-header__title'), 'text-transform')).toBe(
      'uppercase',
    );
  });
});

describe('Card — the title is the header primitive (REQ-26)', () => {
  // card.md / section-header.md — "`Card` renders its title through this component; there is no
  // second element and no second rule carrying a card-title treatment."
  it('renders its title through SectionHeader, in the eyebrow treatment', () => {
    render(<Card title="Identity and license">body</Card>);

    const header = document.querySelector('.ui-section-header') as HTMLElement;
    expect(header).not.toBeNull();
    expect(header.className).toContain('ui-section-header--eyebrow');
    expect(title().textContent).toBe('Identity and license');
  });

  // section-header.md — "The step between the heading and the card's content stays the card's,
  // being the card's spacing rather than the header's": the card's own rule carries no type at all
  it('declares no type treatment of its own for a card title', () => {
    const body = ruleBody('glass', 'card.css', '.ui-card__title');

    for (const property of ['font-size', 'font-weight', 'letter-spacing', 'text-transform', 'color']) {
      expect(declaration(body, property), `.ui-card__title still declares ${property}`).toBeUndefined();
    }
    expect(declaration(body, 'margin')).toBeDefined();
  });

  // section-header.md — a card with no title states no header at all
  it('renders no header when the card has no title', () => {
    render(<Card>body</Card>);

    expect(document.querySelector('.ui-section-header')).toBeNull();
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});
