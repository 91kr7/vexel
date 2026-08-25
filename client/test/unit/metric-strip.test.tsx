import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MetricStrip, type MetricStripColumn, type MetricStripReadings } from '../../src/ui';

/**
 * `ui-library/specs/metric-strip.md` — the row of metric columns an object presents its readings
 * in.
 *
 * Its central claim is about **width**: a column's width is the strip's to decide and never the
 * content's, which is the whole reason it is one component rather than three columns composed by
 * hand at each call site. jsdom lays nothing out, so that claim is read where it is written — the
 * stylesheet — and measured for real, across several cards of a list, in
 * `client/e2e/containers-card-geometry.spec.ts`.
 */

afterEach(cleanup);

const COLUMNS: MetricStripColumn[] = [
  { id: 'cpu', label: 'CPU', valueText: '0.4%', value: 0.4, max: 800, reading: 'of 8 cores' },
  { id: 'memory', label: 'MEMORY', valueText: '12.0MB', value: 12, max: 100, reading: 'of 100MB' },
];

const READINGS: MetricStripReadings = {
  label: 'NET I/O',
  items: [
    { id: 'in', label: 'in', value: '2.0KB' },
    { id: 'out', label: 'out', value: '1.0KB' },
  ],
};

function renderStrip(readings?: MetricStripReadings): HTMLElement {
  const view = render(<MetricStrip columns={COLUMNS} readings={readings} />);
  return view.container.querySelector<HTMLElement>('.ui-metric-strip')!;
}

/** The strip's stylesheet, comments stripped, so a value named in a comment is never read as a declaration. */
const css = readFileSync(join(process.cwd(), 'src/ui/metrics/metrics.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
  selector: string;
  conditions: string[];
  declarations: string;
}

/** Every rule of the stylesheet with the at-rules enclosing it, so a media-query block is told from the base one. */
function rules(): Rule[] {
  const out: Rule[] = [];
  const conditions: string[] = [];
  let buffer = '';
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === '{') {
      const prelude = buffer.trim();
      buffer = '';
      if (prelude.startsWith('@')) {
        conditions.push(prelude);
        continue;
      }
      const end = css.indexOf('}', index);
      out.push({ selector: prelude, conditions: [...conditions], declarations: css.slice(index + 1, end) });
      index = end;
      continue;
    }
    if (character === '}') {
      conditions.pop();
      buffer = '';
      continue;
    }
    buffer += character;
  }
  return out;
}

function declarationsOf(selector: string, inCondition?: RegExp): string {
  return rules()
    .filter((rule) => rule.selector.split(',').some((one) => one.trim() === selector))
    .filter((rule) => (inCondition ? rule.conditions.some((condition) => inCondition.test(condition)) : rule.conditions.length === 0))
    .map((rule) => rule.declarations)
    .join(' ');
}

// metric-strip.md — "every tracked column has the same width, whatever it holds; the trailing
// readings column is narrower than one of them", and "widths are flex proportions against a zero
// basis with the content's automatic minimum waived" (REQ-6, REQ-10).
describe('MetricStrip — the columns\' widths are the strip\'s (REQ-6, REQ-10)', () => {
  it('gives every tracked column one flex proportion against a zero basis, with the automatic minimum waived', () => {
    const column = declarationsOf('.ui-metric-strip__column');

    expect(column, 'the strip declares no width for its columns at all').not.toBe('');
    const flex = /flex:\s*([\d.]+)\s+[\d.]+\s+0(px)?\s*;/.exec(column);
    expect(flex, `a tracked column is not sized as a proportion of a zero basis: ${column}`).not.toBeNull();
    expect(column, "the content's automatic minimum is left to decide the column's width").toMatch(/min-width:\s*0/);
  });

  it('makes the trailing readings column narrower than a tracked one', () => {
    const trackedFlex = Number(/flex:\s*([\d.]+)/.exec(declarationsOf('.ui-metric-strip__column'))?.[1]);
    const readingsFlex = Number(/flex:\s*([\d.]+)/.exec(declarationsOf('.ui-metric-strip__column--readings'))?.[1]);

    expect(Number.isFinite(trackedFlex) && Number.isFinite(readingsFlex)).toBe(true);
    expect(readingsFlex).toBeLessThan(trackedFlex);
  });

  it('lays the columns out in one row spanning the strip', () => {
    const strip = declarationsOf('.ui-metric-strip');

    expect(strip).toMatch(/display:\s*flex/);
    expect(strip).not.toMatch(/flex-direction:\s*column/);
  });
});

