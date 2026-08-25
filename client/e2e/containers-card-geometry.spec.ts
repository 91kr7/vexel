/**
 * **The container card, measured** (`plan-docker_management_app-containers_card_view/REQ-10`,
 * `REQ-11`, `REQ-15`, `REQ-16`, `REQ-22`, `REQ-32`, `REQ-34`, `REQ-35`, `REQ-36`, `REQ-37`).
 *
 * The element map of `requirements.md` is a statement about **positions**: which band an element
 * sits in, its order within that band, its alignment and what it is aligned to. A card can carry
 * every one of those elements, spell every value correctly, and still have its metrics drifting card
 * by card, its action cluster short of the inner right edge or its capacity note aligned to nothing
 * — none of which changes one character of what the screen says. So every claim here is about
 * **viewport boxes and edges**, content assertions standing beside them and never instead of them
 * (CLAUDE.md, "What a check drives, and what it measures"), and every interaction is driven with a
 * **real pointer at the visible control's own coordinates**.
 *
 * **The arrangement measured is the one that ships**, and it departs from the first mock at two
 * named positions and follows a second mock inside the card: the list is a **grid of three cards to
 * a row** (two at ≤1200px, one at ≤720px) and a card **stacks its metrics one per row**
 * (`containers-refactor.png`, amended 2026-08-25); within a card the bands are
 * `containers-refactor-b3.png`'s — identity → state and duration → image → metrics → footer actions.
 *
 * **Fixtures created by this file and removed by it**, narrowed to by the screen's own search,
 * because a claim like "the metrics are at the same x on every card of a row" is only the product's
 * if the cards being compared are the ones this spec made — the operator's own containers are none
 * of its business.
 *
 * What this file does **not** do: assert what the human accepts by eye. Whether the muted text is
 * comfortable over the lightest region of the background (REQ-35) is a judgement; what is asserted
 * is that nothing is drawn transparent, zero-sized or clipped away, and the colours are reported.
 */
import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { boxOf, readOnceSettled } from './support/settled.js';
import { clickAt } from './support/pointer.js';
import { containerCard, containerCards } from './support/container-cards.js';

const DESKTOP = { width: 1440, height: 1000 };
const TWO_TRACKS = { width: 1100, height: 1000 };
const PHONE = { width: 375, height: 812 };

/** Half a pixel: below what any assertion here distinguishes, above the browser's own float noise. */
const TOLERANCE = 0.5;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ColumnGeometry {
  /** `readings` is the trailing untracked column; the others carry a track. */
  kind: 'tracked' | 'readings';
  box: Box;
  label: string;
  labelBox: Box | null;
  value: string | null;
  valueBox: Box | null;
  /** The capacity note: `of 8 cores`, `of 31.0GB` — or the *no sample* wording in its place. */
  reading: string | null;
  readingBox: Box | null;
  track: Box | null;
  trackClass: string;
  fill: Box | null;
  readings: { label: string; value: string; box: Box }[];
}

interface CardGeometry {
  name: string;
  box: Box;
  /** The content band's inner edges: its border box less its own padding, the inset a parted surface moved onto it. */
  inner: { left: number; right: number };
  /** The card's own hairline, so a band reaching "the surface's edge" is read against its padding box and not its border box. */
  border: { top: number; right: number; bottom: number; left: number };
  /** The footer's inner edges, which the parted surface makes the same inset as the content's. */
  footerInner: { left: number; right: number } | null;
  /** The state accent: a layer over the card's own box, painting a bar of one colour down its left edge. */
  accent: { image: string; colour: string; barWidth: number; radius: string; pointerEvents: string; inset: string } | null;
  /** The tone each of the carriers derives from — they are one state or they are not. */
  accentTone: string;
  dotTone: string;
  pillTone: string;
  fillTones: string[];
  dotColour: string;
  dotBox: Box;
  pillText: string;
  pillBox: Box;
  nameText: string;
  nameBox: Box;
  shortId: string;
  shortIdBox: Box;
  /** The deliberately inert control that will open the detail in a modal (`container-card.md`). */
  detailControl: { label: string; box: Box; disabled: boolean } | null;
  /** The card's content bands, in order; the footer is not one of them. */
  bands: Box[];
  footer: Box | null;
  /** The `image <reference>` field: a line of its own, front-truncating. */
  image: { text: string; title: string; box: Box; direction: string; overflow: string } | null;
  primaryAction: { label: string; box: Box } | null;
  cluster: { box: Box; segments: { label: string; box: Box }[] } | null;
  status: { text: string; box: Box } | null;
  strip: Box | null;
  stripBox: Box | null;
  columns: ColumnGeometry[];
  /** The `PORTS` row: label at the left, chips right-aligned, drawn on every card (REQ-5, REQ-22). */
  ports: { label: string; labelBox: Box; box: Box; chips: { text: string; box: Box }[] } | null;
  /** Every chip the card draws, so an accumulation across polls is countable (REQ-15). */
  chipCount: number;
  /** Descendants declaring a transition or an animation — REQ-17 wants this empty. */
  animated: string[];
  /** Descendants computing a blur of any kind — REQ-33 wants this empty. */
  blurred: string[];
  /** Text of this card painted outside the card's own box, by more than half a pixel. */
  clipped: string[];
  /** Every piece of text the card draws, for comparing one width against another (REQ-34). */
  texts: string[];
}

interface ListGeometry {
  viewport: { width: number; height: number };
  /** How far the content region is scrolled: a card at rest in a scrolled list is still at rest. */
  scrollTop: number;
  /** …and how far the document is, which is the other thing a focus can move under a fixed layout. */
  windowScrollY: number;
  documentScrollWidth: number;
  documentClientWidth: number;
  /** The grid the cards stand in, so a card's width can be read against the track it was given. */
  grid: Box | null;
  cards: CardGeometry[];
  /** Boxes alone, so a settle can tell a layout that has stopped moving from figures that keep updating. */
  geometryKey: string;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function describeBox(box: Box): string {
  return `x=${round(box.x)}, y=${round(box.y)}, ${round(box.width)}×${round(box.height)}`;
}

/** The cards the grid put on one row: the ones whose top edge is the row's. */
function rowOf(list: ListGeometry, index: number): CardGeometry[] {
  const top = list.cards[index].box.y;
  return list.cards.filter((card) => Math.abs(card.box.y - top) <= TOLERANCE);
}

/**
 * The whole list, card by card, in **one** pass — so that no two figures compared below come from
 * two different layouts.
 *
 * Settled on its **geometry alone**: the metrics under this very check are live, so a comparator
 * reading the values would never see two agreeing samples and would return the last one it took,
 * mid-layout, which is the failure `support/settled.ts` exists to prevent.
 */
async function measureList(page: Page): Promise<ListGeometry> {
  return await readOnceSettled(
    page,
    () => measureListThisFrame(page),
    (previous, current) => previous.geometryKey === current.geometryKey,
  );
}

/** **One frame, and no test calls it**: the sampler above is built out of it. */
async function measureListThisFrame(page: Page): Promise<ListGeometry> {
  return await page.evaluate(() => {
    const box = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const boxOrNull = (element: Element | null): Box | null => (element === null ? null : box(element));
    const text = (element: Element | null): string => (element?.textContent ?? '').trim();

    /**
     * Every painted piece of text under an element, as rectangles, so "clipped" is about ink and not
     * about markup.
     *
     * A line the truncation contract ellipsises is a special case and not an exception: its text is
     * laid out at its full length and **painted only inside its own box**, so a range rect would
     * report every ellipsised value as ink outside the card. What is measured for such a line is
     * therefore the box that clips it — which is the box that must stay inside the card, and which a
     * line genuinely overflowing its card would fail on just the same.
     */
    const inkRects = (element: Element): { text: string; rect: DOMRect }[] => {
      const out: { text: string; rect: DOMRect }[] = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.nodeValue?.trim()) continue;
        const parent = node.parentElement;
        // A description written for assistive technology alone is not ink: it is a 1px box clipped
        // to nothing, and where that box happens to sit says nothing about what the card paints.
        if (parent !== null && parent.closest('.ui-button-with-description__text') !== null) continue;
        const clipping =
          parent === null
            ? null
            : (parent.closest('.ui-truncating-line') as HTMLElement | null) ??
              (getComputedStyle(parent).textOverflow === 'ellipsis' && getComputedStyle(parent).overflow !== 'visible'
                ? parent
                : null);
        if (clipping !== null) {
          out.push({ text: node.nodeValue.trim(), rect: clipping.getBoundingClientRect() });
          continue;
        }
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) out.push({ text: node.nodeValue.trim(), rect });
      }
      return out;
    };

