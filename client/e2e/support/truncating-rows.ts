/**
 * **Measuring a truncating row: the ink, not the string.**
 *
 * Written for F4 (`plan-ui-coherence-optimisation/REQ-17` … `REQ-21`), and the
 * shape of every function here is decided by one trap the batch's own delivery
 * record names: an ellipsised line is still *laid out* at its full length and
 * only painted clipped, so `Range.getClientRects()` reports the string and not
 * the rectangle the eye sees. A check built on it measures the thing that does
 * not move, concludes "no change" on a working contract, and would have passed
 * on the defect it exists to catch.
 *
 * So: **every text rectangle is clipped by every ancestor that is not
 * `overflow: visible`**, the element itself included, and an overlap is the
 * geometric intersection of those clipped rectangles with the trailing group's
 * box. Both halves of a row are read in one pass, so no two figures come from
 * two different layouts.
 *
 * The second instrument here is the **synthetic 64-character identifier**
 * (REQ-19). Real fixtures vary — a daemon's own volumes and contexts are
 * whatever the operator made — and the requirement is about an identifier of
 * *any* length, a 64-character hash being the normal case in this product. So a
 * row can be re-measured with each of its truncating lines carrying such an
 * identifier: the text is replaced, the layout is read back synchronously in the
 * same evaluation, and the original text is put back before the call returns.
 * Nothing about the page outlives the measurement.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** A rectangle in viewport coordinates, as the browser reports it. */
export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/** One text rectangle of a trailing value, unclipped and clipped, so "lost to clipping" is a number. */
export interface InkRect {
  rect: Rect;
  /** The same rectangle before anything clipped it. */
  laidOut: Rect;
  /**
   * The same rectangle clipped only up to and including the element it belongs
   * to — the run, or the trailing group.
   *
   * The distance between this and `rect` is the whole reason the two are kept
   * apart: **ink lost inside the element is that element being squeezed**, which
   * is the contract's business, while **ink lost above it is the box the element
   * was put in being too narrow**, which is the call site's. On these three
   * screens at 375×812 the second is dominant and is not this batch's to repair
   * (fixed `Grid` templates at `VolumesNetworksScreen.tsx:17`,
   * `SystemScreen.tsx:176`, `ContextsScreen.tsx:156`), so a check that added the
   * two together would fail on somebody else's defect and hide its own.
   */
  withinOwner: Rect;
}

export interface OverlapRect {
  /** Index of the trailing element the run inks over. */
  meta: number;
  rect: Rect;
  area: number;
}

export interface TruncatingRowGeometry {
  /** The run's first line of text, as the row really carries it — for naming a row, never for deciding anything. */
  label: string;
  /** The whole row's text, as the row really carries it: what a caller matches a row of its own on. */
  rowText: string;
  /** `card` for a `CardList` row, `storage` for a `StorageUsageRow`, `other` for any further adopter. */
  kind: 'card' | 'storage' | 'other';
  rowBox: Rect;
  /**
   * The width the row actually offers its children: its border box less its own
   * padding. This — not the border box — is what the run's floor is capped by on
   * a row narrower than the floor, and the two differ by 40px on a card.
   */
  rowContentWidth: number;
  /** The flexible run's own box, `null` on a row that carries no run. */
  runBox: Rect | null;
  /** The painted ink of the run's text, clipped by every non-`visible` overflow ancestor. */
  runInk: InkRect[];
  /** Ink of the run that lands outside the run's own box — the "inks over its neighbour" quantity. */
  runInkOutsideRun: number;
  /** The trailing metadata elements, in document order. */
  metaBoxes: Rect[];
  /** Their painted ink, measured the same way as the run's. */
  metaInk: InkRect[][];
  /** Every intersection between the run's painted ink and a trailing box. */
  overlaps: OverlapRect[];
  /** Every intersection between the run's own box and a trailing box, layout-level rather than ink-level. */
  boxOverlaps: OverlapRect[];
  /** Whether the run and the trailing group sit on different lines (the contract's wrap outcome). */
  trailingOnItsOwnLine: boolean;
  /** The floor the contract puts under a run: `--truncating-run-min-width`, in px. */
  floor: number;
  /** Whether any of the run's lines is currently longer than the box that paints it. */
  runIsTruncating: boolean;
  /** `title` attributes carried by the run's truncating lines. */
  runLineTitles: (string | null)[];
  /** The computed `user-select` of the run's truncating lines. */
  runLineUserSelect: string[];
}

