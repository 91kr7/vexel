/**
 * F19 — a dialog is one form, not boxes inside boxes
 * (`plan-ui-coherence-optimisation/REQ-78`, `REQ-79`, `REQ-80`).
 *
 * **Every claim here is comparative, so the predecessor is served beside the
 * build under test.** "Measurably shorter", "no longer a fourth section-header
 * style", "controls that look like controls" are all statements about a
 * difference, and a build measured on its own cannot show one: a form that was
 * never shortened has a height, a label that is still a heading has a
 * treatment, and a bare text run has a computed style. So the batch's own
 * predecessor is checked out, built and served on a port of its own
 * (`support/delivered-build.ts`), and each measurement below is taken on both,
 * with the delivered reading asserted as a **premise** — the check has to fail
 * on the build before this batch, or it is not a check (REQ-90).
 *
 * **Geometry, not content** (REQ-89). The vertical extent is the sheet's own
 * scrolling body measured in pixels; the boxes are counted by what they
 * **paint** — a border, a fill, a radius — never by class name, since a class
 * renamed is not a box removed; and the add affordances are judged by their
 * computed border and fill against a bare text run of the same sheet.
 *
 * **The privileged switch is operated with a real pointer at its own visible
 * coordinates** (REQ-88), and what is asserted across the interaction is the
 * sheet's **viewport box**. That defect — bug-2, the sheet dragged 1044px above
 * the top of the viewport — shipped once and was passed over twice by coverage
 * that counted characters. `container-create-privileged.spec.ts` holds it at the
 * narrow viewport the report was made at; it is held here at 1280×800, the
 * width this batch's own measurements are taken at, because the sheet that must
 * not move is the one this batch reshaped.
 *
 * The last check is the one decision of this batch that touches a **certified
 * predecessor**: the chip's inline action was filled rather than outlined so
 * that no chip grew taller and no row that carries chips moved, which is the
 * geometry batches 6 and 7 pinned. It shares this file because it shares the
 * predecessor build, which is expensive and is started once.
 *
 * Fixtures carry the ownership labels and are removed in a `finally`; nothing
 * assumes an empty daemon; no assertion is made on a total or on a list being
 * empty; nothing reaches Docker Hub.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { startDeliveredBuild, type DeliveredBuild } from './support/delivered-build.js';
import { clickAndExpectSurfaceUnmoved } from './support/surface-stability.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';

/**
 * The build this batch was delivered on top of — batch 18, tested and certified
 * — and a port of its own, so this comparison and
 * `library-layer-screens-unmoved.spec.ts`'s (which measures batch 4's) never
 * contend for a listener.
 */
const PREDECESSOR = process.env.VEXEL_BATCH_18_REF ?? '012d976';
const PREDECESSOR_PORT = 3102;

/** The viewport REQ-78 states its claim at. */
const MEASURED_AT = { width: 1280, height: 800 };

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Treatment {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  letterSpacing: string;
  textTransform: string;
  color: string;
  /** What the browser actually paints, which is the half `text-transform` hides. */
  renderedCase: 'upper case' | 'mixed case';
}

interface Painted {
  borderWidth: number;
  borderPainted: boolean;
  fillPainted: boolean;
  radius: number;
}

interface SheetReading {
  positioner: Box;
  sheet: Box;
  /** The sheet's own maximum, as the browser resolves it: `plan-docker_management_app-dialog_sizing`. */
  maxHeight: number;
  /** The scrolling body: its content's height is what "the vertical extent of a dialog" is. */
  bodyContentHeight: number;
  bodyVisibleHeight: number;
  groups: {
    title: string;
    box: Box;
    painted: Painted;
    /** What the group costs before a single field is drawn: its own top edge to its first field's. */
    chromeBeforeTheFirstField: number;
    headingTreatment: Treatment;
  }[];
  /** Every painted box inside the dialog that is not a control: the "boxes inside boxes" count. */
  boxesInsideTheSheet: number;
  labels: { text: string; treatment: Treatment; controlNames: string[] }[];
  addAffordances: { label: string; painted: Painted; box: Box }[];
  /** A run of ordinary prose on the same sheet, for the add affordances to be told apart from. */
  proseIsPainted: Painted | null;
  /** The step between two groups, and the step between two fields of one group. */
  groupStep: number;
  fieldStep: number;
}

