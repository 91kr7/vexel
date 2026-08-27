import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { readOnceSettled } from './support/settled.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';

/**
 * **How a property band settles a shortage** — the one rule of
 * `ui-library/specs/definition-list.md` that decides what happens when a band cannot hold its label
 * and its value at once: *the value keeps a floor (`--band-value-min`), the label gives way to it and
 * no further, and a band with room for both leaves the floor slack and the label at its full width.*
 *
 * **Why this file exists, and it is not the rule being new.** Three declarations have now been
 * shipped for it in a fortnight, and each of them passed every check that existed at the time:
 *
 * - `flex: none` on the label with a whole-band bound — the label, unable to shrink, took every
 *   pixel it was allowed: at 375px a 49-character mount source took all 271px of its band and the
 *   value was laid out as a box of **0px beyond the band's own right edge**, its `ro` chip painted
 *   off the side of a viewport that could not be scrolled to it
 *   (`…-tabs_composition_refactor/REQ-40`).
 * - A **half-band cap** on the label — which closed that and broke the opposite case in the same
 *   stroke: the About screen's `Oldest Engine API the daemon accepts`, 199px of label in a band
 *   offering 375px, wrapped by a 187.5px cap on a band that was never in trouble
 *   (`plan-docker_management_app-detail_property_columns/REQ-26`).
 * - A **shrink factor** on the label (`flex: 0 1 auto`) — which let flexbox settle the shortage
 *   proportionally: the image panel's `Tags`, 26.7px of ink, was drawn 12.5px wide over **four line
 *   boxes**, one character per line, while its value held 366.3px against a 96px floor. That is
 *   verbatim the failure the rule was written against ("proportional shrinking would break `Created`
 *   at five characters to make room for a long value").
 *
 * A fourth attempt is a matter of when, not whether. Until this file existed **nothing failed on the
 * difference between the three**: the first was caught by a check written for another requirement,
 * the second by a certified check on an unrelated screen, and the third by a measurement taken by
 * hand while rewriting a guard that had gone blind — which is not a mechanism that survives the next
 * person.
 *
 * **The single property all three violate, and the current declaration satisfies**: *the label was
 * narrowed while the value stood above its floor*. Everything below is that one sentence as
 * geometry, in both directions of shortage — a value that overruns its band (the label must keep its
 * ink) and a label that overruns it (the value must keep its floor) — on two surfaces, because a
 * rule shown on one screen reads as that screen's symptom.
 *
 * The instrument is **this file's own**, deliberately: `support/property-bands.ts` measures the same
 * boxes, and a rule checked twice through one helper is checked once. Nothing here reads a class, an
 * attribute or a prop; every number is a box the browser reports (REQ-39), and content assertions
 * stand beside them and never instead of them (REQ-40). Every interaction is a real pointer at the
 * visible control's own coordinates (REQ-44). The one fixture — a tag — is this file's own and is
 * removed in a `finally` (REQ-45).
 */

/** Sub-pixel: below what any assertion here distinguishes, above the layout engine's own rounding. */
const TOLERANCE_PX = 1;

interface BandReading {
  label: string;
  /** The band's content box: what the label, the gap and the value have to share. */
  content: number;
  gap: number;
  /** `--band-value-min`, read from the document rather than repeated here as a number. */
  floor: number;
  labelWidth: number;
  valueWidth: number;
  /** The width each text would occupy on one line, summed over the lines it is drawn on. */
  labelInk: number;
  valueInk: number;
  labelLines: number;
  valueLines: number;
}

/**
 * Every band of one section, read in a single pass so that every number belongs to the same layout.
 * The **content box** is what the rule is written against — the percentage in the declaration
 * resolves against it — so it is measured from the row's own padding rather than from its border box.
 */