    /** The inner edges of a band: its border box less its own border and padding. */
    const innerEdges = (element: HTMLElement): { left: number; right: number } => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        left: rect.left + Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.paddingLeft),
        right: rect.right - Number.parseFloat(style.borderRightWidth) - Number.parseFloat(style.paddingRight),
      };
    };

    const readColumn = (column: HTMLElement): ColumnGeometry => {
      const isReadings = column.classList.contains('ui-metric-strip__column--readings');
      const track = column.querySelector<HTMLElement>('.ui-meter__track');
      return {
        kind: isReadings ? 'readings' : 'tracked',
        box: box(column),
        label: text(column.querySelector('.ui-meter__label--eyebrow, .ui-meter__label')),
        labelBox: boxOrNull(column.querySelector('.ui-meter__label--eyebrow, .ui-meter__label')),
        value: isReadings ? null : text(column.querySelector('.ui-meter__value')) || null,
        valueBox: isReadings ? null : boxOrNull(column.querySelector('.ui-meter__value')),
        reading: text(column.querySelector('.ui-meter__reading')) || null,
        readingBox: boxOrNull(column.querySelector('.ui-meter__reading')),
        track: boxOrNull(track),
        trackClass: track?.className ?? '',
        fill: boxOrNull(column.querySelector('.ui-meter__fill')),
        readings: Array.from(column.querySelectorAll<HTMLElement>('.ui-metric-strip__reading')).map((reading) => ({
          label: text(reading.querySelector('.ui-metric-strip__reading-label')),
          value: text(reading.querySelector('.ui-meter__value')),
          box: box(reading),
        })),
      };
    };

    const cards = Array.from(document.querySelectorAll<HTMLElement>('.ui-frame__content .ui-surface--selectable')).map((card) => {
      const cardBox = card.getBoundingClientRect();
      const after = getComputedStyle(card, '::after');
      const body = card.querySelector<HTMLElement>('.ui-surface__body');
      const footer = card.querySelector<HTMLElement>('.ui-surface__footer');
      const groups = Array.from(card.querySelectorAll<HTMLElement>('.ui-action-button-group'));
      const cluster = groups.find((group) => group.classList.contains('ui-action-button-group--segmented')) ?? null;
      const primary = groups.find((group) => !group.classList.contains('ui-action-button-group--segmented')) ?? null;
      const strip = card.querySelector<HTMLElement>('.ui-metric-strip');
      const stripGroup = card.querySelector<HTMLElement>('.ui-metric-strip-group');
      const dot = card.querySelector<HTMLElement>('.ui-table-status-dot');
      const pill = card.querySelector<HTMLElement>('.ui-badge');
      const heading = card.querySelector<HTMLElement>('.ui-section-header__title');
      const identifier = card.querySelector<HTMLElement>('.ui-table-identifier-cell');
      const opener = card.querySelector<HTMLButtonElement>('.ui-icon-button');
      const imageField = card.querySelector<HTMLElement>('.ui-chip--block');
      const imageLabel = imageField?.querySelector<HTMLElement>('.ui-chip__label') ?? null;
      const portsRow = card.querySelector<HTMLElement>('.ui-metric-strip__row');
      const bands = Array.from((body?.firstElementChild as HTMLElement | null)?.children ?? []).map((band) => box(band));

      const animated: string[] = [];
      const blurred: string[] = [];
      for (const element of [card, ...Array.from(card.querySelectorAll<HTMLElement>('*'))]) {
        const declared = getComputedStyle(element);
        const transitions = declared.transitionDuration.split(',').map((one) => one.trim());
        if (transitions.some((one) => one !== '0s') || declared.animationName !== 'none') {
          animated.push(`${element.className || element.tagName} (${declared.transitionDuration} / ${declared.animationName})`);
        }
        for (const pseudo of [null, '::before', '::after'] as const) {
          const layer = pseudo === null ? declared : getComputedStyle(element, pseudo);
          const backdrop = (layer as CSSStyleDeclaration & { backdropFilter?: string }).backdropFilter ?? 'none';
          if ((backdrop !== 'none' && backdrop !== '') || /blur\(/.test(layer.filter)) {
            blurred.push(`${element.className || element.tagName}${pseudo ?? ''}: ${backdrop} / ${layer.filter}`);
          }
        }
      }

      const clipped = inkRects(card)
        .filter(
          (ink) =>
            ink.rect.left < cardBox.left - 0.5 ||
            ink.rect.right > cardBox.right + 0.5 ||
            ink.rect.top < cardBox.top - 0.5 ||
            ink.rect.bottom > cardBox.bottom + 0.5,
        )
        .map((ink) => ink.text);

      // Chromium serialises the two-position stop as two stops, so the colour is the gradient's
      // first and the bar's width is the first non-zero stop after it.
      const gradientColour = /(rgba?\([^)]*\))/.exec(after.backgroundImage);
      const gradientStop = /rgba?\([^)]*\)[^,]*?([\d.]+)px/.exec(after.backgroundImage.replace(/\s0px/g, ''));

      return {
        name: text(heading),
        box: box(card),
        inner: body === null ? { left: cardBox.left, right: cardBox.right } : innerEdges(body),
        border: (() => {
          const style = getComputedStyle(card);
          return {
            top: Number.parseFloat(style.borderTopWidth),
            right: Number.parseFloat(style.borderRightWidth),
            bottom: Number.parseFloat(style.borderBottomWidth),
            left: Number.parseFloat(style.borderLeftWidth),
          };
        })(),
        footerInner: footer === null ? null : innerEdges(footer),
        accent:
          after.content === 'none'
            ? null
            : {
                image: after.backgroundImage,
                colour: gradientColour?.[1] ?? '',
                barWidth: gradientStop === null ? Number.NaN : Number.parseFloat(gradientStop[1]),
                radius: after.borderRadius,
                pointerEvents: after.pointerEvents,
                inset: `${after.top} ${after.right} ${after.bottom} ${after.left}`,
              },
        accentTone: /ui-surface--accent-(\w+)/.exec(card.className)?.[1] ?? '',
        dotTone: /ui-table-status-dot--tone-(\w+)/.exec(dot?.className ?? '')?.[1] ?? (dot === null ? '' : 'success'),
        pillTone: /ui-badge--tone-(\w+)/.exec(pill?.className ?? '')?.[1] ?? (pill === null ? '' : 'neutral'),
        fillTones: Array.from(card.querySelectorAll<HTMLElement>('.ui-meter__fill')).map(
          (fill) => /ui-meter__fill--(\w+)/.exec(fill.className)?.[1] ?? 'accent',
        ),
        dotColour: dot === null ? '' : getComputedStyle(dot).backgroundColor,
        dotBox: dot === null ? { x: 0, y: 0, width: 0, height: 0 } : box(dot),
        pillText: text(pill),
        pillBox: pill === null ? { x: 0, y: 0, width: 0, height: 0 } : box(pill),
        nameText: text(heading),
        nameBox: heading === null ? { x: 0, y: 0, width: 0, height: 0 } : box(heading),
        shortId: text(identifier),
        shortIdBox: identifier === null ? { x: 0, y: 0, width: 0, height: 0 } : box(identifier),
        detailControl:
          opener === null ? null : { label: opener.getAttribute('aria-label') ?? '', box: box(opener), disabled: opener.disabled },
        bands,
        footer: boxOrNull(footer),
        image:
          imageField === null || imageLabel === null
            ? null
            : {
                text: text(imageLabel),
                title: imageLabel.getAttribute('title') ?? '',
                box: box(imageField),
                direction: getComputedStyle(imageLabel).direction,
                overflow: getComputedStyle(imageLabel).textOverflow,
              },
        primaryAction: primary === null ? null : { label: text(primary.querySelector('button')), box: box(primary) },
        cluster:
          cluster === null
            ? null
            : {
                box: box(cluster),
                segments: Array.from(cluster.querySelectorAll<HTMLElement>('.ui-action-button-group__segment')).map((segment) => ({
                  label: text(segment.querySelector('button')),
                  box: box(segment),
                })),
              },
        status: (() => {
          const message = card.querySelector<HTMLElement>('.ui-field-message');
          return message === null ? null : { text: text(message), box: box(message) };
        })(),
        strip: boxOrNull(strip),
        stripBox: boxOrNull(stripGroup ?? strip),
        columns: Array.from(card.querySelectorAll<HTMLElement>('.ui-metric-strip__column')).map((column) => readColumn(column)),
        ports:
          portsRow === null
            ? null
            : {
                label: text(portsRow.querySelector('.ui-meter__label--eyebrow')),
                labelBox: box(portsRow.querySelector('.ui-meter__label--eyebrow')!),
                box: box(portsRow),
                chips: Array.from(portsRow.querySelectorAll<HTMLElement>('.ui-chip')).map((chip) => ({
                  text: text(chip),
                  box: box(chip),
                })),
              },
        chipCount: card.querySelectorAll('.ui-chip').length,
        animated,
        blurred,
        clipped,
        texts: inkRects(card).map((ink) => ink.text),
      };
    });

    const geometryKey = JSON.stringify(
      cards.map((card) => [card.box, card.bands, card.footer, card.columns.map((column) => [column.box, column.track])]),
    );

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollTop: document.querySelector('.ui-frame__content')?.scrollTop ?? 0,
      windowScrollY: window.scrollY,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      grid: boxOrNull(document.querySelector('.ui-frame__content .ui-grid--cards')),
      cards,
      geometryKey,
    };
  });
}