export interface SweepOptions {
  /**
   * Replaces every truncating line **of the run** with this text for the
   * duration of the measurement.
   *
   * The run alone, deliberately: REQ-19 is about an identifier of any length in
   * the flexible text, and a trailing meta value is frequently a `MetaCell`,
   * which carries the same line class. Injecting into it would stretch the very
   * neighbour the run must not disturb and report a defect the instrument made.
   */
  inject?: string;
}

/** A 64-character identifier — the length of a Docker hash, which is the normal case in this product. */
export const SYNTHETIC_64_CHAR_IDENTIFIER = 'b8f4a1c0e93d7526af0b1d4c8e37a95f6210cd8b4e7f3a29c50d61b8f7e4a3c2';

/** The three viewports F4 is stated at (REQ-18). */
export const F4_VIEWPORTS = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
];

export function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function describeRect(rect: Rect): string {
  return `x=${round(rect.left)}, y=${round(rect.top)}, ${round(rect.width)}×${round(rect.height)}`;
}

/**
 * Measures every truncating row currently on screen, or only those inside
 * `within`.
 *
 * One `evaluate` for the whole page: the synthetic identifier is written, the
 * layout is read and the original text is restored without ever yielding, so a
 * re-render cannot land between the three.
 */
export async function measureTruncatingRows(page: Page, within?: Locator, options: SweepOptions = {}): Promise<TruncatingRowGeometry[]> {
  const scope = within ?? page.locator('body');
  return (await scope.evaluate((root, injected: string | null) => {
    const rect = (box: DOMRect | { top: number; bottom: number; left: number; right: number }): Rect => ({
      top: box.top,
      bottom: box.bottom,
      left: box.left,
      right: box.right,
      width: box.right - box.left,
      height: box.bottom - box.top,
    });

    // The correction the batch's delivery record insists on: a rectangle is cut
    // down by every ancestor that clips, the element itself included. Without
    // this an ellipsised line measures its full laid-out length and the
    // instrument reports a collision that is not painted, or misses a repair
    // that is.
    const clip = (raw: DOMRect, from: Element | null, stopAfter: Element | null): Rect | null => {
      let { top, bottom, left, right } = raw;
      for (let node: Element | null = from; node !== null; node = node.parentElement) {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        if (style.overflowX !== 'visible') {
          left = Math.max(left, box.left);
          right = Math.min(right, box.right);
        }
        if (style.overflowY !== 'visible') {
          top = Math.max(top, box.top);
          bottom = Math.min(bottom, box.bottom);
        }
        if (stopAfter !== null && node === stopAfter) break;
      }
      if (right - left <= 0.5 || bottom - top <= 0.5) return null;
      return rect({ top, bottom, left, right });
    };

    const ink = (element: Element | null): { rect: Rect; laidOut: Rect; withinOwner: Rect }[] => {
      if (!element) return [];
      const out: { rect: Rect; laidOut: Rect; withinOwner: Rect }[] = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.nodeValue?.trim()) continue;
        range.selectNodeContents(node);
        for (const raw of Array.from(range.getClientRects())) {
          const clipped = clip(raw, node.parentElement, null);
          const owned = clip(raw, node.parentElement, element);
          if (clipped && owned) out.push({ rect: clipped, laidOut: rect(raw), withinOwner: owned });
        }
      }
      return out;
    };

    const intersection = (a: Rect, b: Rect): Rect | null => {
      const left = Math.max(a.left, b.left);
      const right = Math.min(a.right, b.right);
      const top = Math.max(a.top, b.top);
      const bottom = Math.min(a.bottom, b.bottom);
      // Half a pixel of tolerance on each axis: sub-pixel layout puts adjacent
      // boxes within a rounding error of each other, and a repair is not
      // measured in tenths.
      if (right - left <= 0.5 || bottom - top <= 0.5) return null;
      return rect({ top, bottom, left, right });
    };

    const outsideArea = (inner: Rect, outer: Rect): number => {
      const inside = intersection(inner, outer);
      const area = inner.width * inner.height;
      return area - (inside ? inside.width * inside.height : 0);
    };

    const floor = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--truncating-run-min-width'));
    const rows = Array.from((root as Element).querySelectorAll('.ui-truncating-row'));

    return rows.map((row) => {
      const run = row.querySelector(':scope > .ui-truncating-run');
      const metas = Array.from(row.querySelectorAll(':scope > .ui-truncating-meta'));
      // The run's own lines, never the trailing group's: a trailing `MetaCell`
      // carries the same class, and stretching it would be the instrument
      // manufacturing the collision it is looking for.
      const lines = Array.from((run ?? row).querySelectorAll('.ui-truncating-line'));

      // The synthetic identifier, written and taken back out inside this one
      // evaluation. `getBoundingClientRect` forces the layout, so everything
      // below is measured against the injected text. The row's own text is read
      // first: a caller matching its fixture's row must find it under the
      // injected identifier as well as without it.
      const original = lines.map((line) => line.textContent);
      const label = (original[0] ?? row.textContent ?? '').trim().slice(0, 48);
      const rowText = (row.textContent ?? '').trim().slice(0, 120);
      if (injected !== null) for (const line of lines) line.textContent = injected;

      const runBox = run ? rect(run.getBoundingClientRect()) : null;
      const rowBox = rect(row.getBoundingClientRect());
      const rowStyle = getComputedStyle(row);
      const rowContentWidth = row.clientWidth - Number.parseFloat(rowStyle.paddingLeft) - Number.parseFloat(rowStyle.paddingRight);
      const metaBoxes = metas.map((meta) => rect(meta.getBoundingClientRect()));
      const runInk = ink(run);
      const metaInk = metas.map((meta) => ink(meta));
      const overlaps: { meta: number; rect: Rect; area: number }[] = [];
      const boxOverlaps: { meta: number; rect: Rect; area: number }[] = [];
      metaBoxes.forEach((metaBox, index) => {
        for (const piece of runInk) {
          const hit = intersection(piece.rect, metaBox);
          if (hit) overlaps.push({ meta: index, rect: hit, area: hit.width * hit.height });
        }
        if (runBox) {
          const hit = intersection(runBox, metaBox);
          if (hit) boxOverlaps.push({ meta: index, rect: hit, area: hit.width * hit.height });
        }
      });
      const runInkOutsideRun = runBox ? runInk.reduce((total, piece) => total + outsideArea(piece.rect, runBox), 0) : 0;
      const runIsTruncating = lines.some((line) => line.scrollWidth > line.clientWidth + 1);
      const runLineTitles = lines.map((line) => line.getAttribute('title'));
      const runLineUserSelect = lines.map((line) => getComputedStyle(line).userSelect);

      if (injected !== null) lines.forEach((line, index) => (line.textContent = original[index]));

      return {
        label,
        rowText,
        kind: row.classList.contains('ui-card-list__item') ? 'card' : row.classList.contains('ui-storage-usage-row') ? 'storage' : 'other',
        rowBox,
        rowContentWidth,
        runBox,
        runInk,
        runInkOutsideRun,
        metaBoxes,
        metaInk,
        overlaps,
        boxOverlaps,
        trailingOnItsOwnLine: runBox !== null && metaBoxes.length > 0 && metaBoxes.every((meta) => meta.top >= runBox.bottom - 0.5),
        floor,
        runIsTruncating,
        runLineTitles,
        runLineUserSelect,
      };
    });
  }, options.inject ?? null)) as TruncatingRowGeometry[];
}