/**
 * Everything REQ-78, REQ-79 and REQ-80 are about, read off whichever build the
 * page is pointed at.
 *
 * Written once and run on both origins: a comparison whose two halves are
 * measured by two functions is a comparison of the two functions.
 */
async function measureCreateSheet(page: Page): Promise<SheetReading> {
  return await page.evaluate(() => {
    const box = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const opaque = (colour: string) => colour !== 'transparent' && !/rgba\([^)]*,\s*0\s*\)$/.test(colour);
    const painted = (element: Element): Painted => {
      const style = getComputedStyle(element);
      const borderWidth = Math.max(
        Number.parseFloat(style.borderTopWidth),
        Number.parseFloat(style.borderRightWidth),
        Number.parseFloat(style.borderBottomWidth),
        Number.parseFloat(style.borderLeftWidth),
      );
      return {
        borderWidth,
        borderPainted: borderWidth > 0 && style.borderTopStyle !== 'none' && opaque(style.borderTopColor),
        fillPainted: opaque(style.backgroundColor),
        radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
      };
    };
    const treatmentOf = (element: Element): Treatment => {
      const style = getComputedStyle(element);
      const own = (element.textContent ?? '').trim();
      const rendered = style.textTransform === 'uppercase' ? own.toUpperCase() : own;
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        textTransform: style.textTransform,
        color: style.color,
        renderedCase: /[a-z]/.test(rendered) ? 'mixed case' : 'upper case',
      };
    };
    /** The accessible name of a control, by the three ways a control can carry one. */
    const accessibleName = (control: Element): string => {
      const aria = control.getAttribute('aria-label');
      if (aria) return aria.trim();
      const labelledBy = control.getAttribute('aria-labelledby');
      if (labelledBy) return (document.getElementById(labelledBy)?.textContent ?? '').trim();
      const labels = (control as HTMLInputElement).labels;
      if (labels && labels.length > 0) return (labels[0]!.textContent ?? '').trim();
      const id = control.getAttribute('id');
      if (id) return (document.querySelector(`label[for="${id}"]`)?.textContent ?? '').trim();
      return '';
    };

    const positioner = document.querySelector('.ui-form-sheet__positioner')!;
    const sheet = document.querySelector('.ui-form-sheet')!;
    const body = document.querySelector('.ui-form-sheet__body')! as HTMLElement;
    const groups = [...body.querySelectorAll('.ui-form-section')];

    // The heading of a group, whichever build drew it: this batch states it
    // through the section-header primitive, the predecessor stated it itself.
    const headingOf = (group: Element) =>
      group.querySelector('.ui-section-header__title, .ui-form-section__title, h3') ?? group.firstElementChild!;
    const firstFieldOf = (group: Element) => group.querySelector('.ui-form-field');

    // A **box** is something that paints one: a fill or a border, with a radius,
    // around content — never a control, and never judged by its class name.
    // A **control's own surface is not a box of the form**: a switch's track, a
    // button's fill, a text field's outline are what makes each of them legible
    // as a control (REQ-80's own rule), and counting them would make "boxes
    // inside boxes" a count of the form's controls. What is counted is the
    // containers: something painted, with a radius, holding content of the form.
    const isAControl = (element: Element) =>
      element.matches('input, select, textarea, button, label, svg, path, [role="switch"], [role="checkbox"]') ||
      element.closest('button, label, [role="switch"], [role="checkbox"]') !== null;
    const boxesInsideTheSheet = [...positioner.querySelectorAll('*')].filter((element) => {
      if (isAControl(element)) return false;
      if (element.children.length === 0) return false;
      const paint = painted(element);
      return paint.radius > 0 && (paint.fillPainted || paint.borderPainted);
    }).length;

    const labelElements = [...body.querySelectorAll('.ui-form-field__label')];
    const addLabels = ['Add variable', 'Add port mapping'];
    const addAffordances = [...body.querySelectorAll('button')]
      .filter((button) => addLabels.includes((button.textContent ?? '').trim()))
      .map((button) => ({ label: (button.textContent ?? '').trim(), painted: painted(button), box: box(button) }));

    // The bare text run the add affordances have to be legible against: a group's
    // own description line, which both builds draw as prose.
    const prose =
      body.querySelector('.ui-section-header__description') ??
      body.querySelector('.ui-form-section__description') ??
      body.querySelector('.ui-field-message');

    // The two steps the sectioning now rests on, measured on the first group that
    // holds two fields and on the first pair of groups.
    const groupWithTwoFields = groups.find((group) => group.querySelectorAll('.ui-form-field').length >= 2);
    const twoFields = groupWithTwoFields ? [...groupWithTwoFields.querySelectorAll('.ui-form-field')] : [];
    const fieldStep =
      twoFields.length >= 2
        ? twoFields[1]!.getBoundingClientRect().top - twoFields[0]!.getBoundingClientRect().bottom
        : Number.NaN;
    const groupStep =
      groups.length >= 2
        ? groups[1]!.getBoundingClientRect().top - groups[0]!.getBoundingClientRect().bottom
        : Number.NaN;

    return {
      positioner: box(positioner),
      sheet: box(sheet),
      maxHeight: Number.parseFloat(getComputedStyle(sheet).maxHeight),
      bodyContentHeight: body.scrollHeight,
      bodyVisibleHeight: body.clientHeight,
      groups: groups.map((group) => {
        const heading = headingOf(group);
        const field = firstFieldOf(group);
        return {
          title: (heading.textContent ?? '').trim(),
          box: box(group),
          painted: painted(group),
          chromeBeforeTheFirstField: field
            ? field.getBoundingClientRect().top - group.getBoundingClientRect().top
            : Number.NaN,
          headingTreatment: treatmentOf(heading),
        };
      }),
      boxesInsideTheSheet,
      labels: labelElements.map((label) => ({
        text: (label.textContent ?? '').trim(),
        treatment: treatmentOf(label),
        controlNames: [...(label.closest('.ui-form-field')?.querySelectorAll('input, select, textarea') ?? [])].map(
          accessibleName,
        ),
      })),
      addAffordances,
      proseIsPainted: prose ? painted(prose) : null,
      groupStep,
      fieldStep,
    };
  });
}