async function readBandsThisFrame(section: Locator): Promise<BandReading[]> {
  await expect(section, 'the section is not on screen, so nothing about its bands can be measured').toBeVisible();
  return await section.evaluate((element) => {
    const floor = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--band-value-min')) || 0;
    const ink = (target: Element | null) => {
      if (!target) return { ink: 0, lines: 1 };
      const range = document.createRange();
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      const rects: DOMRect[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.nodeValue?.trim()) continue;
        if (node.parentElement?.closest('button')) continue;
        range.selectNodeContents(node);
        rects.push(...Array.from(range.getClientRects()));
      }
      return {
        ink: rects.reduce((total, rect) => total + rect.width, 0),
        // Distinct top edges: a value may be several nodes on one line (a destination beside its
        // chip), which counting rects would call a wrap.
        lines: Math.max(1, new Set(rects.map((rect) => Math.round(rect.top))).size),
      };
    };
    return Array.from(element.children)
      .filter((row) => row.getBoundingClientRect().height > 0)
      .map((row) => {
        const style = getComputedStyle(row);
        const label = row.querySelector('.ui-definition-list__label');
        const value = row.querySelector('.ui-definition-list__value');
        const labelInk = ink(label);
        const valueInk = ink(value);
        return {
          label: label?.textContent ?? row.textContent?.slice(0, 30) ?? '(no label)',
          content: row.getBoundingClientRect().width - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
          gap: Number.parseFloat(style.columnGap === 'normal' ? style.gap : style.columnGap) || 0,
          floor,
          labelWidth: label?.getBoundingClientRect().width ?? 0,
          valueWidth: value?.getBoundingClientRect().width ?? 0,
          labelInk: labelInk.ink,
          valueInk: valueInk.ink,
          labelLines: labelInk.lines,
          valueLines: valueInk.lines,
        };
      });
  });
}

/** The same reading, once the layout has stopped moving (a viewport change is regularly a frame behind). */
async function readBands(section: Locator): Promise<BandReading[]> {
  return await readOnceSettled(
    section.page(),
    () => readBandsThisFrame(section),
    (previous, current) => JSON.stringify(previous) === JSON.stringify(current),
  );
}

/** What the rule leaves the label of a given band: the band's content less the gap and the value's floor. */
function labelBound(band: BandReading): number {
  return Math.max(band.floor, band.content - band.gap - band.floor);
}

function describe(name: string, bands: BandReading[]): string {
  return bands
    .map(
      (band) =>
        `${name}: "${band.label.trim()}" content ${band.content.toFixed(1)}px — label ${band.labelInk.toFixed(1)}px of ink in ${band.labelWidth.toFixed(
          1,
        )}px over ${band.labelLines} line(s), bound ${labelBound(band).toFixed(1)}px — value ${band.valueInk.toFixed(1)}px of ink in ${band.valueWidth.toFixed(
          1,
        )}px over ${band.valueLines} line(s), floor ${band.floor.toFixed(0)}px`,
    )
    .join('\n[label-floor] ');
}

/**
 * **The rule, as two bounds on one band.** Neither mentions what the other item holds, which is the
 * property all three failed declarations lacked: one decided the split in advance, one let the
 * value's own length reach back into the label.
 */
function breaches(band: BandReading): string[] {
  const broken: string[] = [];

  // The value is never squeezed below its floor. **A reservation against a shortage, not a
  // padding**: a value with less ink than the floor is drawn at its own width and reserves nothing
  // — `Content size` is 36px of "5.5MB" in a 394.8px band and is owed no floor at all — and a band
  // narrower than the floor itself can only give what it has.
  const kept = Math.min(band.floor, band.valueInk, band.content);
  if (band.valueWidth < kept - TOLERANCE_PX) {
    broken.push(
      `the value of "${band.label.trim()}" is drawn ${band.valueWidth.toFixed(1)}px wide for ${band.valueInk.toFixed(1)}px of ink, under the ${kept.toFixed(
        1,
      )}px it keeps in a band of ${band.content.toFixed(1)}px`,
    );
  }

  // And the label keeps its ink until the floor is what it would cost — never less, whatever the
  // value beside it holds.
  const owed = Math.min(band.labelInk, labelBound(band));
  if (band.labelWidth < owed - TOLERANCE_PX) {
    broken.push(
      `the label "${band.label.trim()}" is drawn ${band.labelWidth.toFixed(1)}px wide over ${band.labelLines} line(s), under the ${owed.toFixed(
        1,
      )}px it is owed (${band.labelInk.toFixed(1)}px of ink against a ${labelBound(band).toFixed(1)}px bound), while its value holds ${band.valueWidth.toFixed(
        1,
      )}px against a ${band.floor.toFixed(0)}px floor`,
    );
  }
  return broken;
}

function expectTheLabelYieldsOnlyToTheValuesFloor(bands: BandReading[], evidence: string): void {
  expect(bands.length, `${evidence} — no band was read at all, so nothing below would certify anything`).toBeGreaterThan(0);
  expect(bands.flatMap(breaches), `${evidence} — the shortage was not settled the way the rule settles it`).toEqual([]);
}