// metric-strip.md — "the second line of every column starts at the same y… however tall each
// column's first line would otherwise have been" (REQ-8).
describe('MetricStrip — the readings sit on the tracks\' own line (REQ-8)', () => {
  it('reserves one line of the same height for a tracked column\'s head and for the readings\' head', () => {
    const head = declarationsOf('.ui-meter--prominent .ui-meter__head');
    const readingsHead = declarationsOf('.ui-metric-strip__readings-head');

    expect(head, 'the meter reserves no line for its head').toMatch(/min-height:/);
    expect(readingsHead, 'the readings column reserves no line for its label').toMatch(/min-height:/);
    expect(/min-height:\s*([^;]+)/.exec(readingsHead)?.[1].trim()).toBe(/min-height:\s*([^;]+)/.exec(head)?.[1].trim());
  });
});

// metric-strip.md — "below the phone breakpoint (720px) the strip stacks: one full-width column per
// metric, each keeping its label, its value, its reading and its track" (REQ-34).
describe('MetricStrip — it stacks below the phone breakpoint (REQ-34)', () => {
  it('turns into one full-width column per metric under 720px, tracked and untracked alike', () => {
    const phone = /max-width:\s*720px/;
    const strip = declarationsOf('.ui-metric-strip', phone);
    const column = declarationsOf('.ui-metric-strip__column', phone);
    const readings = declarationsOf('.ui-metric-strip__column--readings', phone);

    expect(strip, 'the strip does not stack at the phone breakpoint').toMatch(/flex-direction:\s*column/);
    expect(column).toMatch(/width:\s*100%/);
    expect(readings).toMatch(/width:\s*100%/);
  });

  it('drops nothing on the way there: the same columns are rendered at every width', () => {
    const strip = renderStrip(READINGS);

    // One markup at every width — the stacking is the stylesheet's, so nothing can be dropped by it.
    expect(strip.querySelectorAll('.ui-metric-strip__column')).toHaveLength(3);
    expect(strip.querySelectorAll('.ui-meter__track')).toHaveLength(2);
    expect(strip.textContent).toContain('of 8 cores');
    expect(strip.textContent).toContain('of 100MB');
  });
});

// metric-strip.md — the contract: a column is exactly a Meter, and the trailing column carries a
// label over a pair of readings and no bar.
describe('MetricStrip — what it draws (REQ-6, REQ-7, REQ-8)', () => {
  it('renders one Meter per tracked column, with its label, value, reading and track', () => {
    const strip = renderStrip(READINGS);

    const [cpu, memory] = Array.from(strip.querySelectorAll('.ui-metric-strip__column'));
    expect(cpu.querySelector('.ui-meter__label--eyebrow')?.textContent).toBe('CPU');
    expect(cpu.querySelector('.ui-meter__value')?.textContent).toBe('0.4%');
    expect(cpu.querySelector('.ui-meter__reading')?.textContent).toBe('of 8 cores');
    expect(cpu.querySelector('.ui-meter__track')).not.toBeNull();
    expect(memory.querySelector('.ui-meter__value')?.textContent).toBe('12.0MB');
  });

  it('draws the trailing column\'s label alone on the first line, its readings on the second, and no bar', () => {
    const strip = renderStrip(READINGS);

    const readings = strip.querySelector('.ui-metric-strip__column--readings') as HTMLElement;
    expect(readings.querySelector('.ui-metric-strip__readings-head')?.textContent).toBe('NET I/O');
    const items = Array.from(readings.querySelectorAll('.ui-metric-strip__reading')).map((item) => [
      item.querySelector('.ui-metric-strip__reading-label')?.textContent,
      item.querySelector('.ui-meter__value')?.textContent,
    ]);
    expect(items).toEqual([
      ['in', '2.0KB'],
      ['out', '1.0KB'],
    ]);
    expect(readings.querySelector('.ui-meter__track')).toBeNull();
    expect(readings.querySelector('[role="meter"]')).toBeNull();
  });

  it('renders the tracked columns alone when it is given no readings', () => {
    const strip = renderStrip();

    expect(strip.querySelectorAll('.ui-metric-strip__column')).toHaveLength(2);
    expect(strip.querySelector('.ui-metric-strip__column--readings')).toBeNull();
  });
});