function describeTreatment(treatment: Treatment): string {
  return [
    treatment.fontSize,
    treatment.fontWeight,
    treatment.letterSpacing,
    treatment.textTransform,
    treatment.color,
    treatment.renderedCase,
  ].join(' | ');
}

function imageField(page: Page): Locator {
  return page.getByRole('combobox', { name: 'Image reference' });
}

function formSheet(page: Page): Locator {
  return page.locator('.ui-form-sheet');
}

/** Opens the create/run form from the containers screen's own toolbar, on whichever build the page holds. */
async function openCreateForm(page: Page): Promise<void> {
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Run container…' }).click();
  await expect(imageField(page)).toBeVisible({ timeout: 20_000 });
  // The image field takes the focus when the sheet opens, so its suggestion popup
  // is showing on arrival: a transient overlay over the sheet, whose content is
  // the operator's own local images and whose box would be measured as the
  // sheet's. It is dismissed before anything is read.
  await imageField(page).press('Escape');
}

/**
 * The predecessor, built and served **once for the whole file**: it costs a
 * client build and a process, and every check below measures against the same
 * one. Removed in the `afterAll`, worktree, data directory and all.
 */
let delivered: DeliveredBuild;

test.beforeAll(async () => {
  delivered = await startDeliveredBuild({ revision: PREDECESSOR, port: PREDECESSOR_PORT });
  // The fixture image the chip-row check attaches a container from; fetched from
  // nowhere but the run's own registry.
  await ensureImage(ALPINE_IMAGE);
});

test.afterAll(async () => {
  await delivered?.stop();
});