/**
 * The three declarations this rule has shipped under, reinstated in the page's own cascade — same
 * selectors, later in document order — so that **the check can be shown red on each of them** rather
 * than merely asserted to be. Nothing in the repository is touched: the styles are added to the
 * loaded document and removed again.
 */
const SHIPPED_DECLARATIONS = {
  'whole-band bound': `.ui-content-columns > .ui-definition-list__row > .ui-definition-list__label { max-width: 100%; }
     .ui-definition-list__label { flex: none; } .ui-definition-list__value { min-width: 0; }`,
  'half-band cap': `.ui-content-columns > .ui-definition-list__row > .ui-definition-list__label { max-width: 50%; }
     .ui-definition-list__label { flex: none; } .ui-definition-list__value { min-width: 0; }`,
  'shrink factor': `.ui-content-columns > .ui-definition-list__row > .ui-definition-list__label { max-width: 100%; }
     .ui-definition-list__label { flex: 0 1 auto; } .ui-definition-list__value { min-width: min(var(--band-value-min), 100%); }`,
};

/** Reads the same section under one of those declarations, and asserts this check refuses it. */
async function expectRefused(page: Page, section: Locator, name: keyof typeof SHIPPED_DECLARATIONS, evidence: string): Promise<void> {
  const style = await page.addStyleTag({ content: SHIPPED_DECLARATIONS[name] });
  try {
    const bands = await readBands(section);
    const broken = bands.flatMap(breaches);
    console.log(`[label-floor] under the ${name}: ${broken.join(' / ') || 'nothing broken'}`);
    expect(
      broken,
      `${evidence} — the ${name} declaration, which shipped and was withdrawn, satisfies this check: it does not tell the shipped declarations apart and would pass the next one too`,
    ).not.toEqual([]);
  } finally {
    await style.evaluate((node: Element) => node.remove());
  }
}

/** The premise of the first direction: some value genuinely does not fit on one line of its band. */
function expectAValueOverrunsItsBand(bands: BandReading[], evidence: string): void {
  const overrunning = bands.filter((band) => band.valueInk > band.valueWidth + TOLERANCE_PX);
  expect(
    overrunning.map((band) => band.label.trim()),
    `${evidence} — no value overruns its band here, so there is no shortage to settle and this check would certify nothing`,
  ).not.toEqual([]);
}

/** The premise of the second: some label is longer than what the rule leaves it. */
function expectALabelOverrunsItsBound(bands: BandReading[], evidence: string): void {
  const overrunning = bands.filter((band) => band.labelInk > labelBound(band) + TOLERANCE_PX);
  expect(
    overrunning.map((band) => band.label.trim()),
    `${evidence} — no label is longer than the bound the rule leaves it, so nothing here has to give way and this check would certify nothing`,
  ).not.toEqual([]);
}

/** The image panel's own property section — the surface where the value is the one that overruns. */
function imageProperties(page: Page): Locator {
  return page.locator('.ui-detail-panel .ui-definition-list').first();
}