/** The fixtures of one test, named so the server's alphabetical order is this file's own. */
interface Fixtures {
  stem: string;
  running: string;
  paused: string;
  exited: string;
}

function fixtureNames(what: string): Fixtures {
  const stem = `vexel-e2e-card-${what}-${Date.now()}`;
  return { stem, running: `${stem}-a-running`, paused: `${stem}-b-paused`, exited: `${stem}-c-exited` };
}

/**
 * A container that does measurable work every second, so its CPU reading is a live number rather
 * than a constant: `dd` to `/dev/null` costs milliseconds and touches nothing on the host.
 */
async function createWorkingContainer(name: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync('docker', [
    'run', '-d', '--name', name, ...ownershipArgs(name), ...extraArgs, '--entrypoint', 'sh', ALPINE_IMAGE,
    '-c', 'while :; do dd if=/dev/zero of=/dev/null bs=1M count=200 2>/dev/null; sleep 1; done',
  ]);
}

async function createSleepingContainer(name: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), ...extraArgs, '--entrypoint', 'sleep', ALPINE_IMAGE, '300']);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** The three states the mock draws, listed under one stem and in one known order. */
async function createStateFixtures(fixtures: Fixtures, runningArgs: string[] = []): Promise<void> {
  await createWorkingContainer(fixtures.running, runningArgs);
  await createSleepingContainer(fixtures.paused);
  await execFileAsync('docker', ['pause', fixtures.paused]);
  await createSleepingContainer(fixtures.exited);
  await execFileAsync('docker', ['stop', '-t', '0', fixtures.exited]);
}

async function removeStateFixtures(fixtures: Fixtures): Promise<void> {
  for (const name of [fixtures.running, fixtures.paused, fixtures.exited]) await removeContainerQuietly(name);
}

/** Opens the screen narrowed to this spec's own fixtures, at the given viewport. */
async function openNarrowedTo(page: Page, stem: string, expected: number, viewport = DESKTOP): Promise<void> {
  await page.setViewportSize(viewport);
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  await page.getByPlaceholder('Search name, image or state…').fill(stem);
  await expect(containerCards(page)).toHaveCount(expected, { timeout: 20_000 });
}

/** Waits until the sampler has read this card at least once, so a measured figure is under test rather than a gap. */
async function waitForASample(page: Page, name: string): Promise<void> {
  await expect(containerCard(page, name), `${name} never received a sample`).not.toContainText('no sample', { timeout: 25_000 });
}

test.beforeAll(async () => {
  await ensureImage(ALPINE_IMAGE);
});

