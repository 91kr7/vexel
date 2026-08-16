import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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

function rows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-usage-breakdown__row'));
}

/** The row's bar, which is the element exposing the share as a meter. */
function track(row: HTMLElement): HTMLElement {
  return within(row).getByRole('meter');
}

/**
 * What the row draws **on** its track: the bar of a magnitude above zero, or
 * the mark of a measured zero. A row that could not be measured draws neither,
 * which is the whole of `usage-breakdown.md`'s three-state contract.
 */
function mark(row: HTMLElement): HTMLElement | null {
  return track(row).firstElementChild as HTMLElement | null;
}

/**
 * Which color of the categorical palette a drawn element carries. The palette
 * is applied **by position** through a class of the library's own, never by an
 * item's choice, so the position is read wherever it is painted — bar, zero
 * mark or legend swatch — and `null` where no color is applied at all.
 *
 * That the same position resolves to the same paint in a row and in the legend
 * is a stylesheet fact, so it is asserted on the rendered colors in the browser
 * (`dashboard.spec.ts`) rather than here, where no stylesheet is applied.
 */
function series(element: Element | null): string | null {
  if (element === null) return null;
  const carried = Array.from(element.classList).find((name) => /--series-\d+$/.test(name));
  return carried === undefined ? null : carried.slice(carried.lastIndexOf('--series-'));
}

function legendEntries(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-usage-breakdown__legend-item'));
}

function legendLabels(): string[] {
  return legendEntries().map((entry) => entry.querySelector('.ui-usage-breakdown__legend-label')?.textContent ?? '');
}

function swatch(entry: HTMLElement): HTMLElement {
  return entry.querySelector<HTMLElement>('.ui-usage-breakdown__swatch')!;
}

function rowLabels(): string[] {
  return rows().map((row) => row.querySelector('.ui-usage-breakdown__label')?.textContent ?? '');
}

function rowValues(): string[] {
  return rows().map((row) => row.querySelector('.ui-usage-breakdown__value')?.textContent ?? '');
}

