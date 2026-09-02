/**
 * The programme's closing check: **one answer to each of the five questions,
 * counted over the shipped screens** (`plan-ui-coherence-optimisation/REQ-81`),
 * and the evidence that a screen not yet written has no design decision left to
 * make (`REQ-92`).
 *
 * REQ-81 is explicit that this is **counted at the end of the programme, not
 * asserted per screen**, so the shape of the check follows: all thirteen
 * screens are walked at 1440×1000, 1280×800 and 375×812, and what is counted is
 * what each one draws — one way an object is listed, one way detail is
 * revealed, one place actions live, one empty-state treatment, one
 * section-header treatment.
 *
 * **A treatment is what the browser resolves, not what a class is called.** Two
 * headings drawn from two rules that happen to agree are one treatment; two
 * drawn from one component that disagree are two. So the section-header and
 * empty-state counts are taken from computed style — font, size, weight,
 * letter-spacing, case and colour — and the structural counts from the elements
 * actually painted. A screen that hand-built a list would appear here as a
 * second answer whatever it called it.
 *
 * Nothing here creates a fixture: the screens are read as the operator's own
 * daemon fills them, and no assertion is made on a total, on a count of rows or
 * on a list being empty. What is counted is the number of *kinds of answer*,
 * which is a property of the product and not of the daemon.
 */
import { expect, test, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/** The three viewports the plan is written against. */
const VIEWPORTS = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
];

/** The twelve screens of the shell, by the id the preference holds and the heading each draws. */
const SCREENS: { id: string; heading: string }[] = [
  { id: 'dashboard', heading: 'Dashboard' },
  { id: 'containers', heading: 'Containers' },
  { id: 'compose', heading: 'Compose' },
  { id: 'images-layers', heading: 'Images & layers' },
  { id: 'volumes-networks', heading: 'Volumes & networks' },
  { id: 'registries', heading: 'Registries' },
  { id: 'builders-cache', heading: 'Builders & cache' },
  { id: 'contexts', heading: 'Contexts' },
  { id: 'plugins', heading: 'Plugins' },
  { id: 'system-prune', heading: 'System & prune' },
  { id: 'raw-console', heading: 'Raw console' },
  { id: 'coverage-matrix', heading: 'About' },
];

/**
 * The arrangements the migrations replaced, by the class each painted.
 *
 * Named rather than assumed absent: "no second list paradigm survives, anywhere"
 * (REQ-82) is only checkable by naming the ones that used to.
 */
const REPLACED_ARRANGEMENTS = ['.ui-card-list', '.ui-grouped-rows-panel', '.ui-quad-panel-layout'];

interface ScreenReading {
  /** The one list paradigm, and anything that answers the same question a second way. */
  objectLists: number;
  replacedArrangements: { selector: string; count: number }[];
  /**
   * **One presentation as well as one primitive**
   * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-1`, `REQ-28`,
   * batch 5).
   *
   * Counting one primitive was never enough, and this plan is the proof: every list on the build
   * the human rejected was already `DataTable`, and half of them were still stacks of cards. So
   * beside the count of components goes a count of **presentations** — one signature per list on
   * the screen, read as boxes rather than as a class name, since the class that used to say it has
   * been deleted (REQ-22) and a name is not what an operator sees.
   *
   * The signature is the retired presentation's own three traits, and nothing else: a row drawn on
   * a surface of its own, a corner on that row, a gap to the next one. Nothing about height,
   * alignment or nesting is in it, deliberately — a reference table with wrapping cells and a list
   * nested inside a row are legitimately different in those and are the same presentation.
   */
  listPresentations: string[];
  /** How many rows the signatures above were read from: a screen whose lists are empty settles nothing. */
  rowsRead: number;
  /** The one detail reveal, and the one place actions live. */
  detailPanels: number;
  toolbars: number;
  /** Every distinct section-heading treatment the screen paints, and every heading not stated by the primitive. */
  headingTreatments: string[];
  headingsOutsideThePrimitive: string[];
  /** Every distinct empty-state treatment, and any empty result stated as bare text instead. */
  emptyStates: number;
  emptyStateTreatments: string[];
  /** A card that titles itself, which is the second answer REQ-81 closes. */
  cardTitles: number;
  /** A field group drawn as a box, on any dialog the screen has open — none of them should have one. */
  formSectionsPaintingABox: number;
}

