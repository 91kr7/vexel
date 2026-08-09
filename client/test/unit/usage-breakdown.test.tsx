import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UsageBreakdown, type UsageBreakdownItem } from '../../src/ui';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function item(id: string, value: number, overrides: Partial<UsageBreakdownItem> = {}): UsageBreakdownItem {
  return { id, label: id, value, valueLabel: `${value}B`, ...overrides };
}

/** The percentage each bar exposes to assistive technology, in the order the rows are drawn. */
function meterPercentages(): number[] {
  return screen.getAllByRole('meter').map((meter) => Number(meter.getAttribute('aria-valuenow')));
}

/**
 * What distinguishes one bar's color from the next. The palette is applied by
 * position through a class of the library's own, never by an item's choice.
 */
function fillVariants(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-usage-breakdown__fill')).map((fill) => fill.className);
}

describe('UsageBreakdown (ui-library/specs/usage-breakdown.md, REQ-16)', () => {
  // usage-breakdown.md — "per row: the label, the absolute reading opposite it, and beneath them a
  // bar filled for value / total" / "total defaults to the sum of the items' values"
  it('draws one row per item, each with its label, its reading and its share of the sum', () => {
    render(<UsageBreakdown items={[item('Images', 750), item('Volumes', 250)]} />);

    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getByText('750B')).toBeInTheDocument();
    expect(screen.getByText('Volumes')).toBeInTheDocument();
    expect(screen.getByText('250B')).toBeInTheDocument();
    expect(meterPercentages()).toEqual([75, 25]);
  });

  // usage-breakdown.md — "total? — the full scale every bar is drawn against"
  it('draws every bar against the given total rather than the sum', () => {
    render(<UsageBreakdown items={[item('Images', 250), item('Volumes', 250)]} total={1_000} />);

    expect(meterPercentages()).toEqual([25, 25]);
  });

  // usage-breakdown.md — "filled for value / total, clamped to 0…1"
  it('clamps a value larger than the total to a full bar', () => {
    render(<UsageBreakdown items={[item('Images', 4_000)]} total={1_000} />);

    expect(meterPercentages()).toEqual([100]);
  });

  // usage-breakdown.md — "value — negative or non-finite is treated as 0"
  it('treats a negative or non-finite value as zero', () => {
    render(<UsageBreakdown items={[item('Images', -500), item('Volumes', Number.NaN), item('Cache', 500)]} total={1_000} />);

    expect(meterPercentages()).toEqual([0, 0, 50]);
  });

  // usage-breakdown.md — "total of 0 (or a sum of 0) → every bar is empty; the labels and readings
  // still show"
  it('leaves every bar empty when there is nothing to divide, still showing the labels and readings', () => {
    render(<UsageBreakdown items={[item('Images', 0, { valueLabel: 'zero images' }), item('Volumes', 0)]} />);

    expect(meterPercentages()).toEqual([0, 0]);
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getByText('zero images')).toBeInTheDocument();
    expect(screen.getByText('0B')).toBeInTheDocument();
  });

  // usage-breakdown.md — "each bar exposes its filled percentage to assistive technology as a meter
  // named after its label"
  it('names each bar after its own label for assistive technology', () => {
    render(<UsageBreakdown items={[item('Images', 500), item('Volumes', 500)]} />);

    expect(screen.getByRole('meter', { name: 'Images' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Volumes' })).toBeInTheDocument();
  });

  // usage-breakdown.md — "each row's bar takes the next color of the library's four-color
  // categorical palette, by position in the list, repeating past the fourth"
  it('colors the bars by position, with four colors that repeat past the fourth row', () => {
    render(
      <UsageBreakdown items={[item('a', 1), item('b', 1), item('c', 1), item('d', 1), item('e', 1), item('f', 1)]} />,
    );

    const variants = fillVariants();
    expect(new Set(variants.slice(0, 4)).size).toBe(4);
    expect(variants[4]).toBe(variants[0]);
    expect(variants[5]).toBe(variants[1]);
  });

  // usage-breakdown.md — "The component formats nothing: it renders valueLabel as given and never
  // turns value into text."
  it('renders the reading exactly as given and never derives one from the value', () => {
    render(<UsageBreakdown items={[item('Images', 1_048_576, { valueLabel: '1.0MB' })]} />);

    expect(screen.getByText('1.0MB')).toBeInTheDocument();
    expect(screen.queryByText('1048576')).not.toBeInTheDocument();
  });

  // usage-breakdown.md — "onActivate?() — makes that row a single activatable control: a pointer
  // click and a keyboard activation (Tab-reachable, Enter/Space) both call it once"
  it('makes a row with onActivate one control, activated once by pointer, Enter and Space', async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    render(<UsageBreakdown items={[item('Images', 1, { onActivate, ariaLabel: 'Images — open the Images screen' })]} />);

    const row = screen.getByRole('button', { name: 'Images — open the Images screen' });

    // Reachable by Tab, then activated by each of the two keyboard activations…
    await user.tab();
    expect(row).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onActivate).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(onActivate).toHaveBeenCalledTimes(2);

    // …and once, not twice, by a pointer click.
    await user.click(row);
    expect(onActivate).toHaveBeenCalledTimes(3);
  });

  // usage-breakdown.md — "A row without it is inert and takes no focus." / "ariaLabel … ignored when
  // onActivate is absent"
  it('leaves a row without onActivate inert and unreachable by Tab', async () => {
    const user = userEvent.setup();
    render(<UsageBreakdown items={[item('Images', 1, { ariaLabel: 'never used' })]} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('never used')).not.toBeInTheDocument();

    await user.tab();
    expect(document.body).toHaveFocus();
  });

  // usage-breakdown.md — "emptyState? — rendered in place of the rows when items is empty"
  it('renders the empty state in place of the rows when there is nothing to break down', () => {
    render(<UsageBreakdown items={[]} emptyState={<span>The daemon reported no disk usage</span>} />);

    expect(screen.getByText('The daemon reported no disk usage')).toBeInTheDocument();
    expect(screen.queryAllByRole('meter')).toHaveLength(0);
  });
});