async function openImagePanel(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await page.setViewportSize(viewport);
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
  // The operator's own daemon holds images of their own: the row is searched for, never assumed to
  // be the first one.
  await page.getByPlaceholder('Search reference or digest…').fill(ALPINE_IMAGE);
  const row = page.locator('.ui-data-table__row', { hasText: ALPINE_IMAGE }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator('.ui-data-table__cell').first().click();
  await expect(imageProperties(page)).toBeVisible({ timeout: 20_000 });
}

/**
 * The coverage baseline's own property list — the surface where the label is the one that overruns.
 * Located through the card its heading titles, so a second list added to the screen cannot answer
 * for it.
 */
function coverageBaseline(page: Page): Locator {
  return page
    .locator('.ui-surface')
    .filter({ has: page.locator('.ui-section-header__title', { hasText: /^Coverage baseline$/ }) })
    .first()
    .locator('.ui-definition-list')
    .first();
}

// (1) The value is the one that overruns — the `Tags` case. The label must be drawn at its full ink,
// on one line, however long the value beside it is: 741.7px of tag in a 366.3px box is the value's
// business and none of the label's.
test('a value that overruns its band leaves its label at full ink, at two band widths', async ({ page }) => {
  await ensureImage(ALPINE_IMAGE);
  const longTag = `vexel-e2e-label-floor-a-reference-long-enough-to-overrun-any-band-it-is-drawn-in-${Date.now()}:v1`;
  await execFileAsync('docker', ['tag', ALPINE_IMAGE, longTag]);
  try {
    // Two widths, and the point is that the bound is not one number: it is recomputed per band from
    // the band's own content box, so a declaration that decided the split in advance fails at one of
    // the two even if it happens to look right at the other.
    for (const viewport of [
      { width: 2560, height: 1440 },
      { width: 1280, height: 800 },
    ]) {
      await openImagePanel(page, viewport);
      const bands = await readBands(imageProperties(page));
      const evidence = `the image panel at ${viewport.width}×${viewport.height}`;
      console.log(`[label-floor] ${describe(evidence, bands)}`);

      expectAValueOverrunsItsBand(bands, evidence);
      expectTheLabelYieldsOnlyToTheValuesFloor(bands, evidence);

      // Beside the geometry, never instead of it: the value that caused the shortage is present in
      // full, wrapped rather than shortened.
      await expect(imageProperties(page)).toContainText(longTag.split(':')[0]!);

      // And the check is shown red on the declaration this surface was lost to: `Tags` broken one
      // character per line. The other two shipped shapes are refused on the band of test (2), where
      // it is the label that overruns — each is shown on the surface it actually failed.
      await expectRefused(page, imageProperties(page), 'shrink factor', evidence);
    }
  } finally {
    await execFileAsync('docker', ['rmi', '-f', longTag]).catch(() => undefined);
  }
});

// (2) The other direction, on another surface: the label is what overruns, and here the value's floor
// is what has to hold. This is the shape the first declaration lost — value box 0px, chip off the
// side of the viewport — and it is a phone-width band, where the shortage is real rather than
// contrived.
//
// **The surface moved, and the measurement did not.** This leg read the container detail's `Mounts`
// group, whose long bind sources were its labels; that group stopped being a definition list in
// `…-tabs_composition_refactor/REQ-54` … REQ-56 and is a `FieldList` of `Source` / `Destination`
// fields, so the container detail no longer draws a band whose **label** overruns at all — measured
// at 375×812, its longest label ("Restart policy") sits well inside the bound. The band the check
// needs is the one this file's own header names as the case the half-band cap broke: the coverage
// baseline's `Oldest Engine API the daemon accepts`, 205px of label against a 133px bound at this
// width. Same list component, same selectors, same two bounds asserted, same two declarations shown
// red — and no fixture, since the screen reads the baseline it already holds.
test('a label that overruns its bound gives way to the value’s floor and no further, at 375 × 812', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openApp(page, 'coverage-matrix');
  // The screen the coverage matrix lives on is titled `About` (shell/navigation.ts keeps the id).
  await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible({ timeout: 20_000 });
  await expect(coverageBaseline(page), 'the coverage baseline list is not on screen').toBeVisible({ timeout: 30_000 });

  const bands = await readBands(coverageBaseline(page));
  const evidence = 'the coverage baseline section at 375 × 812';
  console.log(`[label-floor] ${describe(evidence, bands)}`);

  expectALabelOverrunsItsBound(bands, evidence);
  expectTheLabelYieldsOnlyToTheValuesFloor(bands, evidence);

  // Red on both declarations this band was lost to: the whole-band bound that left the value 0px
  // beyond the band's own right edge, and the half-band cap that took the label below what the
  // rule leaves it.
  await expectRefused(page, coverageBaseline(page), 'whole-band bound', evidence);
  await expectRefused(page, coverageBaseline(page), 'half-band cap', evidence);

  // Beside the geometry: the label that gave way gave way in **width**, not in characters — it is
  // wrapped, whole and unellipsised.
  const labels = await coverageBaseline(page)
    .locator('.ui-definition-list__label')
    .evaluateAll((elements) =>
      elements.map((label) => ({ text: label.textContent ?? '', textOverflow: getComputedStyle(label).textOverflow, hidden: label.scrollWidth - label.clientWidth })),
    );
  for (const label of labels) {
    expect(label.textOverflow, `the label "${label.text}" is ellipsised rather than wrapped`).not.toBe('ellipsis');
    expect(label.hidden, `${label.hidden}px of the label "${label.text}" is hidden outside its own box`).toBeLessThanOrEqual(TOLERANCE_PX);
  }
  expect(
    labels.map((label) => label.text),
    'the label gave way in characters rather than in width',
  ).toContain('Oldest Engine API the daemon accepts');
});
