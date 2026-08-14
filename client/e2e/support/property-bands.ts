/**
 * **Measuring a property section, band by band.**
 *
 * Written for `plan-docker_management_app-detail_property_columns` (bug-4) and
 * shared by its four specs, because the same defect has to be shown on more than
 * one surface to be shown to be the shared component's.
 *
 * Two rules govern everything here, and both were paid for:
 *
 * - **The column count is deduced from measured band positions** — bands sharing
 *   a top edge are one line — **never from a class name, an attribute or a
 *   prop** (REQ-39). Asserting on the class the component emits would certify
 *   the implementation instead of the result, and would have passed on the
 *   delivered `columns={2}` surfaces too.
 * - **Content certifies nothing here** (REQ-40). *"Nine properties are listed"*,
 *   *"`Exposed ports` is displayed"* and *"the panel contains 1154 characters"*
 *   are all true of the screenshot in the bug report, and the last of them is
 *   quoted from coverage that passed while a dialog sat 1044px above the
 *   viewport. Every number below is a viewport box the browser reports; content
 *   assertions stand beside them, never instead of them.
 */
import { expect, type Locator } from '@playwright/test';

/** A rectangle in viewport coordinates, as the browser reports it. */
export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface BandGeometry {
  /** The band's own label text — for naming a band in a failure message, never for deciding anything. */
  label: string;
  box: Rect;
  labelBox: Rect | null;
  valueBox: Rect | null;
  /**
   * The label→value run: from the label's left edge to the value's right edge.
   * This is the quantity the report is about — 1170px of it on the `Created`
   * band of a 1458px section (REQ-1).
   */
  run: number | null;
  /** Whether the value's box lies inside the band's (REQ-24). */
  valueInsideBand: boolean;
  /** Whether the label's box intersects the value's (REQ-24). */
  labelIntersectsValue: boolean;
}

export interface SectionGeometry {
  box: Rect;
  /** The box of the element the section is placed in: the section must lie inside it (REQ-24). */
  containerBox: Rect;
  bands: BandGeometry[];
  /** The top edge of each line, in order — the measurement the column count is deduced from. */
  lineTops: number[];
  /** Bands on the first line: the number of columns (REQ-39). */
  columns: number;
  lines: number;
  /** The longest label→value run in the section (REQ-1). */
  maxRun: number;
  /** From the rightmost band's right edge to the section's own: dead margin, if any (REQ-11). */
  rightEdgeGap: number;
  /** Labels in the order the positions read: left to right, then down (REQ-10). */
  positionalOrder: string[];
  /** Labels in document order — what assistive technology is handed (REQ-14). */
  documentOrder: string[];
  /** Distinct band heights per line: one per line, or the line does not read as a line (REQ-9). */
  bandHeightsByLine: number[][];
}

/** Bands within this many pixels of each other's top edge are on one line. */
const LINE_TOLERANCE_PX = 1;

/** The short-scalar transitions, from the 360px minimum and the `--space-6` gap: `floor((W + 24) / 384)`. */
export const SHORT_SCALAR_TRANSITIONS_PX = [744, 1128, 1512];

/**
 * A count asserted within this distance of a transition is an assertion about a
 * rounding rule, not about the arrangement — so the run fails rather than
 * passing for the wrong reason.
 */
export const TRANSITION_CLEARANCE_PX = 40;

/** The bound on a short-scalar band's label→value run (REQ-1), with the tolerance the "~" carries. */
export const SHORT_SCALAR_RUN_MAX_PX = 500;

/** One gap (`--space-6`) is what "fills its width" allows between the last band and the section's edge (REQ-11). */
export const COLUMN_GAP_PX = 24;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Measures one property section in a single pass, so every number belongs to the
 * same layout.
 *
 * The section is located by the element that draws it; **what is deduced from it
 * is deduced from geometry alone**.
 */