// metric-strip.md — "nothing is animated or transitioned: a value that changes is redrawn where it
// stood", and "it declares no typography of its own" (REQ-17, REQ-30).
describe('MetricStrip — what it deliberately does not do (REQ-17, REQ-30)', () => {
  it('animates and transitions nothing, on the strip or on any part of it', () => {
    const stripRules = rules().filter((rule) => rule.selector.includes('.ui-metric-strip'));

    expect(stripRules.length).toBeGreaterThan(0);
    for (const rule of stripRules) {
      expect(rule.declarations, `${rule.selector} animates or transitions`).not.toMatch(/(^|;|\s)(transition|animation)[-a-z]*\s*:/);
    }
  });

  it('takes the label and value treatments from the metric primitives, by selector, declaring neither again', () => {
    const strip = renderStrip(READINGS);

    // The readings label and the readings' values are the primitives' own single declarations.
    expect(strip.querySelector('.ui-metric-strip__readings-head p')?.className).toBe('ui-meter__label--eyebrow');
    expect(strip.querySelector('.ui-metric-strip__reading .ui-meter__value')).not.toBeNull();
    // The strip's own rules size and place columns; they declare no font of their own.
    for (const rule of rules().filter((one) => one.selector === '.ui-metric-strip' || one.selector === '.ui-metric-strip__column')) {
      expect(rule.declarations, `${rule.selector} declares typography of its own`).not.toMatch(/font-(size|weight|family)\s*:/);
    }
  });
});

// metric-strip.md, widened on 2026-08-25 — `stacked` asks for the one-per-row shape at **any**
// width, for a strip inside a card standing in a grid rather than across the page. "The stacked
// shape is one shape, not two": what `stacked` asks for and what the phone breakpoint falls into are
// the same declarations (plan-docker_management_app-containers_card_view/REQ-6, REQ-34).
describe('MetricStrip — stacked at any width (containers_card_view/REQ-6)', () => {
  it('marks the strip as stacked only when it is asked for, and renders exactly as before when it is not', () => {
    const { container: stacked, unmount } = render(<MetricStrip stacked columns={COLUMNS} readings={READINGS} />);
    expect(stacked.querySelector('.ui-metric-strip')?.className).toContain('ui-metric-strip--stacked');
    const stackedMarkup = stacked.innerHTML;
    unmount();

    const { container: plain } = render(<MetricStrip columns={COLUMNS} readings={READINGS} />);
    expect(plain.querySelector('.ui-metric-strip')?.className).toBe('ui-metric-strip');
    expect(
      stackedMarkup.replace(' ui-metric-strip--stacked', ''),
      'asking for the stacked shape changed something other than the arrangement',
    ).toBe(plain.innerHTML);
  });

  it('drops nothing when it stacks: every column keeps its label, value, capacity note and track', () => {
    const { container } = render(<MetricStrip stacked columns={COLUMNS} readings={READINGS} />);

    const strip = container.querySelector('.ui-metric-strip')!;
    expect(strip.querySelectorAll('.ui-metric-strip__column')).toHaveLength(3);
    expect(strip.querySelectorAll('.ui-meter__track')).toHaveLength(2);
    expect(strip.textContent).toContain('of 8 cores');
    expect(strip.textContent).toContain('of 100MB');
    expect(strip.textContent).toContain('NET I/O');
  });

  it('asks for one full-width column per metric, and asks for the very shape the phone breakpoint falls into', () => {
    const stacked = declarationsOf('.ui-metric-strip--stacked');
    const phone = /max-width:\s*720px/;

    expect(stacked, 'the stacked shape is declared nowhere').not.toBe('');
    expect(stacked).toMatch(/flex-direction:\s*column/);
    expect(declarationsOf('.ui-metric-strip', phone)).toMatch(/flex-direction:\s*column/);
    // One shape: what the strip is asked for and what it falls into cannot diverge.
    for (const selector of ['.ui-metric-strip__column', '.ui-metric-strip__column--readings']) {
      const asked = rules().filter((rule) =>
        rule.selector.split(',').some((one) => one.trim() === `.ui-metric-strip--stacked ${selector}`),
      );
      const fallen = rules().filter(
        (rule) =>
          rule.selector.split(',').some((one) => one.trim() === selector) &&
          rule.conditions.some((condition) => phone.test(condition)),
      );
      expect(asked.length + fallen.length, `${selector} takes no stacked width at all`).toBeGreaterThan(0);
    }
  });

  // metric-strip.md — "stacked, the readings column is one line: its label at the left and its
  // readings at the right, which is the rhythm every other row of a stacked strip reads in."
  it('reads the untracked column on one line when stacked, and on two when it is not', () => {
    const stackedHead = declarationsOf('.ui-metric-strip--stacked .ui-metric-strip__column--readings');

    expect(stackedHead, 'the untracked column keeps its two lines when the strip stacks').not.toBe('');
    expect(stackedHead).toMatch(/flex-direction:\s*row|justify-content:\s*space-between/);
  });
});