test.describe('F19 — the create/run form against the build before this batch', () => {
  // REQ-78 — "the vertical extent of a dialog with the delivered field count is measurably shorter
  // than the delivered one at 1280×800, and the arrangement no longer reads as a stack of cards
  // inside a card"; container-create-form.md — "each of its ten groups stopped paying for a border,
  // an inset and a wash".
  test('is measurably shorter than the delivered build, and holds one box instead of eleven', async ({
    browser,
    page,
  }) => {
    test.setTimeout(300_000);
    const deliveredContext = await browser.newContext({ baseURL: delivered.origin, viewport: MEASURED_AT });
    const before = await deliveredContext.newPage();

    try {
      await page.setViewportSize(MEASURED_AT);
      await openCreateForm(before);
      const deliveredReading = await measureCreateSheet(before);
      await openCreateForm(page);
      const reading = await measureCreateSheet(page);

      console.log(
        `[REQ-78] @${MEASURED_AT.width}×${MEASURED_AT.height} the create/run sheet's content: delivered ${round(
          deliveredReading.bodyContentHeight,
        )}px over ${deliveredReading.groups.length} group(s) in ${deliveredReading.boxesInsideTheSheet} box(es) — now ${round(
          reading.bodyContentHeight,
        )}px over ${reading.groups.length} group(s) in ${reading.boxesInsideTheSheet} box(es), ${round(
          deliveredReading.bodyContentHeight - reading.bodyContentHeight,
        )}px shorter`,
      );
      for (const group of reading.groups) {
        const was = deliveredReading.groups.find((candidate) => candidate.title === group.title);
        console.log(
          `[REQ-78] group "${group.title}": chrome before its first field ${round(
            was?.chromeBeforeTheFirstField ?? Number.NaN,
          )}px → ${round(group.chromeBeforeTheFirstField)}px; box ${round(was?.box.height ?? Number.NaN)}px → ${round(
            group.box.height,
          )}px tall`,
        );
      }

      // The premise, on the build before this batch: the groups really were boxes, so what follows
      // is a statement about this change rather than about a form that never had any.
      expect(
        deliveredReading.groups.length,
        'the delivered build drew no field group at all, so this comparison measures nothing',
      ).toBeGreaterThanOrEqual(10);
      const deliveredBoxes = deliveredReading.groups.filter(
        (group) => group.painted.borderPainted || group.painted.fillPainted,
      );
      expect(
        deliveredBoxes.length,
        'the delivered build already drew its field groups without a box, so REQ-78 has nothing to repair',
      ).toBe(deliveredReading.groups.length);
      expect(
        deliveredReading.boxesInsideTheSheet,
        'the delivered sheet was already one box, so the 11 → 1 claim has nothing to be about',
      ).toBeGreaterThan(1);

      // REQ-78, first half — no field group renders as a nested card, judged by what it paints.
      const stillBoxes = reading.groups.filter((group) => group.painted.borderPainted || group.painted.fillPainted);
      expect(
        stillBoxes.map((group) => `${group.title}: border ${group.painted.borderWidth}px, filled ${group.painted.fillPainted}`),
        'a field group still paints a box of its own (REQ-78)',
      ).toEqual([]);
      expect(
        reading.boxesInsideTheSheet,
        `the sheet holds ${reading.boxesInsideTheSheet} painted box(es) where the only box in it should be the sheet (form-sheet.md)`,
      ).toBe(1);

      // REQ-78, second half — measurably shorter, for the same field count. The field count is
      // asserted alongside it: a form that lost a group would also be shorter, and would be a
      // different form (container-create-form.md, "nothing was removed from the form").
      expect(
        reading.groups.map((group) => group.title),
        'the form no longer holds the groups the delivered one did, so its height is not comparable',
      ).toEqual(deliveredReading.groups.map((group) => group.title));
      expect(
        reading.labels.map((label) => label.text),
        'the form no longer holds the fields the delivered one did',
      ).toEqual(deliveredReading.labels.map((label) => label.text));
      expect(
        reading.bodyContentHeight,
        `the sheet's content is ${round(reading.bodyContentHeight)}px against the delivered ${round(
          deliveredReading.bodyContentHeight,
        )}px, so it is not measurably shorter (REQ-78)`,
      ).toBeLessThan(deliveredReading.bodyContentHeight);

      // form-section.md — "a group is separated from the next by its heading and by a step wider
      // than the one between two fields of the same group, and by nothing else."
      console.log(
        `[REQ-78] the step between two groups ${round(reading.groupStep)}px, between two fields of one group ${round(
          reading.fieldStep,
        )}px`,
      );
      expect(
        reading.groupStep,
        `two groups are ${round(reading.groupStep)}px apart and two fields of one group ${round(
          reading.fieldStep,
        )}px, so the sectioning did not survive the loss of the boxes`,
      ).toBeGreaterThan(reading.fieldStep);
    } finally {
      await deliveredContext.close();
    }
  });

  // REQ-79 — "Dialog field labels use the one label treatment rather than a fourth section-header
  // style of their own (`IMAGE`, `ENTRYPOINT`, `COMMAND`). Every field keeps its label text, its
  // association with its input, and its validation behaviour."
  test('draws IMAGE, ENTRYPOINT and COMMAND in the one label treatment, each still naming its input', async ({
    browser,
    page,
  }) => {
    test.setTimeout(300_000);
    const deliveredContext = await browser.newContext({ baseURL: delivered.origin, viewport: MEASURED_AT });
    const before = await deliveredContext.newPage();

    try {
      await page.setViewportSize(MEASURED_AT);
      await openCreateForm(before);
      const deliveredReading = await measureCreateSheet(before);
      await openCreateForm(page);
      const reading = await measureCreateSheet(page);

      const named = ['Image', 'Entrypoint', 'Command'];
      const labelOf = (source: SheetReading, text: string) => source.labels.find((label) => label.text === text)!;
      for (const text of named) {
        console.log(
          `[REQ-79] the "${text}" label: delivered ${describeTreatment(
            labelOf(deliveredReading, text).treatment,
          )} — now ${describeTreatment(labelOf(reading, text).treatment)}`,
        );
      }
      console.log(
        `[REQ-79] the group heading beside them: delivered ${describeTreatment(
          deliveredReading.groups[0]!.headingTreatment,
        )} — now ${describeTreatment(reading.groups[0]!.headingTreatment)}`,
      );

      // The premise: the three labels really were drawn as a heading treatment of their own — the
      // upper case the analysis wrote them in.
      for (const text of named) {
        expect(
          labelOf(deliveredReading, text).treatment.renderedCase,
          `the delivered build already drew "${text}" in its own case, so REQ-79 has nothing to repair`,
        ).toBe('upper case');
      }

      // REQ-79 — one treatment for every field label of the sheet, and it is not a heading's.
      const treatments = new Set(reading.labels.map((label) => describeTreatment(label.treatment)));
      expect(
        [...treatments],
        `the sheet's field labels are drawn in ${treatments.size} treatments, where the product has one`,
      ).toHaveLength(1);
      for (const text of named) {
        const label = labelOf(reading, text);
        expect(label.treatment.textTransform, `"${text}" is still uppercased into a heading of a section that does not exist`).not.toBe(
          'uppercase',
        );
        expect(label.treatment.renderedCase, `"${text}" is still painted in upper case`).toBe('mixed case');
      }
      expect(
        describeTreatment(reading.labels[0]!.treatment),
        'a field label is drawn in the group heading’s own treatment, which is the fourth section-header style REQ-79 removes',
      ).not.toBe(describeTreatment(reading.groups[0]!.headingTreatment));

      // REQ-79 — "Every field keeps its label text, its association with its input": the label is
      // there, and every control it names carries an accessible name of its own (form-field.md).
      for (const label of reading.labels) {
        expect(label.text, 'a field lost its label text').not.toBe('');
        for (const name of label.controlNames) {
          expect(name, `a control of the "${label.text}" field carries no accessible name of its own`).not.toBe('');
        }
      }
      // …and the naming did not shrink: every control the delivered sheet named, this one names.
      expect(reading.labels.flatMap((label) => label.controlNames).filter(Boolean).sort()).toEqual(
        deliveredReading.labels.flatMap((label) => label.controlNames).filter(Boolean).sort(),
      );
    } finally {
      await deliveredContext.close();
    }
  });

  // REQ-79 — "and its validation behaviour": the half a treatment measurement cannot see. Local
  // validation is reported on the field it concerns and the submission performs no call
  // (container-create-form.md).
  test('still reports a field’s own validation on the field, and submits nothing while it is pending', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(MEASURED_AT);
    await openCreateForm(page);

    // Submitted with the image left empty: "an image reference is required", reported on that field.
    await formSheet(page).getByRole('button', { name: 'Create only', exact: true }).click();

    const imageFieldRoot = formSheet(page)
      .locator('.ui-form-field')
      .filter({ has: page.getByRole('combobox', { name: 'Image reference' }) });
    const message = imageFieldRoot.locator('.ui-field-message--danger');
    await expect(message, 'the refusal is not reported on the field it concerns (REQ-79)').toBeVisible({
      timeout: 10_000,
    });
    expect((await message.innerText()).trim(), 'the validation message says nothing').not.toBe('');
    // The sheet stayed open with everything in it: nothing was submitted.
    await expect(imageField(page), 'the sheet closed on a submission that should have performed no call').toBeVisible();

    // …and the message gives way once the field is filled and the form is submitted again — which
    // is checked without creating anything, by cancelling.
    await imageField(page).fill('vexel-test-tiny:1');
    await expect(message).toBeHidden({ timeout: 10_000 });
    await formSheet(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(imageField(page)).toHaveCount(0);
  });

  // REQ-80 — "`Add variable` and `Add port mapping` are controls that look like controls (REQ-27
  // observed here)"; key-value-editor.md — "it carries the border and the surface every other
  // button in the product carries … Bare text is never a control."
  test('draws Add variable and Add port mapping with a border and a fill a text run does not have', async ({
    browser,
    page,
  }) => {
    test.setTimeout(300_000);
    const deliveredContext = await browser.newContext({ baseURL: delivered.origin, viewport: MEASURED_AT });
    const before = await deliveredContext.newPage();

    try {
      await page.setViewportSize(MEASURED_AT);
      await openCreateForm(before);
      const deliveredReading = await measureCreateSheet(before);
      await openCreateForm(page);
      const reading = await measureCreateSheet(page);

      for (const affordance of reading.addAffordances) {
        const was = deliveredReading.addAffordances.find((candidate) => candidate.label === affordance.label);
        console.log(
          `[REQ-80] "${affordance.label}": delivered border ${was?.painted.borderWidth ?? Number.NaN}px painted=${
            was?.painted.borderPainted
          }, filled=${was?.painted.fillPainted}, ${round(was?.box.width ?? Number.NaN)}px wide — now border ${
            affordance.painted.borderWidth
          }px painted=${affordance.painted.borderPainted}, filled=${affordance.painted.fillPainted}, ${round(
            affordance.box.width,
          )}px wide`,
        );
      }

      expect(
        deliveredReading.addAffordances.map((affordance) => affordance.label).sort(),
        'the delivered sheet drew neither add affordance, so this comparison measures nothing',
      ).toEqual(['Add port mapping', 'Add variable']);
      // The premise: they really were bare text — neither a border nor a fill.
      for (const affordance of deliveredReading.addAffordances) {
        expect(
          affordance.painted.borderPainted || affordance.painted.fillPainted,
          `the delivered "${affordance.label}" already painted a control, so REQ-80 has nothing to repair`,
        ).toBe(false);
      }

      expect(
        reading.addAffordances.map((affordance) => affordance.label).sort(),
        'an add affordance is no longer drawn at all',
      ).toEqual(['Add port mapping', 'Add variable']);
      for (const affordance of reading.addAffordances) {
        expect(affordance.painted.borderPainted, `"${affordance.label}" paints no border, so it is still a word in a list`).toBe(
          true,
        );
        expect(affordance.painted.fillPainted, `"${affordance.label}" paints no surface, so it is still a word in a list`).toBe(
          true,
        );
        // …and it is sized by its own label rather than stretched across the editor it closes.
        expect(
          affordance.box.width,
          `"${affordance.label}" is ${round(affordance.box.width)}px wide of a ${round(
            reading.positioner.width,
          )}px sheet, i.e. stretched across the editor rather than sized by its own label`,
        ).toBeLessThan(reading.positioner.width / 2);
      }
      // The comparison that makes "looks like a control" mean something: a run of prose on the same
      // sheet paints neither of the two things the affordances now paint.
      expect(reading.proseIsPainted, 'the sheet drew no prose to tell a control apart from').not.toBeNull();
      expect(reading.proseIsPainted!.borderPainted).toBe(false);
      expect(reading.proseIsPainted!.fillPainted).toBe(false);

      // …and each still adds the row it adds (REQ-80).
      await page.getByRole('button', { name: 'Add variable' }).click();
      await expect(page.getByRole('textbox', { name: 'Environment Key 1', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Add port mapping' }).click();
      await expect(page.getByRole('textbox', { name: 'Container port 1', exact: true })).toBeVisible();
    } finally {
      await deliveredContext.close();
    }
  });

  // REQ-80 — "`plan-docker_management_app-dialog_sizing` … is preserved: the dialog's sizing rules
  // hold"; form-sheet.md — "same positioner width, same maximum height, same scrolling body — only
  // the content inside is shorter".
  test('keeps the sheet’s own sizing exactly as the delivered build has it', async ({ browser, page }) => {
    test.setTimeout(300_000);
    const deliveredContext = await browser.newContext({ baseURL: delivered.origin, viewport: MEASURED_AT });
    const before = await deliveredContext.newPage();

    try {
      await page.setViewportSize(MEASURED_AT);
      await openCreateForm(before);
      const deliveredReading = await measureCreateSheet(before);
      await openCreateForm(page);
      const reading = await measureCreateSheet(page);

      console.log(
        `[dialog_sizing] the positioner: delivered ${round(deliveredReading.positioner.width)}×${round(
          deliveredReading.positioner.height,
        )} at x=${round(deliveredReading.positioner.x)} — now ${round(reading.positioner.width)}×${round(
          reading.positioner.height,
        )} at x=${round(reading.positioner.x)}; the sheet: delivered ${round(deliveredReading.sheet.width)}×${round(
          deliveredReading.sheet.height,
        )}, max ${round(deliveredReading.maxHeight)}px — now ${round(reading.sheet.width)}×${round(
          reading.sheet.height,
        )}, max ${round(reading.maxHeight)}px`,
      );

      // `.ui-form-sheet__positioner { width: min(760px, 100%) }` at a 1280px viewport.
      expect(round(reading.positioner.width), 'the positioner no longer states the sheet’s width').toBe(760);
      expect(round(reading.positioner.width)).toBe(round(deliveredReading.positioner.width));
      expect(round(reading.positioner.x), 'the sheet is no longer where the delivered build put it').toBe(
        round(deliveredReading.positioner.x),
      );
      // `.ui-form-sheet { max-height: calc(100vh - var(--space-10)) }`, unchanged.
      expect(round(reading.maxHeight), 'the sheet’s maximum height changed').toBe(round(deliveredReading.maxHeight));
      expect(reading.maxHeight, 'the sheet’s maximum is not derived from the viewport at all').toBeLessThan(
        MEASURED_AT.height,
      );
      // The sheet fills the glass card the positioner sizes, and the 2px between the two are the
      // glass's own hairline on each side — the arrangement `form-sheet.md` records verbatim for
      // `plan-docker_management_app-dialog_sizing/REQ-13` (card 760.0 × 738.0, sheet 758.0 × 736.0),
      // and it is the same on both builds. Not a band of empty glass, and not this batch's to move.
      expect(round(reading.positioner.width - reading.sheet.width), 'the sheet no longer fills its card').toBe(2);
      expect({ width: round(reading.sheet.width), height: round(reading.sheet.height) }).toEqual({
        width: round(deliveredReading.sheet.width),
        height: round(deliveredReading.sheet.height),
      });
      expect(reading.sheet.height, 'the sheet grew past its own maximum').toBeLessThanOrEqual(reading.maxHeight + 0.5);
      // The body still scrolls: the form is shorter, not short.
      expect(reading.bodyContentHeight).toBeGreaterThan(reading.bodyVisibleHeight);
    } finally {
      await deliveredContext.close();
    }
  });
});

// REQ-80 — "`plan-docker_management_app-privileged_toggle_verification` and
// `plan-docker_management_app-toggle_focus_scroll` are preserved: … no control drags its dialog out
// of the viewport when focused or operated." Held here at the width this batch's own measurements
// are taken at, with a real pointer at the switch's own visible coordinates and an assertion on the
// sheet's viewport box — never `click()`, never the visually hidden input, never a character count.
test('the privileged switch leaves the reshaped sheet exactly where it was, at 1280×800', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(MEASURED_AT);
  await openCreateForm(page);

  const hidden = formSheet(page).getByRole('checkbox', { name: 'Run privileged' });
  // The **visible** switch — the track an operator aims at. The input behind it is where the defect
  // lived, so a pointer must never be sent there.
  const visibleSwitch = formSheet(page).locator('.ui-toggle:has(input[aria-label="Run privileged"]) .ui-toggle__track');

  const { surfaceBefore, surfaceAfter, controlAfter } = await clickAndExpectSurfaceUnmoved({
    page,
    surface: formSheet(page),
    surfaceName: 'the create sheet',
    control: visibleSwitch,
    controlName: 'the privileged switch',
    hiddenControl: hidden,
  });
  console.log(
    `[REQ-80] the sheet across the privileged switch: before x=${round(surfaceBefore.x)}, y=${round(
      surfaceBefore.y,
    )}, ${round(surfaceBefore.width)}×${round(surfaceBefore.height)} — after x=${round(surfaceAfter.x)}, y=${round(
      surfaceAfter.y,
    )}, ${round(surfaceAfter.width)}×${round(surfaceAfter.height)}; the switch at x=${round(controlAfter.x)}, y=${round(
      controlAfter.y,
    )}`,
  );

  // The whole box, not only its position: this switch reveals no field and hides none, so a sheet
  // that changed size did something the interaction has no business doing.
  expect(surfaceAfter, 'the create sheet changed size when the privileged switch was operated').toEqual(surfaceBefore);
  await expect(hidden, 'the switch does not read as selected after being operated').toBeChecked();

  await formSheet(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(imageField(page)).toHaveCount(0);
});

test.describe('F19 — the chip’s inline action grew no row', () => {
  // chip.md — "The chip is exactly as tall with that action as it was without one drawn. The action
  // is filled rather than outlined for that reason: an edge would make it taller than the line it
  // sits on and grow every chip, and with it the height of the rows that carry chip groups on the
  // networks and registries lists, which two certified batches pinned to the pixel."
  //
  // REQ-86, REQ-87 — the one place this batch could disturb a certified predecessor's geometry, so
  // it is measured against that predecessor rather than argued.
  test('leaves the network rows that carry chips exactly the height the delivered build drew', async ({
    browser,
    page,
  }) => {
    test.setTimeout(420_000);
    const networkName = `vexel-e2e-chip-row-${Date.now()}`;
    const containerName = `vexel-e2e-chip-row-consumer-${Date.now()}`;
    const deliveredContext = await browser.newContext({ baseURL: delivered.origin, viewport: MEASURED_AT });
    const before = await deliveredContext.newPage();

    const measureChipRows = async (target: Page) =>
      await target.evaluate((name) => {
        const box = (element: Element) => {
          const rect = element.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        };
        const card = [...document.querySelectorAll('.ui-data-table__body > .ui-surface')].find((candidate) =>
          (candidate.textContent ?? '').includes(name),
        );
        const chip = card?.querySelector('.ui-chip') ?? null;
        const action = chip?.querySelector('.ui-chip__action') ?? null;
        return {
          card: card ? box(card) : null,
          row: card?.querySelector('.ui-data-table__row') ? box(card.querySelector('.ui-data-table__row')!) : null,
          chip: chip ? box(chip) : null,
          action: action ? box(action) : null,
          actionLineHeight: action ? getComputedStyle(action).lineHeight : null,
        };
      }, networkName);

    try {
      await execFileAsync('docker', ['network', 'create', ...ownershipArgs('chip-action-row-height'), networkName]);
      await execFileAsync('docker', [
        'run',
        '-d',
        '--name',
        containerName,
        ...ownershipArgs('chip-action-row-height'),
        '--network',
        networkName,
        '--entrypoint',
        'sleep',
        ALPINE_IMAGE,
        '300',
      ]);

      await page.setViewportSize(MEASURED_AT);
      for (const target of [before, page]) {
        await openApp(target, 'volumes-networks');
        await expect(target.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible({
          timeout: 20_000,
        });
        await expect(
          target.locator('.ui-data-table__row-content', { hasText: containerName }).first(),
          'the fixture network’s attached container never appeared as a chip',
        ).toBeVisible({ timeout: 30_000 });
      }
      const deliveredRow = await measureChipRows(before);
      const row = await measureChipRows(page);

      console.log(
        `[REQ-86] the fixture network's row: delivered card ${round(deliveredRow.card?.height ?? Number.NaN)}px, chip ${round(
          deliveredRow.chip?.height ?? Number.NaN,
        )}px, action ${round(deliveredRow.action?.width ?? Number.NaN)}×${round(
          deliveredRow.action?.height ?? Number.NaN,
        )} — now card ${round(row.card?.height ?? Number.NaN)}px, chip ${round(row.chip?.height ?? Number.NaN)}px, action ${round(
          row.action?.width ?? Number.NaN,
        )}×${round(row.action?.height ?? Number.NaN)}`,
      );

      expect(deliveredRow.chip, 'the delivered build drew no chip on the fixture row').not.toBeNull();
      expect(row.chip, 'the fixture row draws no chip').not.toBeNull();
      expect(row.action, 'the chip carries no inline action').not.toBeNull();

      // The declared change, and the only one: the action is wider, having gained a fill and a
      // horizontal inset.
      expect(row.action!.width, 'the inline action gained no surface at all').toBeGreaterThan(deliveredRow.action!.width);
      // And the two things that must not have moved.
      expect(round(row.action!.height), 'the inline action is taller than the delivered one, which grows every chip').toBe(
        round(deliveredRow.action!.height),
      );
      expect(round(row.chip!.height), 'the chip is taller than the delivered one').toBe(round(deliveredRow.chip!.height));
      expect(round(row.card!.height), 'the row carrying the chip is a different height from the delivered one').toBe(
        round(deliveredRow.card!.height),
      );
    } finally {
      await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
      await execFileAsync('docker', ['network', 'rm', '-f', networkName]).catch(() => undefined);
      await deliveredContext.close();
    }
  });
});