async function readScreen(page: Page, replaced: string[]): Promise<ScreenReading> {
  return await page.evaluate((replacedSelectors) => {
    const content = document.querySelector('.ui-frame__content')!;
    const treatmentOf = (element: Element): string => {
      const style = getComputedStyle(element);
      const own = (element.textContent ?? '').trim();
      const rendered = style.textTransform === 'uppercase' ? own.toUpperCase() : own;
      return [
        style.fontFamily,
        style.fontSize,
        style.fontWeight,
        style.letterSpacing,
        style.textTransform,
        style.color,
        /[a-z]/.test(rendered) ? 'mixed case' : 'upper case',
      ].join(' | ');
    };
    const opaque = (colour: string) => colour !== 'transparent' && !/rgba\([^)]*,\s*0\s*\)$/.test(colour);

    // Every heading the screen paints, and where it comes from.
    //
    // Two are exempt, and neither is a section heading: the screen's own `h1`, which is the page
    // header's title, and a **dialog's own title** (`form-sheet.md`, `modal.md`) — a surface names
    // itself, which is a different question from how a section inside it is headed. Everything else
    // must be the one primitive.
    const headings = [...content.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(
      (heading) =>
        heading.closest('.ui-page-header') === null &&
        !heading.matches('.ui-form-sheet__title, .ui-modal__title'),
    );

    // The presentation each list on this screen is drawn in, as boxes.
    const presentations: string[] = [];
    let rowsRead = 0;
    const largestRadius = (element: Element): number => {
      const style = getComputedStyle(element);
      return Math.max(
        Number.parseFloat(style.borderTopLeftRadius) || 0,
        Number.parseFloat(style.borderTopRightRadius) || 0,
        Number.parseFloat(style.borderBottomLeftRadius) || 0,
        Number.parseFloat(style.borderBottomRightRadius) || 0,
      );
    };
    for (const table of content.querySelectorAll<HTMLElement>('.ui-data-table')) {
      // A list's own rows and its own content wrappers, never those of a list drawn inside one of
      // them: a nested list is measured as the list it is, in its own turn of this loop.
      const blocks = [...table.querySelectorAll<HTMLElement>('.ui-data-table__row, .ui-data-table__row-content')].filter(
        (block) => block.closest('.ui-data-table') === table,
      );
      const rows = blocks.filter((block) => block.matches('.ui-data-table__row'));
      if (rows.length === 0) continue;
      rowsRead += rows.length;

      // The carrier the retired presentation wrapped each row in: read upward from the row, so a
      // surface inside a *cell* is not mistaken for the row being drawn on one.
      let onASurface = false;
      let radius = 0;
      for (const row of rows) {
        radius = Math.max(radius, largestRadius(row));
        if (row.matches('.ui-surface')) onASurface = true;
        for (let node = row.parentElement; node !== null && node !== table; node = node.parentElement) {
          if (node.matches('.ui-surface')) {
            onASurface = true;
            radius = Math.max(radius, largestRadius(node));
          }
        }
      }
      let gap = 0;
      for (let index = 0; index + 1 < blocks.length; index += 1) {
        gap = Math.max(gap, blocks[index + 1]!.getBoundingClientRect().top - blocks[index]!.getBoundingClientRect().bottom);
      }
      presentations.push(
        `row on a surface of its own: ${onASurface ? 'yes' : 'no'} | largest row corner: ${Math.round(radius)}px | largest inter-row gap: ${Math.round(gap)}px`,
      );
    }

    return {
      objectLists: content.querySelectorAll('.ui-data-table').length,
      replacedArrangements: replacedSelectors
        .map((selector) => ({ selector, count: content.querySelectorAll(selector).length }))
        .filter((entry) => entry.count > 0),
      listPresentations: presentations,
      rowsRead,
      detailPanels: content.querySelectorAll('.ui-detail-panel').length,
      toolbars: content.querySelectorAll('.ui-screen-toolbar').length,
      headingTreatments: [
        ...new Set([...content.querySelectorAll('.ui-section-header__title')].map(treatmentOf)),
      ],
      headingsOutsideThePrimitive: headings
        .filter((heading) => heading.closest('.ui-section-header') === null)
        .map((heading) => `<${heading.tagName.toLowerCase()}> "${(heading.textContent ?? '').trim().slice(0, 40)}"`),
      emptyStates: content.querySelectorAll('.ui-empty-state').length,
      emptyStateTreatments: [
        ...new Set([...content.querySelectorAll('.ui-empty-state__title')].map(treatmentOf)),
      ],
      cardTitles: content.querySelectorAll('.ui-card__title').length,
      formSectionsPaintingABox: [...document.querySelectorAll('.ui-form-section')].filter((group) => {
        const style = getComputedStyle(group);
        return (
          opaque(style.backgroundColor) ||
          (Number.parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none' && opaque(style.borderTopColor))
        );
      }).length,
    };
  }, replaced);
}

async function openScreen(page: Page, screen: { id: string; heading: string }): Promise<void> {
  await openApp(page, screen.id);
  await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible({ timeout: 20_000 });
  // The screens fill from the daemon; a reading taken the instant the heading
  // appears would count the harness's timing rather than the product's answers.
  await page.waitForTimeout(1_200);
}

for (const viewport of VIEWPORTS) {
  const at = `${viewport.width}×${viewport.height}`;

  // REQ-81 — "The five questions have exactly one answer each across the whole product … Counted
  // over the shipped screens at the end of the programme, not asserted per screen."
  // REQ-82 — "No second list paradigm survives, anywhere."
  test(`the thirteen screens answer each of the five questions once, at ${at}`, async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize(viewport);

    const headingTreatments = new Set<string>();
    const emptyStateTreatments = new Set<string>();
    const presentations = new Map<string, string[]>();
    const secondAnswers: string[] = [];
    const handBuiltHeadings: string[] = [];
    let rowsRead = 0;
    let screensListingObjects = 0;
    let screensRevealingDetail = 0;
    let screensWithAToolbar = 0;
    let screensWithAnEmptyState = 0;

    for (const screen of SCREENS) {
      await openScreen(page, screen);
      const reading = await readScreen(page, REPLACED_ARRANGEMENTS);

      console.log(
        `[REQ-81] ${at} ${screen.heading}: ${reading.objectLists} object list(s), ${reading.detailPanels} detail panel(s), ` +
          `${reading.toolbars} toolbar(s), ${reading.emptyStates} empty state(s), ` +
          `${reading.headingTreatments.length} section-heading treatment(s), ${reading.cardTitles} card title(s)`,
      );

      if (reading.listPresentations.length > 0) {
        console.log(
          `[b5/REQ-1] ${at} ${screen.heading}: ${reading.listPresentations.length} list(s) over ${reading.rowsRead} row(s) — ${[
            ...new Set(reading.listPresentations),
          ].join(' ;; ')}`,
        );
      }
      rowsRead += reading.rowsRead;
      for (const presentation of reading.listPresentations) {
        presentations.set(presentation, [...(presentations.get(presentation) ?? []), screen.heading]);
      }

      if (reading.objectLists > 0) screensListingObjects += 1;
      if (reading.detailPanels > 0) screensRevealingDetail += 1;
      if (reading.toolbars > 0) screensWithAToolbar += 1;
      if (reading.emptyStates > 0) screensWithAnEmptyState += 1;
      for (const treatment of reading.headingTreatments) headingTreatments.add(treatment);
      for (const treatment of reading.emptyStateTreatments) emptyStateTreatments.add(treatment);
      for (const arrangement of reading.replacedArrangements) {
        secondAnswers.push(`${screen.heading}: ${arrangement.count}× ${arrangement.selector}`);
      }
      if (reading.cardTitles > 0) secondAnswers.push(`${screen.heading}: ${reading.cardTitles}× a card titling itself`);
      for (const heading of reading.headingsOutsideThePrimitive) {
        handBuiltHeadings.push(`${screen.heading}: ${heading}`);
      }
    }

    console.log(
      `[REQ-81] ${at} over ${SCREENS.length} screens: ${screensListingObjects} screen(s) list objects, ` +
        `${screensRevealingDetail} reveal detail, ${screensWithAToolbar} carry a toolbar, ${screensWithAnEmptyState} draw an empty state — ` +
        `${headingTreatments.size} section-heading treatment(s) in the product: ${[...headingTreatments].join(' ;; ')}`,
    );

    // The premise: the walk actually found the things it counts, so "one answer each" is a verdict
    // about the product rather than about a walk that measured nothing.
    expect(screensListingObjects, `${at}: not one screen listed an object, so nothing here counts a list paradigm`).toBeGreaterThan(0);
    expect(screensWithAToolbar, `${at}: not one screen carried an action bar`).toBeGreaterThan(0);
    expect(headingTreatments.size, `${at}: not one section heading was painted`).toBeGreaterThan(0);

    // One way an object is listed, and no second paradigm anywhere (REQ-82).
    expect(secondAnswers, `${at}: a screen answers one of the five questions a second way`).toEqual([]);

    /**
     * …and **one presentation** as well as one primitive
     * (`.../classic-table/REQ-1`, batch 5).
     *
     * Its own premise first: a walk that found no row read no presentation, and would report one —
     * none — and pass. That is the shape this plan has already paid three findings for.
     */
    console.log(
      `[b5/REQ-1] ${at} over ${SCREENS.length} screens: ${rowsRead} row(s) in ${presentations.size} presentation(s) — ${[
        ...presentations,
      ]
        .map(([presentation, screens]) => `${presentation} → ${[...new Set(screens)].join(', ')}`)
        .join(' ;; ')}`,
    );
    expect(rowsRead, `${at}: not one list drew a row, so "one presentation" is a verdict about nothing`).toBeGreaterThan(0);
    expect(
      [...presentations].map(([presentation, screens]) => `${presentation} → ${[...new Set(screens)].join(', ')}`),
      `${at}: the product draws its object lists in ${presentations.size} presentations`,
    ).toHaveLength(1);
    // And the one presentation is **the ruled row**, not the card: "one presentation" alone would be
    // satisfied by every list in the product being a stack of cards, which is the arrangement this
    // plan retired rather than the one it kept.
    expect(
      [...presentations.keys()][0],
      `${at}: the one presentation the product draws is not the ruled row`,
    ).toBe('row on a surface of its own: no | largest row corner: 0px | largest inter-row gap: 0px');

    // One section-header treatment. The primitive states two treatments of one header — a section's
    // own title and a column/group eyebrow (`section-header.md`) — and nothing else may state one:
    // a heading outside the primitive is a screen inventing a sixth answer.
    expect(handBuiltHeadings, `${at}: a heading is stated outside the one section-header primitive`).toEqual([]);
    expect(
      [...headingTreatments],
      `${at}: the product paints ${headingTreatments.size} section-heading treatments, where the primitive states two`,
    ).toHaveLength(2);

    // One empty-state treatment, wherever an empty result is stated.
    if (screensWithAnEmptyState > 0) {
      expect(
        [...emptyStateTreatments],
        `${at}: the product paints ${emptyStateTreatments.size} empty-state treatments`,
      ).toHaveLength(1);
    }
  });
}

