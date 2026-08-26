import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BadgeListCell, IdentifierCell, LOAD_ATTENTION_PERCENT, MetaCell, TwoLineCell } from '../../src/ui';

afterEach(cleanup);

/**
 * The declarations of a CSS rule. jsdom loads no stylesheet, so a contract the
 * library expresses in CSS — a line shown in full rather than ellipsis-cut — is
 * read from the stylesheet itself, as `design-tokens-contrast.test.ts` does.
 *
 * `stylesheet` names which one, because the cells' truncation is no longer
 * declared beside them: `truncation-contract.md` puts the three properties that
 * cut a line on `.ui-truncating-line`, in `src/ui/truncation.css`, and the cell
 * carries or withholds that class.
 */
function ruleBody(selector: string, stylesheet = 'src/ui/data/data-table.css'): string {
  const css = readFileSync(join(process.cwd(), stylesheet), 'utf8');
  // Anchored on the end of the previous rule, so a selector is never matched inside a longer
  // selector list (where it would return the wrong rule's declarations).
  const match = new RegExp(`(?:^|\\}|\\*/)\\s*${selector.replace(/[.\-]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`no CSS rule for ${selector}`);
  return match[1];
}

// Contract: ui-library/specs/table-cells.md — <MetaCell children? wrap? title? unavailableReason? />
describe('MetaCell (plan-docker_management_app/REQ-3, REQ-15)', () => {
  // table-cells.md — "renders '–' when children is empty — undefined, null and the empty string are
  // all empty, and read identically" / "A cell with nothing to show is never blank"
  it.each<[string, ReactNode]>([
    ['nothing', undefined],
    ['null', null],
    ['an empty string', ''],
  ])('renders the dash when given %s', (_description, children) => {
    render(<MetaCell>{children}</MetaCell>);

    expect(screen.getByText('–')).toBeInTheDocument();
  });

  // table-cells.md — "When children is empty and unavailableReason is given, renders 'unavailable'
  // instead of '–', with the reason as a tooltip"
  it.each<[string, ReactNode]>([
    ['nothing', undefined],
    ['an empty string', ''],
  ])('renders "unavailable" with its reason when given %s and a reason', (_description, children) => {
    render(<MetaCell unavailableReason="the daemon did not report it">{children}</MetaCell>);

    expect(screen.getByText('unavailable')).toBeInTheDocument();
    expect(screen.getByText('unavailable')).toHaveAttribute('title', 'the daemon did not report it');
  });

  // table-cells.md — the value is shown as given, with the full value as a native tooltip
  it('renders the value it is given, with the value itself as the tooltip', () => {
    render(<MetaCell>12% cpu</MetaCell>);

    expect(screen.getByText('12% cpu')).toHaveAttribute('title', '12% cpu');
  });
});

/**
 * `tone` — "the reading to look at", one tone and no severity scale
 * (`ui-library/specs/table-cells.md`,
 * `plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-33`).
 *
 * The distinction is a *treatment*, and jsdom loads no stylesheet, so it is read
 * in two halves: the class the toned cell takes on top of the one every other
 * cell in its column takes, and what the stylesheet declares for that class.
 */
describe('MetaCell tone (tabs_composition_refactor/REQ-33)', () => {
  /** The classes a cell carries, as a set, for the value it was given. */
  function classesOf(node: HTMLElement): string[] {
    return node.className.split(' ').filter((name) => name !== '');
  }

  /** What a toned cell carries that an untoned one, in the same column, does not. */
  function distinguishingClasses(): string[] {
    const plain = render(<MetaCell>3.5%</MetaCell>).container.querySelector('span') as HTMLElement;
    const toned = render(<MetaCell tone="attention">84.2%</MetaCell>).container.querySelector('span') as HTMLElement;
    const shared = classesOf(plain);
    expect(
      shared.filter((name) => !classesOf(toned).includes(name)),
      'a toned cell gave up a treatment the rest of its column carries, so the column stops scanning as one column',
    ).toEqual([]);
    return classesOf(toned).filter((name) => !shared.includes(name));
  }

  // table-cells.md — "`tone: 'attention'` draws the value distinguished from the others in its
  // column"
  it('draws a toned reading distinguished from an untoned one', () => {
    expect(distinguishingClasses(), 'a toned cell is drawn exactly as an untoned one').not.toEqual([]);
  });

  // table-cells.md — "colour alone — the type, the size and the alignment unchanged", and the
  // colour is the library's own role rather than a literal (REQ-38).
  it('distinguishes it by colour alone, taken from a token', () => {
    const [distinguishing, ...rest] = distinguishingClasses();
    expect(rest, 'the tone is expressed through more than one class, so what it changes is not one declaration').toEqual([]);

    const declarations = ruleBody(`.${distinguishing}`)
      .split(';')
      .map((declaration) => declaration.trim())
      .filter((declaration) => declaration !== '');

    expect(declarations.map((declaration) => declaration.split(':')[0]!.trim()), 'the tone changes something other than the colour').toEqual([
      'color',
    ]);
    expect(declarations[0], 'the tone states a colour of its own instead of naming one of the library’s roles').toMatch(
      /color:\s*var\(--color-[a-z-]+\)/,
    );
  });

  // table-cells.md — "**A cell with nothing to show is never toned**: the `'–'` and the
  // `'unavailable'` states are drawn the same whatever the caller asks for."
  it.each<[string, { unavailableReason?: string }, string]>([
    ['the dash', {}, '–'],
    ['the unavailable state', { unavailableReason: 'the daemon did not report it' }, 'unavailable'],
  ])('leaves %s untoned even when the caller asks for a tone', (what, props, shown) => {
    const untoned = render(<MetaCell {...props} />).container.querySelector('span') as HTMLElement;
    const asked = render(
      <MetaCell {...props} tone="attention" />,
    ).container.querySelector('span') as HTMLElement;

    expect(untoned.textContent, `the fixture does not render ${what}`).toBe(shown);
    expect(asked.textContent, `the tone changed what ${what} says`).toBe(shown);
    expect(classesOf(asked), `${what} is toned, and there is no reading there to distinguish`).toEqual(classesOf(untoned));
  });

  // table-cells.md — "`LOAD_ATTENTION_PERCENT` — the reading at or above which a load percentage in
  // a column is toned", and "The threshold is 70 … the container detail's Stats tab already turns a
  // load meter to its warning tone at 70". The figure is asserted here, once, so every caller can
  // name the constant instead of restating it.
  it('states the load threshold at the detail’s own warning boundary', () => {
    expect(LOAD_ATTENTION_PERCENT, 'the threshold is no longer the boundary the Stats tab already draws').toBe(70);
  });
});

// Contract: ui-library/specs/table-cells.md — <IdentifierCell value? maxChars? />
describe('IdentifierCell (plan-docker_management_app/REQ-3, REQ-37)', () => {
  it('renders a dash when no value is given', () => {
    render(<IdentifierCell />);

    expect(screen.getByText('–')).toBeInTheDocument();
  });

  it('renders a dash when the value is empty', () => {
    render(<IdentifierCell value="" />);

    expect(screen.getByText('–')).toBeInTheDocument();
  });

  it('keeps the whole value when no maxChars is given', () => {
    const digest = 'sha256:0123456789abcdef0123456789abcdef';

    render(<IdentifierCell value={digest} />);

    expect(screen.getByText(digest)).toBeInTheDocument();
  });

  it('cuts the value at its tail and marks the cut with an ellipsis when it exceeds maxChars', () => {
    render(<IdentifierCell value="sha256:0123456789abcdef" maxChars={10} />);

    expect(screen.getByText('sha256:012…')).toBeInTheDocument();
  });

  it('shows the same number of characters for every value longer than maxChars', () => {
    const { container } = render(
      <>
        <IdentifierCell value="sha256:aaaaaaaaaaaaaaaaaaaaaaaa" maxChars={12} />
        <IdentifierCell value="sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" maxChars={12} />
      </>,
    );

    const rendered = Array.from(container.querySelectorAll('span')).map((node) => node.textContent ?? '');
    expect(rendered).toEqual(['sha256:aaaaa…', 'sha256:bbbbb…']);
  });

  it('leaves a value shorter than maxChars uncut', () => {
    render(<IdentifierCell value="short-id" maxChars={40} />);

    expect(screen.getByText('short-id')).toBeInTheDocument();
  });

  it('always exposes the full, uncut value as a native tooltip', () => {
    const digest = 'sha256:0123456789abcdef0123456789abcdef';

    render(<IdentifierCell value={digest} maxChars={12} />);

    expect(screen.getByTitle(digest)).toBeInTheDocument();
  });
});

// Contract: ui-library/specs/table-cells.md —
// <BadgeListCell labels tone? maxVisible? emptyLabel? emptyTone? />
describe('BadgeListCell (plan-docker_management_app/REQ-3, REQ-37)', () => {
  function badgeTexts(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.ui-badge')).map((node) => node.textContent ?? '');
  }

  it('renders one badge per label, in order', () => {
    const { container } = render(<BadgeListCell labels={['alpha', 'beta']} />);

    expect(badgeTexts(container)).toEqual(['alpha', 'beta']);
  });

  it('renders at most three badges by default and reports the rest with a +N badge', () => {
    const { container } = render(<BadgeListCell labels={['a', 'b', 'c', 'd', 'e']} />);

    expect(badgeTexts(container)).toEqual(['a', 'b', 'c', '+2']);
  });

  it('honours an explicit maxVisible', () => {
    const { container } = render(<BadgeListCell labels={['a', 'b', 'c', 'd']} maxVisible={2} />);

    expect(badgeTexts(container)).toEqual(['a', 'b', '+2']);
  });

  it('renders no overflow badge when the labels fit within maxVisible', () => {
    const { container } = render(<BadgeListCell labels={['a', 'b']} maxVisible={3} />);

    expect(badgeTexts(container)).toEqual(['a', 'b']);
  });

  it('lists the hidden entries in the overflow badge tooltip', () => {
    render(<BadgeListCell labels={['a', 'b', 'c', 'd', 'e']} maxVisible={2} />);

    const overflow = screen.getByText('+3');
    expect(overflow.closest('[title]')?.getAttribute('title')).toBe('c, d, e');
  });

  it('applies the given tone to the label badges while the overflow badge stays neutral', () => {
    const { container } = render(<BadgeListCell labels={['a', 'b']} tone="success" maxVisible={1} />);

    const badges = Array.from(container.querySelectorAll('.ui-badge'));
    expect(badges[0]?.className).toContain('ui-badge--tone-success');
    expect(badges[1]?.textContent).toBe('+1');
    expect(badges[1]?.className).not.toContain('ui-badge--tone-');
  });

  it('renders a single badge with the empty tone when there is no label and an emptyLabel is given', () => {
    const { container } = render(<BadgeListCell labels={[]} emptyLabel="dangling" emptyTone="warning" />);

    const badges = Array.from(container.querySelectorAll('.ui-badge'));
    expect(badges).toHaveLength(1);
    expect(badges[0]?.textContent).toBe('dangling');
    expect(badges[0]?.className).toContain('ui-badge--tone-warning');
  });

  it('renders a dash when there is no label and no emptyLabel', () => {
    const { container } = render(<BadgeListCell labels={[]} />);

    expect(screen.getByText('–')).toBeInTheDocument();
    expect(container.querySelectorAll('.ui-badge')).toHaveLength(0);
  });

  /**
   * table-cells.md — "a label badge shrinks and ellipsises inside its own
   * wrapper … the `+N` badge keeps its natural width", and the invariant behind
   * it: **no badge is ever painted over the badge next to it**
   * (`plan-ui-coherence-optimisation/REQ-18`, `REQ-89`).
   *
   * The wrapper shrank and the pill inside it did not, so under width pressure a
   * pill overflowed its wrapper and was drawn across its neighbour. Which box
   * ends up inside which is geometry and is measured in the Playwright tree
   * (`badge-list-pills.spec.ts`); what is checked here is the contract the
   * geometry rests on — the tooltip that keeps the full label reachable once the
   * pill is cut, and the two rules that decide which pill is allowed to shrink.
   */
  describe('a pill is bounded by its wrapper, and the count is not what gets cut', () => {
    it('keeps each label’s full text in its own wrapper’s tooltip', () => {
      render(<BadgeListCell labels={['linux/amd64', 'linux/arm64', 'linux/arm/v7']} />);

      for (const label of ['linux/amd64', 'linux/arm64', 'linux/arm/v7']) {
        expect(screen.getByText(label).closest('[title]')?.getAttribute('title'), `${label} is not recoverable once its pill is cut`).toBe(label);
      }
    });

    it('bounds the pill by its wrapper and cuts it there, rather than letting it keep its natural width', () => {
      const pill = ruleBody('.ui-table-badge-list-cell__item > .ui-badge');

      expect(pill, 'the pill is not bounded by the wrapper that shrinks').toMatch(/max-width:\s*100%/);
      expect(pill, 'the pill does not cut its own text, so it overflows the wrapper instead').toMatch(/overflow:\s*hidden/);
      expect(pill, 'the cut is not marked, so a truncated label reads as a shorter one').toMatch(/text-overflow:\s*ellipsis/);
    });

    it('lets the label wrappers shrink while the overflow indicator keeps its natural width', () => {
      expect(ruleBody('.ui-table-badge-list-cell__item'), 'the label wrapper does not shrink').toMatch(/flex:\s*0 1 auto/);
      expect(ruleBody('.ui-table-badge-list-cell__item--overflow'), 'how many entries are hidden is allowed to be the part that is cut').toMatch(/flex:\s*none/);
    });
  });
});

// Contract: ui-library/specs/table-cells.md — <TwoLineCell title? subtitle? action? wrap? />
describe('TwoLineCell (plan-docker_management_app/REQ-3, REQ-105)', () => {
  it('renders the primary line over the secondary one', () => {
    const { container } = render(<TwoLineCell title="web-nginx" subtitle="a1b2c3d4 · running" />);

    expect(container.querySelector('.ui-table-two-line-cell__title')?.textContent).toBe('web-nginx');
    expect(container.querySelector('.ui-table-two-line-cell__subtitle')?.textContent).toBe('a1b2c3d4 · running');
  });

  // table-cells.md — "title may be omitted, for a cell carrying the secondary line alone ...; the
  // primary line is then absent, not blank"
  it('leaves out the primary line entirely when no title is given', () => {
    const { container } = render(<TwoLineCell subtitle="A sentence sitting under another cell's value." />);

    expect(container.querySelector('.ui-table-two-line-cell__title')).toBeNull();
    expect(container.querySelector('.ui-table-two-line-cell__subtitle')?.textContent).toBe(
      "A sentence sitting under another cell's value.",
    );
  });

  // table-cells.md — the full text of a line is available as its tooltip
  it('carries the text of each line as its own tooltip', () => {
    render(<TwoLineCell title="web-nginx" subtitle="a1b2c3d4 · running" />);

    expect(screen.getByText('web-nginx')).toHaveAttribute('title', 'web-nginx');
    expect(screen.getByText('a1b2c3d4 · running')).toHaveAttribute('title', 'a1b2c3d4 · running');
  });

  // table-cells.md — "wrap: true — both lines wrap and are shown in full instead of
  // ellipsis-truncating, and the subtitle drops the monospace treatment"
  it('shows both lines in full, without the monospace subtitle, when asked to wrap', () => {
    const { container } = render(<TwoLineCell wrap title="Image building" subtitle="Building an image from a Dockerfile." />);

    const cell = container.querySelector('.ui-table-two-line-cell');
    expect(cell?.className).toContain('ui-table-two-line-cell--wrap');
    expect(cell?.textContent).toContain('Building an image from a Dockerfile.');

    // truncation-contract.md — "A line that reads as a sentence and is expected in full **does not
    // take the line class**, rather than taking it and overriding it. That is how the wrapping
    // variants of `TwoLineCell` and `MetaCell` stay wrapping: they withhold the class." So what
    // shows the lines in full is the **absence** of `.ui-truncating-line` on them, and that is
    // where this assertion now looks: the rule that used to override `white-space` here was
    // withdrawn when the three cutting properties moved onto that one class.
    const lines = container.querySelectorAll('.ui-table-two-line-cell__title, .ui-table-two-line-cell__subtitle');
    expect(lines, 'the wrapping cell draws neither of its two lines').toHaveLength(2);
    for (const line of lines) {
      expect(line.className, 'a wrapping line takes the class that cuts it at one line').not.toContain('ui-truncating-line');
    }

    // jsdom loads no stylesheet, so what the wrapping variant declares of its own is read from the
    // library's own CSS: a long unbroken value breaks rather than overflowing, and nothing here
    // reinstates the ellipsis.
    const wrappedLines = ruleBody(
      '.ui-table-two-line-cell--wrap .ui-table-two-line-cell__title,\\s*.ui-table-two-line-cell--wrap .ui-table-two-line-cell__subtitle',
    );
    expect(wrappedLines).toMatch(/overflow-wrap:\s*anywhere/);
    expect(wrappedLines).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(ruleBody('.ui-table-two-line-cell--wrap .ui-table-two-line-cell__subtitle')).toMatch(/font-family:\s*inherit/);
  });

  // table-cells.md — "Every cell stays on one line and never grows the row's fixed height" is still
  // the default: the opt-in exceptions change nothing for the callers that do not ask for them
  it('keeps truncating on one line when wrap is not asked for', () => {
    const { container } = render(<TwoLineCell title="web-nginx" subtitle="a1b2c3d4 · running" />);

    expect(container.querySelector('.ui-table-two-line-cell')?.className).not.toContain('--wrap');

    // The three properties that cut a line are the truncation contract's, on one class
    // (`truncation-contract.md`: ".ui-truncating-line → one line of that run: a single line,
    // truncated with an ellipsis at the run's edge"), which the cell puts on both of its lines.
    // Asserted where they live rather than beside the cell, which is where they used to be.
    expect(container.querySelector('.ui-table-two-line-cell__title')?.className).toContain('ui-truncating-line');
    expect(container.querySelector('.ui-table-two-line-cell__subtitle')?.className).toContain('ui-truncating-line');

    const truncatingLine = ruleBody('.ui-truncating-line', 'src/ui/truncation.css');
    expect(truncatingLine).toMatch(/text-overflow:\s*ellipsis/);
    expect(truncatingLine).toMatch(/white-space:\s*nowrap/);
  });
});
