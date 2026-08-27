/**
 * Measuring a **field list** — the reading shape the container detail's Config tab gives its
 * environment variables, its port mappings and its mounts
 * (`ui-library/specs/field-list.md`, `…-tabs_composition_refactor/REQ-54` … REQ-57).
 *
 * `property-bands.ts` measures a `DefinitionList`: a band with a label track and a value track.
 * A field list is a different shape — an entry holding one box per part, each with its own caption
 * and its own value — and the questions asked of it are about **where a field begins and how much
 * of its entry it takes**, which the band reader has no notion of. So it is a reader of its own
 * rather than a widened one.
 *
 * Everything here is geometry the browser reports. What each field *says* is read beside it, never
 * instead of it (CLAUDE.md, "What a check drives, and what it measures").
 */
import { expect, type Locator } from '@playwright/test';
import { readOnceSettled } from './settled.js';

export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface FieldGeometry {
  /** What the field is called, or the empty string where the value names itself. */
  caption: string;
  /** What the field reads, chips included. */
  text: string;
  /** The chips the value carries, in order. */
  chips: string[];
  box: Rect;
  /** The box of the value itself: where a value *begins* is a claim about this one (REQ-54). */
  valueBox: Rect | null;
  /**
   * The field's own leading padding. "A value begins where its own field begins" is a claim about
   * the field's **content** edge, and the field carries the property band's delivered padding
   * (`field-list.md`), so the padding is read here rather than assumed to be zero or guessed at.
   */
  paddingLeft: number;
  /** The number of line boxes the value's own text is drawn over — distinct top edges. */
  valueLines: number;
  /** The width the value's text occupies, summed over the lines it is drawn on. */
  valueInk: number;
  /** The field's share of its entry, as a fraction (REQ-57's cap is a share). */
  shareOfEntry: number;
}

export interface EntryGeometry {
  box: Rect;
  fields: FieldGeometry[];
}

export interface FieldListGeometry {
  box: Rect;
  entries: EntryGeometry[];
  /** The top edge of each line, in order — what the entries-per-line count is deduced from. */
  lineTops: number[];
  /** Entries on the first line: how many the list flows per line at this width. */
  perLine: number;
  lines: number;
}

/** Entries within this many pixels of each other's top edge are on one line. */
const LINE_TOLERANCE_PX = 1;

/** Reads a field list once the layout has stopped moving. */
export async function measureFieldList(list: Locator, name: string): Promise<FieldListGeometry> {
  return await readOnceSettled(
    list.page(),
    () => measureFieldListThisFrame(list, name),
    (previous, current) => JSON.stringify(previous) === JSON.stringify(current),
  );
}

export async function measureFieldListThisFrame(list: Locator, name: string): Promise<FieldListGeometry> {
  await expect(list, `${name} is not on screen, so nothing about its arrangement can be measured`).toBeVisible();
  const geometry = await list.evaluate((element, tolerance) => {
    const rect = (target: Element): Rect => {
      const box = target.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height };
    };

    // The line boxes a text is drawn over and the ink it occupies across them: the only way to ask,
    // of a text that has already wrapped, how wide it would have been on one line.
    const textRects = (target: Element | null) => {
      if (!target) return [] as DOMRect[];
      const range = document.createRange();
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      const rects: DOMRect[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.nodeValue?.trim()) continue;
        range.selectNodeContents(node);
        rects.push(...Array.from(range.getClientRects()));
      }
      return rects;
    };

    const entries = Array.from(element.querySelectorAll('.ui-field-list__entry')).map((entry) => {
      const entryBox = rect(entry);
      return {
        box: entryBox,
        fields: Array.from(entry.querySelectorAll('.ui-field-list__field')).map((field) => {
          const valueElement = field.querySelector('.ui-field-list__value');
          const valueRects = textRects(valueElement);
          return {
            paddingLeft: Number.parseFloat(getComputedStyle(field).paddingLeft) || 0,
            caption: field.querySelector('.ui-field-list__caption')?.textContent ?? '',
            text: valueElement?.textContent ?? '',
            chips: Array.from(field.querySelectorAll('.ui-chip')).map((chip) => chip.textContent ?? ''),
            box: rect(field),
            valueBox: valueElement ? rect(valueElement) : null,
            valueLines: Math.max(1, new Set(valueRects.map((line) => Math.round(line.top))).size),
            valueInk: valueRects.reduce((total, line) => total + line.width, 0),
            shareOfEntry: entryBox.width === 0 ? Number.NaN : rect(field).width / entryBox.width,
          };
        }),
      };
    });

    const lineTops: number[] = [];
    for (const entry of entries) {
      if (!lineTops.some((top) => Math.abs(top - entry.box.top) <= tolerance)) lineTops.push(entry.box.top);
    }
    lineTops.sort((a, b) => a - b);

    return {
      box: rect(element),
      entries,
      lineTops,
      perLine: entries.filter((entry) => Math.abs(entry.box.top - (lineTops[0] ?? 0)) <= tolerance).length,
      lines: lineTops.length,
    };
  }, LINE_TOLERANCE_PX);

  expect(geometry.entries.length, `${name} draws no entry at all, so it is present and empty — which the arrangement can never be`).toBeGreaterThan(0);
  return geometry as FieldListGeometry;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** One line of evidence for a failure message: the list's box and every entry's fields. */
export function reportFieldList(label: string, geometry: FieldListGeometry): string {
  const entries = geometry.entries
    .map(
      (entry) =>
        `[${round(entry.box.left)}…${round(entry.box.right)}] ` +
        entry.fields.map((field) => `${field.caption || '·'} ${round(field.box.left)}…${round(field.box.right)} (${Math.round(field.shareOfEntry * 100)}%, ${field.valueLines}L)`).join(' | '),
    )
    .join(' / ');
  return `${label}: ${round(geometry.box.width)}px wide, ${geometry.entries.length} entr(ies) over ${geometry.lines} line(s), ${geometry.perLine} per line — ${entries}`;
}

/** The widest share any field of the list takes of its own entry (REQ-57). */
export function widestShare(geometry: FieldListGeometry): { share: number; caption: string; text: string } {
  let widest = { share: 0, caption: '', text: '' };
  for (const entry of geometry.entries) {
    for (const field of entry.fields) {
      if (field.shareOfEntry > widest.share) widest = { share: field.shareOfEntry, caption: field.caption, text: field.text };
    }
  }
  return widest;
}