export async function measureSection(section: Locator, name: string): Promise<SectionGeometry> {
  await expect(section, `${name} is not on screen, so nothing about its arrangement can be measured`).toBeVisible();
  const geometry = await section.evaluate((element, tolerance) => {
    const rect = (target: Element) => {
      const box = target.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height };
    };
    const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;

    const bands = Array.from(element.children)
      .filter((band) => band.getBoundingClientRect().height > 0)
      .map((band) => {
        const bandBox = band.getBoundingClientRect();
        const labelElement = band.querySelector('.ui-definition-list__label');
        const valueElement = band.querySelector('.ui-definition-list__value');
        const labelBox = labelElement?.getBoundingClientRect() ?? null;
        const valueBox = valueElement?.getBoundingClientRect() ?? null;
        return {
          label: labelElement?.textContent ?? band.textContent?.slice(0, 40) ?? '(no label)',
          box: rect(band),
          labelBox: labelBox ? { top: labelBox.top, bottom: labelBox.bottom, left: labelBox.left, right: labelBox.right, width: labelBox.width, height: labelBox.height } : null,
          valueBox: valueBox ? { top: valueBox.top, bottom: valueBox.bottom, left: valueBox.left, right: valueBox.right, width: valueBox.width, height: valueBox.height } : null,
          run: labelBox && valueBox ? valueBox.right - labelBox.left : null,
          valueInsideBand: valueBox
            ? valueBox.left >= bandBox.left - 0.5 && valueBox.right <= bandBox.right + 0.5 && valueBox.top >= bandBox.top - 0.5 && valueBox.bottom <= bandBox.bottom + 0.5
            : true,
          labelIntersectsValue: labelBox !== null && valueBox !== null && intersects(labelBox, valueBox),
        };
      });

    // Lines from measured top edges, and nothing else.
    const lineTops: number[] = [];
    for (const band of bands) {
      if (!lineTops.some((top) => Math.abs(top - band.box.top) <= tolerance)) lineTops.push(band.box.top);
    }
    lineTops.sort((a, b) => a - b);
    const lineOf = (band: (typeof bands)[number]) => lineTops.findIndex((top) => Math.abs(top - band.box.top) <= tolerance);

    const positional = [...bands].sort((a, b) => lineOf(a) - lineOf(b) || a.box.left - b.box.left);
    const containerElement = element.parentElement ?? element;

    return {
      box: rect(element),
      containerBox: rect(containerElement),
      bands,
      lineTops,
      columns: bands.filter((band) => lineOf(band) === 0).length,
      lines: lineTops.length,
      maxRun: bands.length === 0 ? 0 : Math.max(...bands.map((band) => band.run ?? 0)),
      rightEdgeGap: bands.length === 0 ? Number.NaN : rect(element).right - Math.max(...bands.map((band) => band.box.right)),
      positionalOrder: positional.map((band) => band.label),
      documentOrder: bands.map((band) => band.label),
      bandHeightsByLine: lineTops.map((_, line) => bands.filter((band) => lineOf(band) === line).map((band) => Math.round(band.box.height))),
    };
  }, LINE_TOLERANCE_PX);

  expect(geometry.bands.length, `${name} draws no band at all, so it is present and empty — which the arrangement can never be`).toBeGreaterThan(0);
  return geometry as SectionGeometry;
}

/**
 * Every measurement of a run is wanted, not only the first one that disagrees:
 * on a layout defect the numbers **are** the evidence, and "before: failed" is
 * not (REQ-42).
 */
export function report(label: string, geometry: SectionGeometry): string {
  return [
    `${label}: section ${round(geometry.box.width)}×${round(geometry.box.height)}px`,
    `${geometry.columns} column(s) × ${geometry.lines} line(s) over ${geometry.bands.length} bands`,
    `longest label→value run ${round(geometry.maxRun)}px`,
    `right-edge gap ${round(geometry.rightEdgeGap)}px`,
    `band widths [${geometry.bands.map((band) => round(band.box.width)).join(', ')}]`,
  ].join(' — ');
}

/**
 * The invariants that hold at **every** width, on **every** consuming screen: a
 * value inside its own band, no label box over its value's, and the section
 * inside what it is placed in (REQ-8, REQ-24).
 */
export function expectNothingClippedOrOverlapped(geometry: SectionGeometry, evidence: string): void {
  const outside = geometry.bands.filter((band) => !band.valueInsideBand);
  expect(
    outside.map((band) => band.label),
    `${evidence} — ${outside.length} value(s) are drawn outside their own band, which is what clipping looks like from here`,
  ).toEqual([]);

  const overlapping = geometry.bands.filter((band) => band.labelIntersectsValue);
  expect(overlapping.map((band) => band.label), `${evidence} — ${overlapping.length} label box(es) intersect their own value's`).toEqual([]);

  const inside = geometry.box.left >= geometry.containerBox.left - 0.5 && geometry.box.right <= geometry.containerBox.right + 0.5;
  expect(
    inside,
    `${evidence} — the section's box (${round(geometry.box.left)}…${round(geometry.box.right)}) is not inside its container's (${round(geometry.containerBox.left)}…${round(geometry.containerBox.right)})`,
  ).toBe(true);
}

