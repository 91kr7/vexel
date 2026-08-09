import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BadgeListCell, IdentifierCell, MetaCell } from '../../src/ui';

afterEach(cleanup);

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
});
