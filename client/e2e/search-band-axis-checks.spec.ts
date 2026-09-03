import { expect, test, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { expectBandFillsItsRow, expectBandIsTheHeightOfItsControl, measureSearchBand } from './support/search-band-axis.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/**
 * **The checks that guard the search band, checked themselves.**
 *
 * `plan-docker_management_app-filesystem_browser_layout` is a report whose whole argument is that a
 * check which cannot fail certifies nothing (its REQ-32): the coverage written for bug-2 passed on
 * the defect it was written for, twice over. The geometry of the corrected surface is measured
 * against the real product in `filesystem-browser-layout.spec.ts` and `container-logs.spec.ts`; what
 * is missing beside them is the evidence that those measurements go **red** on the implementations
 * they exist to refuse — and each on a different one, because the two halves of the band's contract
 * fail apart:
 *
 * - the band's height against the height of its control catches the **delivered** rule
 *   (`flex: 1 1 240px` unconditionally, which reads as "240px tall" in a column) — and accepts a
 *   call-site wrapper without a murmur;
 * - the band's root being a **direct child of the arrangement** catches the wrapper — legal
 *   composition, no rule broken, the void closed on this one screen and the shared control still
 *   wrong for the next one — and would accept the delivered rule if it stood alone;
 * - the row-axis pair (a 240px floor, and growing to the row's content edge) catches a correction
 *   that fixes the column by taking the row away, on the band's one other user.
 *
 * Each arrangement is built from the product's **own stylesheet**, loaded by the running
 * application, with the band's own markup and the delivered rule reinstated as a stylesheet
 * override — the defect at the level it lived at. No daemon, no fixture and no application state is
 * involved: this spec measures CSS, not Docker.
 */

/** One pixel of slack, exactly as the helpers under examination allow themselves. */
const TOLERANCE_PX = 1;

/** The band's own markup, as `StreamSearchField` emits it: the classes are what the stylesheet acts on. */
const BAND_MARKUP = `
  <div class="ui-stream-search">
    <div class="ui-stream-search__input"><input type="text" class="ui-text-field" /></div>
    <button type="button" class="ui-button ui-button--sm">Previous</button>
    <button type="button" class="ui-button ui-button--sm">Next</button>
  </div>`;

const FIXTURE_ID = 'search-band-axis-fixture';

/**
 * Mounts one arrangement of the band inside the running application, so the product's own stylesheet
 * is the one that sizes it. `innerHtml` receives the band; the host is a bounded column, which is
 * what a dialog body hands an arrangement.
 */
async function mountArrangement(page: Page, innerHtml: string): Promise<void> {
  await page.evaluate(
    ({ id, html }) => {
      document.getElementById(id)?.remove();
      const host = document.createElement('div');
      host.id = id;
      // A fixed, bounded column: the shape of the space a dialog body offers.
      host.setAttribute(
        'style',
        'position:fixed; top:0; left:0; z-index:99999; width:900px; height:420px; display:flex; flex-direction:column; background:#101018;',
      );
      host.innerHTML = html;
      document.body.append(host);
    },
    { id: FIXTURE_ID, html: innerHtml },
  );
}

/** The predicate the layout spec asserts: the band's root is a band of the arrangement itself, not a wrapper's child. */
async function isDirectChildOfBandStack(page: Page): Promise<boolean> {
  return page.evaluate((id) => {
    const band = document.querySelector(`#${id} .ui-stream-search`);
    const stack = document.querySelector(`#${id} .ui-band-stack`);
    if (!band || !stack) throw new Error('the arrangement was not mounted');
    return band.parentElement === stack;
  }, FIXTURE_ID);
}

test.beforeEach(async ({ page }) => {
  // The application is opened only for its stylesheet: nothing here drives a screen.
  await openApp(page);
});

test.afterEach(async ({ page }) => {
  await page.evaluate((id) => document.getElementById(id)?.remove(), FIXTURE_ID);
});

// plan-docker_management_app-filesystem_browser_layout/REQ-3, REQ-32 — the height half, red on the
// rule this report replaces.
test('the band-is-the-height-of-its-control check passes on the correction and fails on the rule it replaced', async ({ page }) => {
  await mountArrangement(page, `<div class="ui-band-stack"><div class="ui-row">a status row</div>${BAND_MARKUP}<div class="ui-band-stack__fill"></div></div>`);
  const band = page.locator(`#${FIXTURE_ID} .ui-stream-search`);

  const corrected = await measureSearchBand(band);
  expectBandIsTheHeightOfItsControl('a band of the arrangement, the delivered correction', corrected);
  expect(await isDirectChildOfBandStack(page), 'the arrangement under examination is not the direct-child one').toBe(true);

  // The delivered rule reinstated, at the level it lived at: same declaration, same specificity,
  // later in the cascade. Nothing else about the arrangement changes.
  await page.addStyleTag({ content: '.ui-stream-search { flex: 1 1 240px; }' });
  const delivered = await measureSearchBand(band);
  console.log(
    `[band axis] in a column: corrected ${corrected.height.toFixed(1)}px around a ${corrected.controlHeight.toFixed(
      1,
    )}px control; the replaced rule ${delivered.height.toFixed(1)}px around a ${delivered.controlHeight.toFixed(1)}px control`,
  );

  expect(
    Math.abs(delivered.height - delivered.controlHeight) > TOLERANCE_PX,
    `the delivered rule left the band ${delivered.height.toFixed(1)}px tall around a ${delivered.controlHeight.toFixed(
      1,
    )}px control, and the check accepted it: it cannot fail on the defect it exists to catch`,
  ).toBe(true);
  expect(
    delivered.height,
    `the delivered rule was reinstated but the band still measures ${delivered.height.toFixed(1)}px: the arrangement does not reproduce the defect`,
  ).toBeGreaterThan(corrected.height + 100);
});

// plan-docker_management_app-filesystem_browser_layout/REQ-3, REQ-32 — the direct-child half, and the
// reason it is not redundant: the wrong fix is the one that passes everything else.
test('the direct-child check is what refuses a call-site wrapper, which the height check accepts', async ({ page }) => {
  await mountArrangement(
    page,
    `<div class="ui-band-stack"><div class="ui-row">a status row</div><div class="ui-row">${BAND_MARKUP}</div><div class="ui-band-stack__fill"></div></div>`,
  );
  const wrapped = await measureSearchBand(page.locator(`#${FIXTURE_ID} .ui-stream-search`));
  console.log(
    `[band axis] wrapped in a row at the call site: ${wrapped.height.toFixed(1)}px around a ${wrapped.controlHeight.toFixed(
      1,
    )}px control, parent "${wrapped.parent.className}"`,
  );

  // Wrapping the band in a row closes the void: on this arrangement the height half is satisfied,
  // and so is every conformance rule. It is the direct-child half, and only it, that says the fix
  // was made at the call site and left the shared control as it was.
  expect(
    Math.abs(wrapped.height - wrapped.controlHeight) <= TOLERANCE_PX,
    `the wrapper arrangement measures ${wrapped.height.toFixed(1)}px around a ${wrapped.controlHeight.toFixed(
      1,
    )}px control: it is not the case the direct-child assertion exists for`,
  ).toBe(true);
  expect(
    await isDirectChildOfBandStack(page),
    'a band wrapped in a row at the call site was reported as a band of the arrangement itself: the check cannot see the wrong fix',
  ).toBe(false);
});

// plan-docker_management_app-filesystem_browser_layout/REQ-4, REQ-35 — the row axis, red when the
// column is corrected by taking the row's behaviour away.
test('the row-axis check fails when the rule that makes the band fill its row is taken away', async ({ page }) => {
  await mountArrangement(page, `<div class="ui-row" style="width:900px">${BAND_MARKUP}</div>`);
  const band = page.locator(`#${FIXTURE_ID} .ui-stream-search`);

  const delivered = await measureSearchBand(band);
  expectBandFillsItsRow('a band in the library’s own row, the delivered contract', delivered);
  expectBandIsTheHeightOfItsControl('a band in the library’s own row, the delivered contract', delivered);

  // The correction made in the wrong place: the band sized to its controls on every axis, with
  // nothing left to give it the row's floor and the row's growth.
  await page.addStyleTag({ content: '.ui-row > .ui-stream-search { flex: 0 0 auto; }' });
  const broken = await measureSearchBand(band);
  console.log(
    `[band axis] in a row: delivered ${delivered.width.toFixed(1)}px reaching ${delivered.right.toFixed(
      1,
    )}px of a row ending at ${delivered.parent.contentRight.toFixed(1)}px; with the row rule gone ${broken.width.toFixed(
      1,
    )}px reaching ${broken.right.toFixed(1)}px`,
  );

  expect(
    broken.parent.contentRight - broken.right > TOLERANCE_PX,
    `with the row-axis rule gone the band still reaches its row's content edge (${broken.right.toFixed(1)}px against ${broken.parent.contentRight.toFixed(
      1,
    )}px): the check would not see the row being broken to fix the column`,
  ).toBe(true);
});