/**
 * Ink a trailing value loses **inside its own group**, in px of width: the
 * trailing metadata being squeezed instead of kept at its natural width, which
 * is the half REQ-19 puts on the contract.
 */
export function metaInkSqueezed(geometry: TruncatingRowGeometry): number {
  return geometry.metaInk.flat().reduce((total, piece) => total + Math.max(0, piece.laidOut.width - piece.withinOwner.width), 0);
}

/**
 * Ink a trailing value loses **to the box the row was put in**, in px of width:
 * the row itself is at its natural width and the card holding it is narrower
 * than that. Nothing inside the library can repair it — it is the fixed `Grid`
 * template of the call site — so it is measured and reported rather than being
 * added to the figure above.
 */
export function metaInkClippedByTheCard(geometry: TruncatingRowGeometry): number {
  return geometry.metaInk.flat().reduce((total, piece) => total + Math.max(0, piece.withinOwner.width - piece.rect.width), 0);
}

/**
 * The contract, as one set of assertions (`ui-library/specs/truncation-contract.md`):
 *
 * - the run's painted box and the trailing group's box never intersect;
 * - the run never inks outside its own box;
 * - the trailing group keeps its width and loses no ink;
 * - the run never resolves narrower than the floor, nor than the row when the
 *   row itself is narrower than the floor.
 */