/** A line of the grid reads as a line: bands sharing a top edge share a height (REQ-9). */
export function expectLinesReadAsLines(geometry: SectionGeometry, evidence: string): void {
  for (const [line, heights] of geometry.bandHeightsByLine.entries()) {
    const distinct = [...new Set(heights)];
    expect(distinct, `${evidence} — line ${line} holds bands of ${distinct.length} different heights (${heights.join(', ')}px), so it does not read as a line`).toHaveLength(1);
  }
}

/**
 * Refuses a measurement taken on a transition (744 / 1128 / 1512px for short
 * scalars): a count asserted there is an assertion about a rounding rule.
 */
export function expectClearOfTransition(width: number, evidence: string, transitions = SHORT_SCALAR_TRANSITIONS_PX): void {
  const near = transitions.filter((transition) => Math.abs(width - transition) < TRANSITION_CLEARANCE_PX);
  expect(
    near,
    `${evidence} — the measured width ${round(width)}px lands within ${TRANSITION_CLEARANCE_PX}px of the transition(s) at ${near.join(', ')}px, so a count asserted here would be an assertion about a rounding rule rather than about the arrangement`,
  ).toEqual([]);
}

/**
 * A set of elements, measured and grouped into lines by their top edges — for a
 * list of single values, where the entries themselves are what an operator
 * counts per line.
 *
 * Deliberately measures **the entries and not their container**: the container
 * is a different element before this batch's correction and after it, and a
 * check that could only find one of the two could not be red on the other.
 */
export async function measureEntries(entries: Locator, name: string): Promise<{ boxes: Rect[]; perLine: number; lines: number; spread: number }> {
  const count = await entries.count();
  expect(count, `${name} draws no entry at all, so nothing about its arrangement can be measured`).toBeGreaterThan(0);
  const boxes = (await entries.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height };
    }),
  )) as Rect[];

  const lineTops: number[] = [];
  for (const box of boxes) {
    if (!lineTops.some((top) => Math.abs(top - box.top) <= LINE_TOLERANCE_PX)) lineTops.push(box.top);
  }
  lineTops.sort((a, b) => a - b);
  return {
    boxes,
    perLine: boxes.filter((box) => Math.abs(box.top - (lineTops[0] ?? 0)) <= LINE_TOLERANCE_PX).length,
    lines: lineTops.length,
    spread: Math.max(...boxes.map((box) => box.right)) - Math.min(...boxes.map((box) => box.left)),
  };
}

/**
 * Whether a band's value is drawn over more than one line — measured against the
 * label beside it, which is always one line, rather than against the band's own
 * height, which a control inside it legitimately raises.
 */
export function valueWraps(band: BandGeometry): boolean {
  if (!band.valueBox || !band.labelBox) return false;
  return band.valueBox.height > band.labelBox.height * 1.6;
}

/** The bands of a single-value arrangement (no label), measured the same way. */
export async function measureValueBands(container: Locator, name: string): Promise<{ box: Rect; perLine: number; lines: number; bands: Rect[] }> {
  await expect(container, `${name} is not on screen, so nothing about its arrangement can be measured`).toBeVisible();
  return container.evaluate((element, tolerance) => {
    const rect = (target: Element) => {
      const box = target.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height };
    };
    const bands = Array.from(element.children)
      .filter((band) => band.getBoundingClientRect().height > 0)
      .map(rect);
    const lineTops: number[] = [];
    for (const band of bands) {
      if (!lineTops.some((top) => Math.abs(top - band.top) <= tolerance)) lineTops.push(band.top);
    }
    lineTops.sort((a, b) => a - b);
    return {
      box: rect(element),
      bands,
      perLine: bands.filter((band) => Math.abs(band.top - (lineTops[0] ?? 0)) <= tolerance).length,
      lines: lineTops.length,
    };
  }, LINE_TOLERANCE_PX);
}