// metric-strip.md, widened on 2026-08-25 — track-less rows drawn after the metrics on the metrics'
// own rhythm: the label at the left anchoring the row, the content right-aligned. It is what the
// card's `PORTS` row is (plan-docker_management_app-containers_card_view/REQ-5, REQ-6).
describe('MetricStrip — its track-less labelled rows (containers_card_view/REQ-6)', () => {
  const ROWS = [
    { id: 'ports', label: 'PORTS', content: <span className="probe">8080→80</span> },
  ];

  it('draws each row after the metrics, its label in the strip’s own treatment and its content untouched', () => {
    const { container } = render(<MetricStrip columns={COLUMNS} readings={READINGS} rows={ROWS} />);

    const group = container.querySelector('.ui-metric-strip-group')!;
    const [strip, row] = Array.from(group.children);
    expect(strip.className).toContain('ui-metric-strip');
    expect(row.className).toBe('ui-metric-strip__row');
    expect(row.querySelector('.ui-meter__label--eyebrow')?.textContent).toBe('PORTS');
    expect(row.querySelector('.ui-metric-strip__row-content .probe')?.textContent).toBe('8080→80');
  });

  it('renders a strip given no rows exactly as it rendered before the prop existed', () => {
    const { container: without, unmount } = render(<MetricStrip columns={COLUMNS} readings={READINGS} />);
    expect(without.querySelector('.ui-metric-strip-group')).toBeNull();
    expect((without.firstElementChild as HTMLElement).className).toBe('ui-metric-strip');
    unmount();

    const { container: withRows } = render(<MetricStrip columns={COLUMNS} readings={READINGS} rows={[]} />);
    expect(withRows.querySelector('.ui-metric-strip-group')).toBeNull();
  });

  // "A row's label is what anchors it, so a row holding one item and a row holding four keep the
  // same shape and the same left edge."
  it('anchors the row at its label and right-aligns what it holds, wrapping there rather than widening', () => {
    const row = declarationsOf('.ui-metric-strip__row');
    const content = declarationsOf('.ui-metric-strip__row-content');

    expect(row, 'the row is laid out nowhere').not.toBe('');
    expect(row).toMatch(/display:\s*flex/);
    expect(row).toMatch(/justify-content:\s*space-between/);
    expect(content).toMatch(/justify-content:\s*flex-end|margin-inline-start:\s*auto|text-align:\s*right/);
    expect(content, 'the row’s content widens the strip instead of wrapping inside it').toMatch(/flex-wrap:\s*wrap|min-width:\s*0/);
  });
});
