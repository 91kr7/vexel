/**
 * F16 — the About screen: one section-header treatment, no daemon event stream,
 * and everything else it stated said in the same words
 * (`plan-ui-coherence-optimisation/REQ-70`, `REQ-71`, `REQ-72`).
 *
 * A "treatment" is what the browser resolves, not what the source says: the
 * font, its size, its weight, its letter-spacing, the case the element is drawn
 * in and the colour it is drawn in. Two titles are in one treatment when all of
 * that is equal — which is why nothing below reads a class name to decide it,
 * and why the count is reported before it is asserted.
 *
 * The words `Daemon event stream` legitimately survive on this screen as a row
 * of the coverage map naming the Dashboard, so REQ-71 is asserted on a stream
 * **surface** and never on the words. REQ-71's other half — the stream being
 * unchanged where it stays — is the assertion that moved to the Dashboard with
 * it (`connectivity.spec.ts`, `plan-docker_management_app/REQ-11`, `REQ-12`).
 *
 * Nothing here creates a fixture on the daemon: the screens are read as the operator's own fills them.
 */
import { expect, test, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { boxOf } from './support/settled.js';

/** The screen's internal id, which the rename to "About" deliberately left alone. */
const ABOUT_SCREEN_ID = 'coverage-matrix';

/** The attribution term 1 of LICENSE-ADDITIONAL-TERMS.md specifies to the letter. */
const ATTRIBUTION = 'Vexel — Copyright (C) 2026 Christian Mariani';

/**
 * The five sections this screen is made of, in the order its specs describe
 * them: the notice's own (`app-shell/specs/about-notice.md`), the two cards the
 * shell keeps for itself (`app-shell/specs/shell.md`) and the coverage half's
 * two (`coverage/specs/coverage-matrix-screen.md`).
 */
const SECTIONS = [
  'Identity and license',
  'CLI availability',
  'Local storage',
  'Coverage baseline',
  'Docker capability coverage',
];

/** The section the delivered build drew that REQ-71 takes off this screen. */
const REMOVED_SECTION = 'Daemon event stream';

/** The thirteen screens of the shell, by the id the preference holds and the heading each draws. */
const SCREENS: { id: string; heading: string }[] = [
  { id: 'dashboard', heading: 'Dashboard' },
  { id: 'containers', heading: 'Containers' },
  { id: 'compose', heading: 'Compose' },
  { id: 'swarm', heading: 'Swarm' },
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

interface SectionTitle {
  text: string;
  /** The computed presentation, which is what "one treatment" is a statement about. */
  treatment: string;
  /** How the element is actually drawn, whatever case the source string is written in. */
  renderedCase: 'upper' | 'mixed';
  /** The element carries a style attribute of its own, which REQ-70 forbids. */
  styledLocally: boolean;
  /** It is the library's section-header primitive rather than a card-title treatment. */
  primitive: boolean;
  eyebrow: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Every section title the screen draws, however it is drawn: both the primitive
 * and the card-title treatment are collected, so the same measurement describes
 * the build that mixed them and the one that does not.
 */
async function measureTitles(page: Page): Promise<SectionTitle[]> {
  return await page.evaluate(() => {
    const content = document.querySelector('.ui-frame__content')!;
    const candidates = [...content.querySelectorAll('.ui-section-header__title, .ui-card__title')];
    // A build whose card title *wraps* the primitive matches both selectors on
    // one title; the outer element is a box, the inner one carries the type.
    const titles = candidates.filter((element) => !candidates.some((other) => other !== element && element.contains(other)));

    return titles.map((element) => {
      const style = getComputedStyle(element);
      const own = [...element.childNodes]
        .filter((node) => !(node instanceof Element && node.matches('.ui-section-header__sublabel')))
        .map((node) => node.textContent ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      const rendered = style.textTransform === 'uppercase' ? own.toUpperCase() : own;
      const header = element.closest('.ui-section-header');
      const box = element.getBoundingClientRect();
      return {
        text: own,
        treatment: [
          style.fontFamily,
          style.fontSize,
          style.fontWeight,
          style.letterSpacing,
          style.textTransform,
          style.color,
        ].join(' | '),
        renderedCase: /[a-z]/.test(rendered) ? ('mixed' as const) : ('upper' as const),
        styledLocally: element.getAttribute('style') !== null || header?.getAttribute('style') != null,
        primitive: element.matches('.ui-section-header__title'),
        eyebrow: header?.classList.contains('ui-section-header--eyebrow') ?? false,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
    });
  });
}

/**
 * Where the daemon event stream is presented, on the screen currently open.
 *
 * Two readings, because neither alone answers it. The stream's own surface is
 * only drawn once an event has arrived — with none, the panel draws an empty
 * state instead — so a screen presenting the stream can legitimately show no
 * `.ui-event-stream` at all. The panel, on the other hand, is always drawn where
 * the stream is presented, and it is identified by the **section that titles
 * it**: the words `Daemon event stream` also appear on About as a row of the
 * coverage map naming the Dashboard, and a table row is not a section title.
 */
async function measureStreamPresence(page: Page): Promise<{ panels: number; surfaces: number }> {
  return await page.evaluate(() => {
    const content = document.querySelector('.ui-frame__content')!;
    const candidates = [...content.querySelectorAll('.ui-section-header__title, .ui-card__title')];
    const titles = candidates.filter((element) => !candidates.some((other) => other !== element && element.contains(other)));
    return {
      panels: titles.filter((title) => (title.textContent ?? '').replace(/\s+/g, ' ').trim() === 'Daemon event stream').length,
      surfaces: content.querySelectorAll('.ui-event-stream').length,
    };
  });
}

interface NoticeReading {
  /** Everything the notice states, its own titling excluded: what REQ-72 keeps word for word. */
  body: string;
  routes: (string | null)[];
}

async function readNotice(page: Page, attribution: string): Promise<NoticeReading | null> {
  return await page.evaluate((expected) => {
    const card = [...document.querySelectorAll('.ui-frame__content .ui-surface')].find((surface) =>
      (surface.textContent ?? '').includes(expected),
    );
    if (!card) return null;
    const body = card.querySelector('.ui-callout') ?? card.lastElementChild;
    if (!body) return null;
    return {
      body: ((body as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim(),
      routes: [...body.querySelectorAll('a')].map((link) => link.getAttribute('href')),
    };
  }, attribution);
}

/**
 * What one of the screen's cards states, its own titling excluded — the titling
 * being the only part of it this batch is entitled to change.
 */
async function readCard(page: Page, title: string): Promise<string | null> {
  return await page.evaluate((wanted) => {
    const titles = [...document.querySelectorAll('.ui-frame__content .ui-section-header__title, .ui-frame__content .ui-card__title')];
    const own = titles.find((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim().startsWith(wanted));
    const card = own?.closest('.ui-surface') ?? null;
    if (!card || !own) return null;
    return [...card.children]
      .filter((child) => !child.contains(own))
      .map((child) => (child as HTMLElement).innerText ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }, title);
}

/**
 * The About screen, once every read behind it has settled: the connectivity
 * probe fills the CLI availability card, and the baseline read fills the
 * coverage half. Measured before either lands, the screen is this runner's
 * timing rather than the build.
 */
async function openAbout(page: Page): Promise<void> {
  await openApp(page, ABOUT_SCREEN_ID);
  await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.ui-frame__content').getByText(ATTRIBUTION)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('header').getByText(/Engine API v\d+\.\d+/)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.ui-data-table__row').first()).toBeVisible({ timeout: 30_000 });
}

function treatmentsOf(titles: SectionTitle[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const title of titles) {
    const key = `${title.treatment} | ${title.renderedCase}`;
    groups.set(key, [...(groups.get(key) ?? []), title.text]);
  }
  return groups;
}

function describeTreatments(titles: SectionTitle[]): string {
  return [...treatmentsOf(titles)]
    .map(([treatment, names]) => `${names.join(', ')} → ${treatment}`)
    .join('; ');
}

test.describe('F16 — About states one thing one way', () => {
  // plan-ui-coherence-optimisation/REQ-70, REQ-26 — every section title of this screen renders in
  // one treatment, the primitive's, and none of them is styled locally
  test('every section title on the About screen renders in one treatment', async ({ page }) => {
    test.setTimeout(300_000);
    {
      await openAbout(page);
      const titles = await measureTitles(page);

      console.log(
        `[REQ-70] now: ${titles.length} section title(s) in ${treatmentsOf(titles).size} treatment(s) — ${describeTreatments(titles)}`,
      );

      expect(treatmentsOf(titles).size, 'the screen carries more than one section-header treatment').toBe(1);
      expect(titles.map((title) => title.text), 'the screen draws a different set of sections').toEqual(SECTIONS);
      for (const title of titles) {
        expect(title.primitive, `"${title.text}" is not titled by the section-header primitive`).toBe(true);
        expect(title.eyebrow, `"${title.text}" still carries the uppercase micro-caps treatment`).toBe(false);
        expect(title.styledLocally, `"${title.text}" is styled locally`).toBe(false);
      }

      // The titles below are compared against this box, so it is read once the screen has come to
      // rest rather than in whichever frame the walk above finished (`support/settled.ts`).
      const box = await boxOf(page.locator('.ui-frame__content'), 'the screen’s content region');
      titles.forEach((title, index) => {
        expect(title.width, `"${title.text}" has no box on the screen`).toBeGreaterThan(0);
        expect(title.height, `"${title.text}" has no box on the screen`).toBeGreaterThan(0);
        expect(title.x, `"${title.text}" is drawn outside the content region`).toBeGreaterThanOrEqual(box!.x);
        expect(title.x + title.width, `"${title.text}" is drawn past the content region`).toBeLessThanOrEqual(box!.x + box!.width + 1);
        if (index > 0) {
          expect(title.y, `"${title.text}" is not drawn under "${titles[index - 1]!.text}"`).toBeGreaterThan(titles[index - 1]!.y);
        }
      });
    }
  });

  // plan-ui-coherence-optimisation/REQ-71 — the daemon event stream is presented in one place in
  // the product, and that place is the Dashboard
  test('no daemon event stream is drawn on About, and exactly one screen draws one', async ({ page }) => {
    test.setTimeout(300_000);
    {
      const presentedBy: string[] = [];
      const surfacesDrawnBy: string[] = [];
      for (const screen of SCREENS) {
        await openApp(page, screen.id);
        await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible({ timeout: 20_000 });
        const stream = await measureStreamPresence(page);
        if (stream.panels > 0) presentedBy.push(`${screen.heading} (${stream.panels})`);
        if (stream.surfaces > 0) surfacesDrawnBy.push(`${screen.heading} (${stream.surfaces})`);
      }
      console.log(
        `[REQ-71] now: the stream is presented on ${presentedBy.length === 0 ? 'no screen' : presentedBy.join(', ')}, ` +
          `and its surface is drawn on ${surfacesDrawnBy.length === 0 ? 'no screen' : surfacesDrawnBy.join(', ')}`,
      );

      expect(presentedBy, 'the daemon event stream is not presented on exactly one screen, the Dashboard').toEqual(['Dashboard (1)']);
      expect(
        surfacesDrawnBy.filter((screen) => !screen.startsWith('Dashboard')),
        'a stream surface is drawn on a screen that does not present the stream',
      ).toEqual([]);
    }
  });

  // plan-ui-coherence-optimisation/REQ-72 — everything else About states is preserved: the notice,
  // the identity and licence block, and the CLI availability block
  test('everything else the About screen states is still on it, in its own words', async ({ page }) => {
    test.setTimeout(300_000);
    await openAbout(page);

    const notice = await readNotice(page, ATTRIBUTION);
    expect(notice, 'the About screen draws no notice at all').not.toBeNull();
    expect(notice!.body, 'the notice no longer carries the attribution term 1 specifies').toContain(ATTRIBUTION);
    expect(notice!.routes.length, 'the notice no longer offers its three routes').toBe(3);
    expect(notice!.body, 'the notice no longer states the running version beside its source').toMatch(/version \d+\.\d+\.\d+/);

    const cli = await readCard(page, 'CLI availability');
    expect(cli, 'the CLI availability card is no longer on the screen').not.toBeNull();

    const storage = await readCard(page, 'Local storage');
    expect(storage, 'the Local storage card is no longer on the screen').not.toBeNull();
    expect(storage, 'the Local storage card no longer names the analysis cache').toContain('Analysis cache');
    expect(storage, 'the Local storage card no longer offers its Clear action').toContain('Clear');

    const titles = await measureTitles(page);
    expect(titles.map((title) => title.text), 'the screen lost or gained a section beyond the stream REQ-71 removes').toEqual(SECTIONS);
    expect(titles.map((title) => title.text), 'the removed section is still titled on the screen').not.toContain(REMOVED_SECTION);
  });
});