export function expectRowHonoursTheContract(geometry: TruncatingRowGeometry, evidence: string): void {
  expect(
    geometry.overlaps.map((overlap) => `${round(overlap.area)}px² over trailing element ${overlap.meta} at ${describeRect(overlap.rect)}`),
    `${evidence} — the run's painted ink lands on the trailing metadata (REQ-18)`,
  ).toEqual([]);

  expect(
    geometry.boxOverlaps.map((overlap) => `${round(overlap.area)}px² over trailing element ${overlap.meta} at ${describeRect(overlap.rect)}`),
    `${evidence} — the run's box intersects the trailing metadata's (REQ-18)`,
  ).toEqual([]);

  expect(
    round(geometry.runInkOutsideRun),
    `${evidence} — ${round(geometry.runInkOutsideRun)}px² of the run's ink is painted outside the run's own box ${geometry.runBox ? describeRect(geometry.runBox) : '(no run)'} (REQ-18)`,
  ).toBeLessThanOrEqual(1);

  expect(
    round(metaInkSqueezed(geometry)),
    `${evidence} — the trailing metadata loses ${round(metaInkSqueezed(geometry))}px of ink inside its own group, so it has been squeezed rather than kept at its natural width (REQ-19)`,
  ).toBeLessThanOrEqual(1);

  if (geometry.runBox) {
    // "It never resolves narrower than `--truncating-run-min-width`, nor wider
    // than the row itself — on a row narrower than the floor the run takes the
    // row's whole width" (truncation-contract.md). The row's *content* width is
    // what it can offer: a card's own padding is not the run's to take.
    const expected = Math.min(geometry.floor, geometry.rowContentWidth);
    expect(
      geometry.runBox.width,
      `${evidence} — the run resolves to ${round(geometry.runBox.width)}px in a row offering ${round(geometry.rowContentWidth)}px, below the floor of ${geometry.floor}px the contract puts under it (REQ-19)`,
    ).toBeGreaterThanOrEqual(expected - 1);
  }
}

/** One row, as a line of evidence: the numbers are the report (REQ-42 of the plan this suite's style comes from). */
export function reportRow(prefix: string, geometry: TruncatingRowGeometry): string {
  return [
    `${prefix} ${geometry.kind} row "${geometry.label}"`,
    `row ${describeRect(geometry.rowBox)}`,
    `run ${geometry.runBox ? describeRect(geometry.runBox) : 'none'}`,
    `trailing [${geometry.metaBoxes.map(describeRect).join(' | ')}]`,
    `ink over trailing ${round(geometry.overlaps.reduce((total, overlap) => total + overlap.area, 0))}px²`,
    `trailing squeezed ${round(metaInkSqueezed(geometry))}px`,
    `trailing clipped by the card ${round(metaInkClippedByTheCard(geometry))}px`,
    geometry.trailingOnItsOwnLine ? 'trailing on its own line' : 'trailing beside the run',
    geometry.runIsTruncating ? 'run truncating' : 'run whole',
  ].join(' — ');
}
