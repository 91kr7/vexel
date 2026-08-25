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
 * The second half is `Card`, and it has moved on: the card's title was this
 * component for the length of the migrations, and by their end no screen passed
 * one, so the prop went too (`plan-ui-coherence-optimisation/REQ-81`). What is
 * checked below is therefore the stronger claim — a card titles nothing, and no
 * rule outside `section-header.css` declares a section heading's type.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Card, SectionHeader } from '../../src/ui';

afterEach(cleanup);

/** Every source file of the library, which is the only place a treatment may be declared at all. */
function libraryFiles(directory = join(process.cwd(), 'src', 'ui')): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? libraryFiles(path) : /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

/** The library files naming a class, by their path relative to the client workspace. */
function libraryFilesNaming(className: string): string[] {
  return libraryFiles()
    .filter((path) => readFileSync(path, 'utf8').includes(className))
    .map((path) => path.slice(process.cwd().length + 1).split('\\').join('/'))
    .sort();
}

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

/**
 * The successor of `Card — the title is the header primitive`, whose subject —
 * a `title` prop rendered through this component — `plan-ui-coherence-optimisation/REQ-81`
 * retires. The block is rewritten rather than deleted: a retirement with no
 * check is how a prop comes back, and what has to hold now is the stronger
 * claim, that the card titles **nothing**.
 */
describe('Card — a card titles nothing (REQ-26, REQ-81)', () => {
  // card.md — "There is no `title` prop, no title element and no card stylesheet: a card that could
  // title itself was a second way of asking the one question `SectionHeader` answers."
  it('renders no header of any kind, only its own content', () => {
    render(<Card>body</Card>);

    expect(document.querySelector('.ui-section-header')).toBeNull();
    expect(document.querySelector('.ui-card__title')).toBeNull();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  // card.md — the prop is retired, not merely unused: a component still accepting one would title
  // itself again the moment a screen passed one, which is the second answer this closes.
  it('draws nothing at all from a title handed to it', () => {
    // Untyped on purpose: the compiler already refuses the prop, and what is under test here is
    // what the component *does* with one — a call site written in JavaScript, or a spread of a
    // wider object, reaches it without the compiler ever being asked.
    const withRetiredProp = { title: 'Identity and license' } as Record<string, unknown>;
    render(<Card {...withRetiredProp}>body</Card>);

    expect(screen.queryByText('Identity and license')).not.toBeInTheDocument();
    expect(document.querySelector('.ui-section-header')).toBeNull();
    expect(document.querySelector('.ui-card__title')).toBeNull();
  });

  // card.md — "no card stylesheet", section-header.md — "there is no element and no rule anywhere
  // else declaring a heading's type". The retired treatments, by name, across the whole library.
  it('leaves no stylesheet and no component declaring a card or field-group heading', () => {
    expect(existsSync(join(process.cwd(), 'src', 'ui', 'glass', 'card.css')), 'the card stylesheet is still there').toBe(
      false,
    );

    const retired = ['.ui-card__title', '.ui-form-section__title', '.ui-form-section__description'];
    for (const selector of retired) {
      expect(
        libraryFilesNaming(selector.slice(1)),
        `${selector} — a retired heading treatment is still declared or emitted`,
      ).toEqual([]);
    }
  });
});

// section-header.md, widened on 2026-08-25 — "the title gives way instead of pushing what sits
// beside it out of place: it keeps one line and ellipsises at its end. For a header standing in a
// row with something anchored to its right" — the containers card's name beside its short id
// (plan-docker_management_app-containers_card_view/REQ-3, REQ-30).
describe('SectionHeader — the title that gives way (containers_card_view/REQ-3)', () => {
  it('carries the library’s own one-line rule on the title, and the whole title as its tooltip', () => {
    render(<SectionHeader title="a-very-long-container-name-that-cannot-fit" truncate />);

    const title = document.querySelector('.ui-section-header__title') as HTMLElement;
    expect(title.className).toContain('ui-truncating-line');
    expect(title.getAttribute('title')).toBe('a-very-long-container-name-that-cannot-fit');
    expect(document.querySelector('.ui-section-header')?.className).toContain('ui-section-header--truncate');
  });

  it('leaves a header asked for nothing exactly as it was: no truncation, no tooltip', () => {
    render(<SectionHeader title="Containers" />);

    const title = document.querySelector('.ui-section-header__title') as HTMLElement;
    expect(title.className).toBe('ui-section-header__title');
    expect(title.hasAttribute('title')).toBe(false);
    expect(document.querySelector('.ui-section-header')?.className).toBe('ui-section-header');
  });

  it('declares no truncation rule of its own, taking the contract’s classes instead', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'ui', 'glass', 'section-header.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );

    expect(css, 'the header restates the truncation contract instead of carrying it').not.toMatch(/text-overflow\s*:/);
  });
});