describe('UsageBreakdown (ui-library/specs/usage-breakdown.md, REQ-16)', () => {
  // usage-breakdown.md — "per row: the label, the absolute reading opposite it, and beneath them a
  // bar filled for value / total" / "total defaults to the sum of the items' values"
  it('draws one row per item, each with its label, its reading and its share of the sum', () => {
    render(<UsageBreakdown items={[item('Images', 750), item('Volumes', 250)]} />);

    expect(rowLabels()).toEqual(['Images', 'Volumes']);
    expect(rowValues()).toEqual(['750B', '250B']);
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

  // usage-breakdown.md — "total of 0 (or a sum of 0) → every magnitude is zero, so every row shows
  // the zero mark; the labels and readings still show"
  it('shows every row its zero mark when there is nothing to divide, still showing the labels and readings', () => {
    render(<UsageBreakdown items={[item('Images', 0, { valueLabel: 'zero images' }), item('Volumes', 0)]} />);

    expect(meterPercentages()).toEqual([0, 0]);
    expect(rowLabels()).toEqual(['Images', 'Volumes']);
    expect(rowValues()).toEqual(['zero images', '0B']);
    // Zero is a drawn state, not the absence of a drawing: each track still carries a mark.
    for (const row of rows()) {
      expect(mark(row), `the ${row.textContent} row draws nothing on its track`).not.toBeNull();
    }
  });

  // usage-breakdown.md — "each bar exposes its filled percentage to assistive technology as a meter
  // named after its label"
  it('names each bar after its own label for assistive technology', () => {
    render(<UsageBreakdown items={[item('Images', 500), item('Volumes', 500)]} />);

    expect(screen.getByRole('meter', { name: 'Images' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Volumes' })).toBeInTheDocument();
  });

  // usage-breakdown.md — "an item cannot pick its own color — position in the list decides it";
  // four colors that repeat past the fourth row
  it('colors the bars by position, with four colors that repeat past the fourth row', () => {
    render(
      <UsageBreakdown items={[item('a', 1), item('b', 1), item('c', 1), item('d', 1), item('e', 1), item('f', 1)]} />,
    );

    const variants = rows().map((row) => series(mark(row)));
    expect(variants.every((variant) => variant !== null)).toBe(true);
    expect(new Set(variants.slice(0, 4)).size).toBe(4);
    expect(variants[4]).toBe(variants[0]);
    expect(variants[5]).toBe(variants[1]);
  });

  // usage-breakdown.md — "The component formats nothing: it renders valueLabel as given and never
  // turns value into text."
  it('renders the reading exactly as given and never derives one from the value', () => {
    render(<UsageBreakdown items={[item('Images', 1_048_576, { valueLabel: '1.0MB' })]} />);

    expect(rowValues()).toEqual(['1.0MB']);
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

// usage-breakdown.md — "three distinguishable bar states, so that a reading of nothing is never the
// same picture as a reading that was never taken" (plan-ui-coherence-optimisation/REQ-68)
describe('UsageBreakdown — zero, unmeasured and a magnitude are three drawn states (REQ-68)', () => {
  // "a magnitude of exactly zero → a zero-length bar that is still drawn: its track, plus a mark of
  // the row's own color at the track's origin. Not an empty track."
  it("draws a mark of the row's own color where a measured magnitude is exactly zero", () => {
    render(<UsageBreakdown items={[item('Images', 750), item('Volumes', 0)]} />);

    const [images, volumes] = rows();
    const zeroMark = mark(volumes);
    expect(zeroMark, 'a measured zero draws nothing on its track').not.toBeNull();
    // Its color is the one its position gives it, and it is not the first row's.
    expect(series(zeroMark)).not.toBeNull();
    expect(series(zeroMark)).not.toBe(series(mark(images)));
    // The mark is not the bar: a zero-length bar and a bar are two pictures.
    expect(zeroMark!.className).not.toBe(mark(images)!.className);
    expect(meterPercentages()).toEqual([100, 0]);
  });

  // "unavailable → no bar and no mark at all; the track itself is drawn in a distinct, deliberate
  // treatment … which no measured row ever takes"
  it('draws no mark at all on a row that could not be measured, on a track of its own', () => {
    render(<UsageBreakdown items={[item('Images', 750), item('Volumes', 0, { unavailable: true, valueLabel: 'unavailable' })]} />);

    const [images, volumes] = rows();
    expect(mark(volumes), 'an unmeasured row draws a mark on its track').toBeNull();
    // A distinct treatment of the track itself, which the measured row does not take.
    expect(track(volumes).className).not.toBe(track(images).className);
    expect(rowValues()).toEqual(['750B', 'unavailable']);
  });

  // "unavailable? … `value` is then ignored and the row draws the unmeasured treatment"
  it('ignores the value of a row that could not be measured', () => {
    render(<UsageBreakdown items={[item('Images', 500, { unavailable: true }), item('Volumes', 500)]} />);

    expect(mark(rows()[0]), 'the ignored value was drawn as a bar').toBeNull();
  });

  // "each bar exposes its filled percentage … an unavailable row's meter announces valueLabel
  // instead of a percentage"
  it("announces the caller's own word instead of a percentage on an unmeasured row", () => {
    render(<UsageBreakdown items={[item('Images', 750), item('Volumes', 0, { unavailable: true, valueLabel: 'unavailable' })]} />);

    const unmeasured = screen.getByRole('meter', { name: 'Volumes' });
    expect(unmeasured).toHaveAttribute('aria-valuetext', 'unavailable');
    expect(unmeasured).toHaveAttribute('aria-valuenow', '0');

    // A measured row announces its percentage and nothing else.
    expect(screen.getByRole('meter', { name: 'Images' })).not.toHaveAttribute('aria-valuetext');
  });

  // The three states are three pictures: the whole point of REQ-68 is that no two of them coincide.
  it('draws three different pictures for a magnitude, a measured zero and an unmeasured row', () => {
    render(
      <UsageBreakdown
        items={[item('Images', 750), item('Volumes', 0), item('Cache', 0, { unavailable: true, valueLabel: 'unavailable' })]}
        total={1_000}
      />,
    );

    const [magnitude, zero, unmeasured] = rows();
    const pictures = [magnitude, zero, unmeasured].map(
      (row) => `${track(row).className} > ${mark(row)?.className ?? 'nothing'}`,
    );
    expect(new Set(pictures).size, `two of the three states draw the same picture: ${pictures.join(' | ')}`).toBe(3);
  });
});

// usage-breakdown.md — "a legend under the rows: one entry per item, in the same order, each pairing
// that item's own color with its label" (plan-ui-coherence-optimisation/REQ-67)
describe('UsageBreakdown — the legend explains every color it paints (REQ-67)', () => {
  it('names one entry per item, in the order the rows are drawn', () => {
    render(<UsageBreakdown items={[item('Images', 750), item('Containers', 100), item('Volumes', 150)]} />);

    expect(legendLabels()).toEqual(['Images', 'Containers', 'Volumes']);
    expect(legendLabels()).toEqual(rowLabels());
  });

  // "The legend and the rows are one list read twice … the component cannot show a color in one and
  // not the other."
  it("pairs each entry with the color that item's own row is drawn in", () => {
    render(<UsageBreakdown items={[item('a', 1), item('b', 1), item('c', 1), item('d', 1), item('e', 1)]} />);

    const rowColors = rows().map((row) => series(mark(row)));
    const legendColors = legendEntries().map((entry) => series(swatch(entry)));
    expect(legendColors).toEqual(rowColors);
    // Every color the component paints is explained, so no unexplained hue is left in the chart.
    expect(new Set(legendColors).size).toBe(new Set(rowColors).size);
  });

  // "An unavailable item's legend entry carries the unmeasured treatment rather than a color, for
  // the same reason."
  it('gives an unmeasured item the unmeasured treatment in the legend rather than a color', () => {
    render(<UsageBreakdown items={[item('Images', 750), item('Build cache', 0, { unavailable: true, valueLabel: 'unavailable' })]} />);

    const [measured, unmeasured] = legendEntries();
    expect(legendLabels()).toEqual(['Images', 'Build cache']);
    expect(series(swatch(unmeasured)), 'the unmeasured item was given a series color').toBeNull();
    expect(swatch(unmeasured).className).not.toBe(swatch(measured).className);
    expect(series(swatch(measured))).not.toBeNull();
  });

  // "emptyState? — rendered in place of the rows when items is empty": with no item there is no
  // color to explain either.
  it('explains nothing when there is nothing to break down', () => {
    render(<UsageBreakdown items={[]} emptyState={<span>The daemon reported no disk usage</span>} />);

    expect(legendEntries()).toHaveLength(0);
  });
});