// REQ-2, REQ-3, REQ-4, REQ-9, REQ-11 — the element map of `containers-refactor-b3.png`, read as
// boxes: the accent down the left edge, the bands in order, the identity row's two ends, the image
// on a line of its own, and the actions in a footer closing the card.
test('the card draws the b3 element map: accent, bands in order, identity at both ends, actions in a footer', async ({ page }) => {
  const fixtures = fixtureNames('map');
  try {
    await createStateFixtures(fixtures, ['-p', '0:5432']);
    await openNarrowedTo(page, fixtures.stem, 3);
    await waitForASample(page, fixtures.running);

    const list = await measureList(page);
    const card = list.cards[0];
    expect(card.name, 'the list is not in the served order, so the card measured is not the one named').toBe(fixtures.running);

    // REQ-2 — a bar of one colour down the left edge, over the card's own box and following its
    // rounding. It is a layer of the surface rather than an element, so it is read as one.
    expect(card.accent, 'the card draws no state accent at all').not.toBeNull();
    expect(card.accent!.barWidth, `the accent bar is ${card.accent!.barWidth}px wide`).toBeGreaterThan(0);
    expect(card.accent!.image, 'the accent is not a bar at the left edge').toMatch(/^linear-gradient\(to right/);
    expect(card.accent!.inset, 'the accent does not run the card’s full height').toBe('0px 0px 0px 0px');
    expect(card.accent!.radius, 'the accent cuts across the corner instead of following the rounding').not.toBe('0px');
    expect(card.accent!.pointerEvents).toBe('none');

    // REQ-9 — four content bands then the footer, in this order, top to bottom.
    expect(card.bands, 'the card carries a content band the b3 arrangement does not name').toHaveLength(4);
    for (let index = 1; index < card.bands.length; index += 1) {
      expect(
        card.bands[index].y,
        `band ${index} (${describeBox(card.bands[index])}) is not below band ${index - 1} (${describeBox(card.bands[index - 1])})`,
      ).toBeGreaterThan(card.bands[index - 1].y);
    }
    expect(card.footer, 'the actions are not in a footer of their own').not.toBeNull();
    expect(card.footer!.y, 'the footer is not the last band of the card').toBeGreaterThan(card.bands[3].y);
    // …and it closes the card: on its bottom edge, spanning it from edge to edge (`surface.md`).
    // Read against the surface's **padding box** — its own hairline is what the footer stops
    // inside, which is the border being drawn over it rather than the footer stopping short.
    expect(round(card.footer!.y + card.footer!.height)).toBeCloseTo(card.box.y + card.box.height - card.border.bottom, 0);
    expect(round(card.footer!.x)).toBeCloseTo(card.box.x + card.border.left, 0);
    expect(round(card.footer!.width)).toBeCloseTo(card.box.width - card.border.left - card.border.right, 0);

    // REQ-3 — the dot and the name at the left of the identity row…
    expect(card.dotBox.x, 'the identity group does not start at the card’s inner left edge').toBeGreaterThanOrEqual(
      card.inner.left - TOLERANCE,
    );
    expect(card.nameBox.x, 'the name is not to the right of the dot').toBeGreaterThan(card.dotBox.x);
    // …and the id anchored at the right, with the detail control beside it, both on that same row.
    expect(card.shortIdBox.x, 'the short id is not anchored to the right of the name').toBeGreaterThan(card.nameBox.x);
    expect(card.detailControl, 'the card carries no detail control').not.toBeNull();
    expect(card.detailControl!.label).toBe(`Open ${fixtures.running} details`);
    expect(card.detailControl!.box.x, 'the detail control is not the last thing on the identity row').toBeGreaterThan(
      card.shortIdBox.x,
    );
    expect(
      round(card.detailControl!.box.x + card.detailControl!.box.width),
      'the identity row does not end at the card’s inner right edge',
    ).toBeCloseTo(card.inner.right, 0);
    for (const [what, element] of [['the id', card.shortIdBox], ['the detail control', card.detailControl!.box]] as const) {
      expect(element.y, `${what} is not on the identity band`).toBeGreaterThanOrEqual(card.bands[0].y - TOLERANCE);
      expect(element.y + element.height, `${what} is not on the identity band`).toBeLessThanOrEqual(
        card.bands[0].y + card.bands[0].height + TOLERANCE,
      );
    }

    // REQ-3, REQ-5, REQ-9 — the state pill and the daemon's own sentence on a line of their own.
    expect(card.pillText).toBe('RUNNING');
    expect(card.pillBox.y, 'the state pill is still on the most prominent line').toBeGreaterThan(card.nameBox.y);
    expect(card.status, 'the card carries no status sentence').not.toBeNull();
    expect(card.status!.text).toMatch(/^Up /);
    expect(card.status!.box.x, 'the uptime is not beside the state pill').toBeGreaterThan(card.pillBox.x);
    expect(Math.abs(card.status!.box.y - card.pillBox.y), 'the uptime is not on the state pill’s own line').toBeLessThanOrEqual(
      Math.max(card.pillBox.height, card.status!.box.height),
    );

    // REQ-5 — the image on a full-width line of its own, sharing it with nothing.
    expect(card.image, 'the image is not a field of its own').not.toBeNull();
    expect(card.image!.text).toContain('alpine:3.20');
    expect(round(card.image!.box.x)).toBeCloseTo(card.inner.left, 0);
    expect(round(card.image!.box.x + card.image!.box.width), 'the image field does not span the card’s inner width').toBeCloseTo(
      card.inner.right,
      0,
    );
    expect(round(card.image!.box.y)).toBeCloseTo(card.bands[2].y, 0);

    // REQ-4 — the footer: the primary action at the left, the segmented cluster flush at the right.
    expect(card.primaryAction, 'the card carries no primary lifecycle action').not.toBeNull();
    expect(card.cluster, 'the card carries no segmented cluster').not.toBeNull();
    const primary = card.primaryAction!;
    const cluster = card.cluster!;
    expect(primary.label).toBe('Stop');
    expect(round(primary.box.x), 'the primary action does not start at the footer’s inner left edge').toBeCloseTo(
      card.footerInner!.left,
      0,
    );
    expect(primary.box.x + primary.box.width, 'the primary action is not to the left of the cluster').toBeLessThanOrEqual(cluster.box.x);
    expect(cluster.box.x - (primary.box.x + primary.box.width), 'there is no gap between the primary action and the cluster').toBeGreaterThan(0);
    expect(
      round(cluster.box.x + cluster.box.width),
      `the cluster ends at ${round(cluster.box.x + cluster.box.width)} and the footer’s inner right edge is at ${round(card.footerInner!.right)}`,
    ).toBeCloseTo(card.footerInner!.right, 0);
    for (const control of [primary.box, cluster.box]) {
      expect(control.y, 'a footer control is not inside the footer').toBeGreaterThanOrEqual(card.footer!.y - TOLERANCE);
    }

    // …and the cluster is one control: `Pause` · `Restart` · `…` sharing a boundary rather than standing apart.
    expect(cluster.segments.map((segment) => segment.label)).toEqual(['Pause', 'Restart', '…']);
    for (let index = 1; index < cluster.segments.length; index += 1) {
      const previous = cluster.segments[index - 1].box;
      const current = cluster.segments[index].box;
      expect(
        current.x - (previous.x + previous.width),
        `slot ${index} stands ${round(current.x - (previous.x + previous.width))}px apart from the one before it instead of sharing its boundary`,
      ).toBeLessThanOrEqual(TOLERANCE);
    }

    // REQ-4, as calibrated 2026-08-25 — **all four controls are one height**, the group owning it:
    // derived per member they came out at 27px and 24px and the cluster's rounded end read as a
    // bulge escaping a boundary it was not in fact sharing (`action-button-group.md`).
    const heights = [primary.box.height, ...cluster.segments.map((segment) => segment.box.height)].map(round);
    console.log(`[REQ-4] the footer's four controls are ${JSON.stringify(heights)}px tall`);
    expect(new Set(heights).size, `the footer's controls are of ${new Set(heights).size} different heights: ${JSON.stringify(heights)}`).toBe(1);
  } finally {
    await removeStateFixtures(fixtures);
  }
});

// REQ-6, REQ-7, REQ-8 — the strip stacked: one metric per row at any width, each spanning the card's
// inner width, the capacity note right-aligned to that width, `NET I/O` on one line, and `PORTS`
// after them on the metrics' own rhythm.
test('the metric strip stacks one metric per row, each spanning the card and ending at its own right edge', async ({ page }) => {
  const fixtures = fixtureNames('strip');
  try {
    await createStateFixtures(fixtures, ['-p', '0:5432']);
    await openNarrowedTo(page, fixtures.stem, 3);
    await waitForASample(page, fixtures.running);

    const list = await measureList(page);
    const card = list.cards[0];
    expect(card.columns).toHaveLength(3);
    const [cpu, memory, netio] = card.columns;

    expect(cpu.label).toBe('CPU');
    expect(memory.label).toBe('MEMORY');
    expect(netio.label).toBe('NET I/O');
    expect(netio.kind).toBe('readings');

    // REQ-6, as amended — three full-width rows, `CPU` over `MEMORY` over `NET I/O`, then `PORTS`.
    for (let index = 1; index < card.columns.length; index += 1) {
      expect(
        card.columns[index].box.y,
        `the ${card.columns[index].label} row is beside the one before it rather than under it`,
      ).toBeGreaterThanOrEqual(card.columns[index - 1].box.y + card.columns[index - 1].box.height - TOLERANCE);
    }
    for (const column of card.columns) {
      expect(round(column.box.x), `${column.label} does not start at the card’s inner left edge`).toBeCloseTo(card.inner.left, 0);
      expect(round(column.box.x + column.box.width), `${column.label} does not span the card’s inner width`).toBeCloseTo(
        card.inner.right,
        0,
      );
    }

    for (const column of [cpu, memory]) {
      // REQ-7 — the label and the value at the left, the capacity note right-aligned to that row's own edge.
      expect(column.labelBox!.x).toBeCloseTo(column.box.x, 0);
      expect(column.valueBox!.x, `${column.label}: the value is not beside its label`).toBeGreaterThan(column.labelBox!.x);
      expect(column.readingBox, `${column.label} carries no capacity note`).not.toBeNull();
      expect(
        round(column.readingBox!.x + column.readingBox!.width),
        `${column.label}: the capacity note ends at ${round(column.readingBox!.x + column.readingBox!.width)} and its row at ${round(column.box.x + column.box.width)}`,
      ).toBeCloseTo(column.box.x + column.box.width, 0);
      // …and the track spans the row's full width, on the line under it.
      expect(column.track, `${column.label} carries no track`).not.toBeNull();
      expect(column.track!.width).toBeCloseTo(column.box.width, 0);
      expect(column.track!.y, `${column.label}: the track is not below its own first line`).toBeGreaterThan(column.labelBox!.y);
    }

    // REQ-6, REQ-8 — stacked, `NET I/O` reads on **one** line: its label at the left, its two
    // readings at the right, which is the rhythm every other row of a stacked strip reads in.
    expect(netio.track, 'NET I/O carries a bar').toBeNull();
    expect(netio.readings.map((reading) => reading.label)).toEqual(['in', 'out']);
    expect(netio.readings[0].box.x).toBeLessThan(netio.readings[1].box.x);
    expect(
      Math.abs(netio.readings[0].box.y - netio.labelBox!.y),
      `NET I/O reads on two lines: its label at y=${round(netio.labelBox!.y)} and its readings at y=${round(netio.readings[0].box.y)}`,
    ).toBeLessThanOrEqual(Math.max(netio.labelBox!.height, netio.readings[0].box.height));
    expect(
      round(netio.readings[1].box.x + netio.readings[1].box.width),
      'the NET I/O readings are not right-aligned to the strip’s own edge',
    ).toBeCloseTo(netio.box.x + netio.box.width, 0);

    // REQ-5, REQ-6 — `PORTS` after them, on the same rhythm: label at the left anchoring the row,
    // the chips right-aligned against the strip's right edge.
    expect(card.ports, 'the card draws no PORTS row').not.toBeNull();
    const ports = card.ports!;
    expect(ports.label).toBe('PORTS');
    expect(ports.box.y, 'the PORTS row is not after NET I/O').toBeGreaterThanOrEqual(netio.box.y + netio.box.height - TOLERANCE);
    expect(round(ports.labelBox.x), 'the PORTS label does not anchor the row at the strip’s left edge').toBeCloseTo(card.inner.left, 0);
    expect(ports.chips.length, 'the PORTS row carries no chip').toBeGreaterThan(0);
    expect(ports.chips[0].text).toMatch(/\d+→5432/);
    const lastChip = ports.chips[ports.chips.length - 1].box;
    expect(round(lastChip.x + lastChip.width), 'the port chips are not right-aligned to the strip’s own edge').toBeCloseTo(
      card.inner.right,
      0,
    );
    // …and on one line, which is the anchored shape the label is there to keep.
    for (const chip of ports.chips) {
      expect(Math.abs(chip.box.y - ports.chips[0].box.y), 'the PORTS row wrapped onto a second line').toBeLessThanOrEqual(TOLERANCE);
    }
  } finally {
    await removeStateFixtures(fixtures);
  }
});

// REQ-1, REQ-10, REQ-22 — the grid: three cards to a row, the cards of a row equal in width and in
// height, a fourth starting a second row, and the metrics at the same x across a row and down a
// column whatever each card holds.
test('the list is a grid of three cards to a row, equal in a row and aligned down a column', async ({ page }) => {
  const stem = `vexel-e2e-card-grid-${Date.now()}`;
  // Four containers, differing in what they hold: the fourth publishes four ports and the third is
  // stopped, so a strip that drifted with its own content would be seen (metric-strip.md).
  const names = ['a', 'b', 'c', 'd'].map((suffix) => `${stem}-${suffix}`);
  try {
    await createSleepingContainer(names[0]);
    await createSleepingContainer(names[1]);
    await createSleepingContainer(names[2]);
    await execFileAsync('docker', ['stop', '-t', '0', names[2]]);
    await createSleepingContainer(names[3], ['-p', '0:5432', '-p', '0:6379', '-p', '0:8080', '-p', '0:9090']);
    await openNarrowedTo(page, stem, names.length);

    const list = await measureList(page);
    expect(list.cards.map((card) => card.name)).toEqual(names);

    // REQ-1 — three to a row at desktop width, the fourth starting a row of its own.
    const firstRow = rowOf(list, 0);
    console.log(`[REQ-1] ${list.cards.length} cards laid ${JSON.stringify(list.cards.map((card) => [round(card.box.x), round(card.box.y)]))}`);
    expect(firstRow.map((card) => card.name), 'the first row does not hold three cards').toEqual(names.slice(0, 3));
    expect(list.cards[3].box.y, 'the fourth card did not start a second row').toBeGreaterThan(
      firstRow[0].box.y + firstRow[0].box.height - TOLERANCE,
    );
    for (let index = 1; index < firstRow.length; index += 1) {
      expect(firstRow[index].box.x, 'two cards of a row overlap').toBeGreaterThanOrEqual(
        firstRow[index - 1].box.x + firstRow[index - 1].box.width - TOLERANCE,
      );
    }
    // …and they are detached by one uniform gap and by nothing else (REQ-1).
    const gaps = firstRow.slice(1).map((card, index) => round(card.box.x - (firstRow[index].box.x + firstRow[index].box.width)));
    expect(new Set(gaps).size, `the cards of a row are separated by ${JSON.stringify(gaps)}`).toBe(1);
    expect(gaps[0], 'the cards are not detached from each other at all').toBeGreaterThan(0);

    // `cards` equalises heights **per row**: every card of a row is as tall as the tallest of them.
    const heights = firstRow.map((card) => round(card.box.height));
    expect(new Set(heights).size, `the cards of a row are of different heights: ${JSON.stringify(heights)}`).toBe(1);
    const widths = firstRow.map((card) => round(card.box.width));
    expect(new Set(widths).size, `the cards of a row are of different widths: ${JSON.stringify(widths)}`).toBe(1);

    // REQ-10, read on the arrangement that exists: within a row the metrics of the same rank sit at
    // the same x, and down a column of the grid they do too — a card whose metrics drift with its
    // own content fails this.
    for (let rank = 0; rank < firstRow[0].columns.length; rank += 1) {
      const reference = firstRow[0].columns[rank];
      for (const card of firstRow.slice(1)) {
        expect(
          round(card.columns[rank].box.x - card.box.x),
          `${card.name}: the ${reference.label} row starts ${round(card.columns[rank].box.x - card.box.x)}px into its card and ${firstRow[0].name}'s ${round(reference.box.x - firstRow[0].box.x)}px into its own`,
        ).toBeCloseTo(reference.box.x - firstRow[0].box.x, 0);
        expect(round(card.columns[rank].box.width), `${card.name}: the ${reference.label} row is a different width`).toBeCloseTo(
          reference.box.width,
          0,
        );
      }
      // Down the column of the grid: the fourth card is under the first.
      expect(round(list.cards[3].columns[rank].box.x), `the ${reference.label} row of the second row’s card is at another x`).toBeCloseTo(
        reference.box.x,
        0,
      );
    }

    // REQ-5 — the many-ported card draws two chips and one `+n`, and its card is the height of its
    // row-mates rather than the height of its port list.
    const many = list.cards[3];
    expect(many.ports!.chips.map((chip) => chip.text)).toHaveLength(3);
    expect(many.ports!.chips[2].text, 'the remainder is not summarised as one count').toMatch(/^\+\d+$/);

    // REQ-22 — every card carries the same bands whatever its state, the `PORTS` row included.
    for (const card of list.cards) {
      expect(card.bands, `${card.name} does not carry the same four content bands`).toHaveLength(4);
      expect(card.footer, `${card.name} carries no footer`).not.toBeNull();
      expect(card.ports, `${card.name} carries no PORTS row`).not.toBeNull();
    }
    // …and the one with no port says so rather than dropping the row.
    expect(list.cards[2].ports!.chips.map((chip) => chip.text)).toEqual(['none']);
  } finally {
    for (const name of names) await removeContainerQuietly(name);
  }
});

// REQ-1, REQ-34 — the grid's two breakpoints: two tracks at ≤1200px, one below the phone breakpoint.
test('the grid drops to two tracks at 1200px and to one at the phone breakpoint', async ({ page }) => {
  const stem = `vexel-e2e-card-tracks-${Date.now()}`;
  const names = ['a', 'b', 'c'].map((suffix) => `${stem}-${suffix}`);
  try {
    for (const name of names) await createSleepingContainer(name);
    await openNarrowedTo(page, stem, names.length, TWO_TRACKS);

    const narrow = await measureList(page);
    expect(rowOf(narrow, 0).map((card) => card.name), `at ${TWO_TRACKS.width}px the row does not hold two cards`).toEqual(
      names.slice(0, 2),
    );
    expect(narrow.cards[2].box.y, 'the third card did not start a second row').toBeGreaterThan(narrow.cards[0].box.y);

    await page.setViewportSize(PHONE);
    const phone = await measureList(page);
    for (let index = 1; index < phone.cards.length; index += 1) {
      expect(
        phone.cards[index].box.y,
        `at ${PHONE.width}px card ${index} is beside the one before it rather than under it`,
      ).toBeGreaterThanOrEqual(phone.cards[index - 1].box.y + phone.cards[index - 1].box.height - TOLERANCE);
      expect(round(phone.cards[index].box.x)).toBeCloseTo(phone.cards[0].box.x, 0);
    }
  } finally {
    for (const name of names) await removeContainerQuietly(name);
  }
});

// REQ-16 — a metric with no sample against a measured one, told apart on sight: the value, the
// capacity note and the track, all three.
test('a card with no sample is drawn unlike a measured one, and unlike a measured zero', async ({ page }) => {
  const fixtures = fixtureNames('nosample');
  try {
    await createStateFixtures(fixtures);
    await openNarrowedTo(page, fixtures.stem, 3);
    await waitForASample(page, fixtures.running);

    const list = await measureList(page);
    const measured = list.cards.find((card) => card.name === fixtures.running)!;
    const unmeasured = list.cards.find((card) => card.name === fixtures.exited)!;

    for (const column of unmeasured.columns.slice(0, 2)) {
      expect(column.value, `${column.label} on a stopped container states a figure`).toBe('—');
      expect(column.reading).toBe('no sample');
      expect(column.trackClass, `${column.label}: the empty track is not drawn as the unmeasured state`).toContain('ui-meter__track--no-sample');
      expect(column.fill, `${column.label}: an unmeasured metric draws a fill`).toBeNull();
      // The track is still drawn — an unmeasured metric is stated, not omitted.
      expect(column.track!.width).toBeGreaterThan(0);
    }
    for (const reading of unmeasured.columns[2].readings) expect(reading.value).toBe('—');

    for (const column of measured.columns.slice(0, 2)) {
      expect(column.value, `${column.label} on a running container reads as unmeasured`).not.toBe('—');
      expect(column.reading, `${column.label} has lost its capacity note`).toMatch(/^of /);
      expect(column.trackClass).not.toContain('no-sample');
    }

    // REQ-13 — a non-zero measurement stays visible rather than rounding away: the memory of a
    // running container is a tiny fraction of the host's, and it is still drawn.
    const memory = measured.columns[1];
    expect(memory.fill, 'the memory track of a running container draws no fill').not.toBeNull();
    expect(
      memory.fill!.width,
      `the memory fill is ${round(memory.fill!.width)}px wide — a measurement that exists has rounded away to nothing`,
    ).toBeGreaterThanOrEqual(1);
    console.log(
      `[REQ-13] ${fixtures.running}: ${memory.value} ${memory.reading} → a fill of ${round(memory.fill!.width)}px in a ${round(memory.track!.width)}px track`,
    );
  } finally {
    await removeStateFixtures(fixtures);
  }
});

// REQ-18, REQ-19 — the accent, the dot and the pill derive from **one** state and always agree, the
// metric fills take that same state, and no two states are drawn alike. The agreement is read where
// it is decided (the tone each carrier was given) and the difference where it is painted (the
// accent's own colour): a rule mapping two states to one tone passes every content assertion there
// is.
test('the accent, the dot and the pill are one state per card, and no two states are drawn alike', async ({ page }) => {
  const fixtures = fixtureNames('tone');
  try {
    await createStateFixtures(fixtures);
    await openNarrowedTo(page, fixtures.stem, 3);
    await waitForASample(page, fixtures.running);

    const list = await measureList(page);
    const tones = list.cards.map((card) => ({
      name: card.name,
      pill: card.pillText,
      accentTone: card.accentTone,
      dotTone: card.dotTone,
      pillTone: card.pillTone,
      fillTones: card.fillTones,
      accentColour: card.accent?.colour ?? '',
      dotColour: card.dotColour,
    }));
    console.log(`[REQ-18] ${JSON.stringify(tones)}`);

    for (const tone of tones) {
      expect(tone.accentTone, `${tone.name} carries no state accent`).not.toBe('');
      expect(tone.dotTone, `${tone.name}: the dot is ${tone.dotTone} and the accent ${tone.accentTone}`).toBe(tone.accentTone);
      expect(tone.pillTone, `${tone.name}: the pill is ${tone.pillTone} and the accent ${tone.accentTone}`).toBe(tone.accentTone);
      for (const fill of tone.fillTones) {
        expect(fill, `${tone.name}: a metric fill is ${fill} and the card's state ${tone.accentTone}`).toBe(tone.accentTone);
      }
    }

    expect(tones.map((tone) => tone.pill)).toEqual(['RUNNING', 'PAUSED', 'EXITED']);
    expect(tones.map((tone) => tone.accentTone)).toEqual(['success', 'warning', 'neutral']);
    // …and the three are told apart on sight, which is the half a tone class cannot say.
    for (const tone of tones) expect(tone.accentColour, `${tone.name}: the accent's colour could not be read`).toMatch(/^rgba?\(/);
    expect(new Set(tones.map((tone) => tone.accentColour)).size, 'two of the three states are painted the same colour').toBe(3);
    for (const tone of tones) {
      expect(tone.dotColour, `${tone.name}: the dot is painted ${tone.dotColour} and the accent ${tone.accentColour}`).toBe(
        tone.accentColour,
      );
    }
  } finally {
    await removeStateFixtures(fixtures);
  }
});

// REQ-15, REQ-17, REQ-36 — the metrics are live and land in place: the numbers change, the card does
// not move, the list does not reorder, no neighbour is disturbed, and nothing is tweened.
//
// **And the ports hold still while they do**, which is the half a value assertion cannot see: the
// daemon's port order is not stable across reads, so a card drawing a subset drew a *different*
// subset each poll; and the daemon reports a dual-stack publication twice, which gave the chips
// duplicate keys and accumulated them in the DOM on every poll (4 ports measured at 57 chips).
test('a live update changes the numbers, moves nothing, and leaves the ports exactly as they were', async ({ page }) => {
  const fixtures = fixtureNames('live');
  try {
    await createStateFixtures(fixtures, ['-p', '0:5432', '-p', '0:6379', '-p', '0:8080', '-p', '0:9090']);
    await openNarrowedTo(page, fixtures.stem, 3);
    await waitForASample(page, fixtures.running);

    const before = await measureList(page);
    const readingOf = (list: ListGeometry, name: string): string =>
      JSON.stringify(list.cards.find((card) => card.name === name)!.columns.map((column) => [column.value, column.readings.map((one) => one.value)]));

    const portsBefore = before.cards.find((card) => card.name === fixtures.running)!.ports!.chips.map((chip) => chip.text);
    expect(portsBefore, 'the many-ported card does not draw two chips and a count').toHaveLength(3);

    // The fixture works every second, so its CPU reading is a live number: waited for rather than
    // provoked, because what is under test is the update the sampler already produces.
    await expect
      .poll(async () => readingOf(await measureListThisFrame(page), fixtures.running), { timeout: 40_000, intervals: [1_000] })
      .not.toBe(readingOf(before, fixtures.running));

    const after = await measureList(page);

    expect(after.cards.map((card) => card.name), 'the list reordered under a live update').toEqual(
      before.cards.map((card) => card.name),
    );
    for (const card of before.cards) {
      const now = after.cards.find((candidate) => candidate.name === card.name)!;
      expect(
        { x: round(now.box.x), y: round(now.box.y), width: round(now.box.width) },
        `${card.name} moved on a live update: from (${describeBox(card.box)}) to (${describeBox(now.box)})`,
      ).toEqual({ x: round(card.box.x), y: round(card.box.y), width: round(card.box.width) });
      // The metrics land in place too: a value redrawn where it stood, not a strip re-laid out.
      for (let index = 0; index < card.columns.length; index += 1) {
        expect(round(now.columns[index].box.x), `${card.name}: the ${card.columns[index].label} row moved`).toBeCloseTo(
          card.columns[index].box.x,
          0,
        );
      }
      // Nothing accumulates in the DOM under a poll: the chip count is what it was.
      expect(now.chipCount, `${card.name}: the chips accumulated from ${card.chipCount} to ${now.chipCount} over one poll`).toBe(
        card.chipCount,
      );
    }

    // The two chips a card draws are the same two while the operator watches: read again over
    // several polls, because one read cannot see an order that rotates between them.
    for (let poll = 0; poll < 3; poll += 1) {
      const now = await measureList(page);
      const card = now.cards.find((candidate) => candidate.name === fixtures.running)!;
      expect(card.ports!.chips.map((chip) => chip.text), `the port chips changed on poll ${poll + 1}`).toEqual(portsBefore);
      await page.waitForTimeout(1_500);
    }

    // REQ-17 — nothing on this surface is tweened between samples.
    for (const card of after.cards) {
      expect(card.animated, `${card.name} carries a transition or an animation`).toEqual([]);
    }
  } finally {
    await removeStateFixtures(fixtures);
  }
});

// REQ-32, REQ-33, REQ-35 — what the presentation costs and what it stays legible as: no blur and no
// per-card compositing beyond the material's own, nothing clipped, nothing drawn transparent, and a
// measured scroll at a realistic count.
test('a list of cards costs no blur, clips nothing and scrolls as one', async ({ page }) => {
  const stem = `vexel-e2e-card-scroll-${Date.now()}`;
  const names = Array.from({ length: 12 }, (_, index) => `${stem}-${String(index).padStart(2, '0')}`);
  try {
    for (const name of names) await createSleepingContainer(name);
    await openNarrowedTo(page, stem, names.length, DESKTOP);

    const list = await measureList(page);
    for (const card of list.cards) {
      // REQ-33 — this screen is main view, and nothing on it blurs.
      expect(card.blurred, `${card.name} computes a blur: ${card.blurred.join(', ')}`).toEqual([]);
      // REQ-17 / REQ-32 — no transition and no animation, so a scrolled card repaints and no more.
      expect(card.animated, `${card.name} carries a transition or an animation`).toEqual([]);
      // REQ-35 — nothing the card draws is painted outside the card that holds it.
      expect(card.clipped, `${card.name} paints text outside its own box: ${card.clipped.join(' | ')}`).toEqual([]);
    }

    // REQ-32 — the list scrolls as one surface: every card moves by the same amount, and the frames
    // it takes are reported rather than guessed at.
    const scroller = page.locator('.ui-frame__content');
    await scroller.hover();
    const timing = await page.evaluate(async () => {
      const frames: number[] = [];
      let last = performance.now();
      let stop = false;
      const tick = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        if (!stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      stop = true;
      return frames;
    });
    await page.mouse.wheel(0, 600);
    const afterScroll = await measureList(page);
    const shifts = afterScroll.cards.map((card, index) => round(list.cards[index].box.y - card.box.y));
    console.log(
      `[REQ-32] ${names.length} cards over ${new Set(list.cards.map((card) => round(card.box.y))).size} rows: every card shifted by ${JSON.stringify([...new Set(shifts)])}px; frame intervals over 1.2s: max ${round(Math.max(...timing))}ms, median ${round(timing.sort((a, b) => a - b)[Math.floor(timing.length / 2)])}ms`,
    );
    expect(new Set(shifts).size, `the cards did not move together: ${JSON.stringify(shifts)}`).toBe(1);
    expect([...new Set(shifts)][0], 'the wheel over the list scrolled nothing at all').not.toBe(0);
  } finally {
    for (const name of names) await removeContainerQuietly(name);
  }
});

// REQ-34 — the same map at 375×812: one card per row, the metrics in the arrangement they were
// already in, the footer's cluster wrapping within the footer, nothing clipped, nothing needing a
// sideways drag, and no value the desktop shows missing.
test('at 375×812 the card reflows and carries the same values as at desktop width', async ({ page }) => {
  const fixtures = fixtureNames('phone');
  try {
    await createStateFixtures(fixtures, ['-p', '0:5432', '-p', '0:6379']);
    await openNarrowedTo(page, fixtures.stem, 3, DESKTOP);
    await waitForASample(page, fixtures.running);
    const desktop = await measureList(page);

    await page.setViewportSize(PHONE);
    await expect(containerCards(page)).toHaveCount(3);
    const phone = await measureList(page);

    const wide = desktop.cards.find((card) => card.name === fixtures.running)!;
    const narrow = phone.cards.find((card) => card.name === fixtures.running)!;

    // The same values, both times: no reduced metric set on the phone.
    const values = (card: CardGeometry): string[] =>
      card.columns.flatMap((column) => [column.label, column.value ?? '', column.reading ?? '', ...column.readings.map((one) => `${one.label} ${one.value}`)]);
    expect(values(narrow).map((value) => value.replace(/[\d.]+/g, '#'))).toEqual(values(wide).map((value) => value.replace(/[\d.]+/g, '#')));
    expect(narrow.ports!.chips.map((chip) => chip.text), 'the phone card drops a port chip').toEqual(
      wide.ports!.chips.map((chip) => chip.text),
    );
    expect(narrow.image!.text, 'the phone card drops the image reference').toBe(wide.image!.text);
    expect(narrow.shortId, 'the phone card drops the short id').toBe(wide.shortId);
    expect(narrow.status?.text, 'the phone card drops the status sentence').toBe(wide.status?.text);
    expect(narrow.pillText).toBe(wide.pillText);
    expect(narrow.detailControl?.label, 'the phone card drops the detail control').toBe(wide.detailControl?.label);

    // The bands are the same bands, in the same order, each full width.
    expect(narrow.bands).toHaveLength(wide.bands.length);
    expect(narrow.columns).toHaveLength(3);
    for (let index = 1; index < narrow.columns.length; index += 1) {
      expect(
        narrow.columns[index].box.y,
        `at 375px the ${narrow.columns[index].label} row is beside the one before it rather than under it`,
      ).toBeGreaterThan(narrow.columns[index - 1].box.y + narrow.columns[index - 1].box.height - TOLERANCE);
      expect(round(narrow.columns[index].box.x)).toBeCloseTo(narrow.columns[0].box.x, 0);
      expect(round(narrow.columns[index].box.width)).toBeCloseTo(narrow.columns[0].box.width, 0);
    }
    for (const column of narrow.columns.slice(0, 2)) {
      expect(column.track, `at 375px the ${column.label} row lost its track`).not.toBeNull();
      expect(column.reading, `at 375px the ${column.label} row lost its capacity note`).not.toBeNull();
    }

    // The cluster keeps its order and its segmented geometry, inside the footer that holds it.
    expect(narrow.cluster!.segments.map((segment) => segment.label)).toEqual(['Pause', 'Restart', '…']);
    expect(narrow.cluster!.box.y, 'the cluster left the footer at 375px').toBeGreaterThanOrEqual(narrow.footer!.y - TOLERANCE);
    expect(
      narrow.cluster!.box.y + narrow.cluster!.box.height,
      'the cluster overflows the footer at 375px',
    ).toBeLessThanOrEqual(narrow.footer!.y + narrow.footer!.height + TOLERANCE);
    for (let index = 1; index < narrow.cluster!.segments.length; index += 1) {
      const previous = narrow.cluster!.segments[index - 1].box;
      const current = narrow.cluster!.segments[index].box;
      expect(current.x - (previous.x + previous.width), 'the cluster lost its shared boundary at 375px').toBeLessThanOrEqual(TOLERANCE);
    }

    // REQ-34 — "no value is clipped to nothing, none is hidden with no route to it": the name and
    // the image reference are the two the arrangement lets give way, and each carries its whole
    // value as its `title`.
    const narrowCard = containerCard(page, fixtures.running);
    await expect(narrowCard.locator('.ui-section-header__title')).toHaveAttribute('title', fixtures.running);
    expect(narrow.image!.title, 'the truncated image reference has no route to its whole value').toContain('alpine:3.20');

    // Nothing clipped, nothing off the card, and no horizontal scrolling anywhere.
    for (const card of phone.cards) {
      expect(card.clipped, `${card.name} paints text outside its own box at 375px: ${card.clipped.join(' | ')}`).toEqual([]);
      expect(card.box.x + card.box.width, `${card.name} is wider than the viewport`).toBeLessThanOrEqual(PHONE.width + TOLERANCE);
    }
    expect(
      phone.documentScrollWidth,
      `the page scrolls sideways at 375px: ${phone.documentScrollWidth} against ${phone.documentClientWidth}`,
    ).toBeLessThanOrEqual(phone.documentClientWidth + TOLERANCE);
  } finally {
    await removeStateFixtures(fixtures);
  }
});

// REQ-23, REQ-37 — the panel spans the whole row of the grid and opens beneath the row that holds
// the selected card, the cards below moving down. Driven with a real pointer at the card's own
// coordinates, and asserted on the boxes: a panel that opened somewhere else says exactly what a
// panel that opened in place says, in text.
test('the detail panel spans the row and opens beneath the row that owns it', async ({ page }) => {
  const stem = `vexel-e2e-card-panel-${Date.now()}`;
  const names = ['a', 'b', 'c', 'd'].map((suffix) => `${stem}-${suffix}`);
  try {
    for (const name of names) await createSleepingContainer(name);
    await openNarrowedTo(page, stem, names.length);

    const before = await measureList(page);
    const firstRow = rowOf(before, 0);
    expect(firstRow).toHaveLength(3);

    // The first card of the row, so "beneath the row" is a different place from "beneath the card".
    await clickAt(page, containerCard(page, names[0]).getByRole('heading', { name: names[0] }), `the name on the card of ${names[0]}`);
    const panel = page.locator('.ui-frame__content .ui-detail-panel');
    await expect(panel).toBeVisible();
    const panelBox = await boxOf(panel, 'the container detail panel');
    const after = await measureList(page);
    const owner = after.cards.find((candidate) => candidate.name === names[0])!;

    // It spans the whole row of the grid, not the width of one card.
    expect(round(panelBox.width), `the panel is ${round(panelBox.width)}px wide and the grid ${round(after.grid!.width)}px`).toBeCloseTo(
      after.grid!.width,
      0,
    );
    expect(round(panelBox.x)).toBeCloseTo(after.grid!.x, 0);

    // …and it opens beneath the **row** that holds the card: below it, and below its row-mates, who
    // stay on the row they were on.
    expect(panelBox.y, `the panel is at y=${round(panelBox.y)} and its card ends at ${round(owner.box.y + owner.box.height)}`).toBeGreaterThanOrEqual(
      owner.box.y + owner.box.height - TOLERANCE,
    );
    // Soft, so the rest of the map is measured in the same run rather than stopping at the first
    // card that moved: what the panel does to the row it opens under is one fact, and the run has
    // several more to report about it.
    for (const mate of firstRow.slice(1)) {
      const now = after.cards.find((candidate) => candidate.name === mate.name)!;
      expect
        .soft(
          round(now.box.y + after.scrollTop),
          `${mate.name} left the row of the card whose panel opened: it was at y=${round(mate.box.y + before.scrollTop)} and is now at ${round(now.box.y + after.scrollTop)}`,
        )
        .toBeCloseTo(mate.box.y + before.scrollTop, 0);
      expect
        .soft(panelBox.y, `the panel opened above ${mate.name}, which shares the row of the card that owns it`)
        .toBeGreaterThanOrEqual(now.box.y + now.box.height - TOLERANCE);
    }
    // The card that followed the row moved down, and did not stay where the panel now is.
    const below = after.cards.find((candidate) => candidate.name === names[3])!;
    expect(below.box.y, 'the panel does not sit between the row that owns it and the next one').toBeGreaterThanOrEqual(
      panelBox.y + panelBox.height - TOLERANCE,
    );

    // Selecting the same card again closes it (REQ-23), leaving the list as it was.
    await clickAt(page, containerCard(page, names[0]).getByRole('heading', { name: names[0] }), `the name on the card of ${names[0]}`);
    await expect(panel).toHaveCount(0);
    const closed = await measureList(page);
    for (let index = 0; index < before.cards.length; index += 1) {
      expect(
        round(closed.cards[index].box.y + closed.scrollTop),
        `${before.cards[index].name} did not go back where it was`,
      ).toBeCloseTo(before.cards[index].box.y + before.scrollTop, 0);
    }
  } finally {
    for (const name of names) await removeContainerQuietly(name);
  }
});

/**
 * REQ-3, REQ-23, REQ-37 — **the detail control is present and does nothing, and that is a decision,
 * not a defect** (`container-card.md`, the human's, 2026-08-25): it renders with an accessible name,
 * it is **not** disabled, its click arrives with the intervention that moves the detail into a
 * modal, and it swallows that click so the card's selection gesture is not triggered by a control
 * that will mean something else.
 *
 * Driven with a **real pointer at the control's own coordinates** and asserted on the **viewport
 * box** either side of the press: a check that measures content cannot detect a defect that moves
 * position, and a surface dragged out of the viewport keeps every character it had (CLAUDE.md).
 */
test('the detail control is present, not disabled, and changes nothing at all when pressed', async ({ page }) => {
  const stem = `vexel-e2e-card-inert-${Date.now()}`;
  const name = `${stem}-a`;
  try {
    await createSleepingContainer(name);
    await openNarrowedTo(page, stem, 1);

    // Brought into view **before** the reading, so the box compared either side of the press is the
    // press's own doing and not the scroll this file performed to aim at the control.
    const control = containerCard(page, name).getByRole('button', { name: `Open ${name} details`, exact: true });
    await control.scrollIntoViewIfNeeded();

    const before = await measureList(page);
    const card = before.cards[0];
    expect(card.detailControl, 'the card carries no detail control').not.toBeNull();
    expect(card.detailControl!.label).toBe(`Open ${name} details`);
    expect(card.detailControl!.disabled, 'the detail control ships disabled, which was the alternative refused').toBe(false);
    // A 24×24 box with the tighter radius of the scale, beside a name it must not tower over.
    expect(round(card.detailControl!.box.width)).toBe(round(card.detailControl!.box.height));
    console.log(
      `[REQ-3] the detail control is ${describeBox(card.detailControl!.box)} beside a name ${round(card.nameBox.height)}px tall`,
    );

    await clickAt(page, control, 'the detail control');
    await page.waitForTimeout(500);

    // Nothing opened, and the card was not selected by it (REQ-23).
    await expect(page.locator('.ui-frame__content .ui-detail-panel')).toHaveCount(0);
    await expect(page.locator('.ui-surface--selected')).toHaveCount(0);

    // …and the card is where it was, with the control still inside the viewport: the half of this a
    // content assertion cannot see.
    const after = await measureList(page);
    const inDocument = (list: ListGeometry) => ({
      x: round(list.cards[0].box.x),
      y: round(list.cards[0].box.y + list.scrollTop + list.windowScrollY),
      width: round(list.cards[0].box.width),
    });
    expect(
      inDocument(after),
      `the card moved when the inert control was pressed: from (${describeBox(card.box)}) to (${describeBox(after.cards[0].box)})`,
    ).toEqual(inDocument(before));
    const now = after.cards[0].detailControl!.box;
    expect(now.y, `the control it pressed is at y=${round(now.y)}, outside the viewport`).toBeGreaterThanOrEqual(0);
    expect(now.y + now.height).toBeLessThanOrEqual(after.viewport.height);
    expect(now.x).toBeGreaterThanOrEqual(0);
    expect(now.x + now.width).toBeLessThanOrEqual(after.viewport.width);
  } finally {
    await removeContainerQuietly(name);
  }
});