// REQ-92 — "a new screen is composed from the primitives without inventing a list, a panel, an empty
// state, a section header or an action rule". The library-side evidence is in
// `test/unit/programme-constraints.test.ts` (the last migrated screens changed no library file);
// what is checked here is the same claim from the screens' side, on the last screen migrated and on
// the dialog that consumed this batch's own change without a line of its own being edited.
test('the last migrated screen and the reshaped dialog are composed from the primitives alone', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 800 });

  await openScreen(page, { id: 'system-prune', heading: 'System & prune' });
  const lastMigrated = await readScreen(page, REPLACED_ARRANGEMENTS);
  console.log(
    `[REQ-92] the last migrated screen: ${lastMigrated.objectLists} object list(s), ${lastMigrated.toolbars} toolbar(s), ` +
      `${lastMigrated.emptyStates} empty state(s), ${lastMigrated.headingTreatments.length} heading treatment(s)`,
  );
  expect(lastMigrated.headingsOutsideThePrimitive, 'the last migrated screen states a heading of its own').toEqual([]);
  expect(lastMigrated.replacedArrangements, 'the last migrated screen still draws a replaced arrangement').toEqual([]);
  expect(lastMigrated.cardTitles, 'the last migrated screen still holds a card that titles itself').toBe(0);

  // …and the dialog, on the screen that opens the longest one: no field group draws a box, on a
  // screen whose own file this batch did not touch (container-create-form.md).
  await openScreen(page, { id: 'containers', heading: 'Containers' });
  await page.getByRole('button', { name: 'Run container…' }).click();
  await expect(page.getByRole('combobox', { name: 'Image reference' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('combobox', { name: 'Image reference' }).press('Escape');
  const withADialogOpen = await readScreen(page, REPLACED_ARRANGEMENTS);

  console.log(`[REQ-92] the create/run dialog: ${withADialogOpen.formSectionsPaintingABox} field group(s) painting a box`);
  expect(
    withADialogOpen.formSectionsPaintingABox,
    'a field group of the create/run dialog still paints a box of its own (REQ-78)',
  ).toBe(0);
  expect(withADialogOpen.headingsOutsideThePrimitive, 'the dialog states a heading outside the one primitive').toEqual(
    [],
  );

  await page.locator('.ui-form-sheet').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Image reference' })).toHaveCount(0);
});
