/**
 * **The Config tab in reading, measured** — `…-tabs_composition_refactor/REQ-18` … `REQ-22` as the
 * second and third passes amend them: REQ-48, REQ-50 … REQ-57 and REQ-59, under REQ-40, REQ-44 and
 * REQ-45.
 *
 * Nearly everything this file covers is a claim about **position**, not about text: `Edit
 * configuration` sits at the foot of the tab (REQ-50), an environment value begins where its own
 * field begins and stays on one line (REQ-54), no field of a mount takes more than half its row
 * (REQ-57), and a card at the edge of the scrolled region draws the whole of its drop shadow
 * (REQ-53). "The keys are listed", "a chip says `ro`" and "the action is on screen" are all true of
 * arrangements these requirements replace, so every one of them is asserted here as a box the
 * browser reports; the content assertions stand beside them, never instead of them (CLAUDE.md,
 * "What a check drives, and what it measures").
 *
 * **Two expectations of this file are reversed by the contract, not weakened.** It used to place
 * the action at the *head* of the tab (REQ-22) and to assert that a container with no mounts is
 * shown *no* `Mounts` heading (REQ-49). REQ-50 and REQ-51 amend both; the checks are rewritten
 * against the new arrangement rather than deleted (REQ-43), and the reason is recorded on each.
 *
 * What jsdom can answer — which groups are drawn, what each heading claims, how a `KEY=value`
 * string is split, what each field is called — is asserted in
 * `client/test/unit/container-detail-panel.test.tsx`, and is not repeated here.
 *
 * **The fixtures are this file's own** (REQ-45), all carrying the ownership labels and all removed
 * in a `finally` with `docker rm -fv`:
 * - a container created and never started, from the suite's own `vexel-test-tiny:1`, with an
 *   environment whose keys are of markedly different lengths, one value carrying an `=` of its own,
 *   one key longer than its field; **two published ports**, so the port group has two entries with
 *   real host numbers (nothing is bound: a created container reserves no port on the host); and
 *   **three bind mounts**, one whose source fits inside half a row and two whose sources do not,
 *   which is what makes REQ-57's cap and its column falsifiable.
 * - a container created with nothing at all, for the three collection groups that must be drawn
 *   anyway (REQ-51).
 * - a **running** container published with `-P`, whose host port the daemon chose (REQ-59). Running
 *   on purpose, and published this way on purpose: `docker run -P` fills `HostConfig.PortBindings`
 *   with `{}` and puts the whole publication in `NetworkSettings.Ports`, so it is the container the
 *   tab used to show nothing at all for.
 * - a **running** container that exposes a port and publishes none (REQ-59's "and only those").
 *   What it must produce here is the *absence* of an entry.
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { boxOf, boxesOf, clickAtItsCentre } from './support/settled.js';
import { measureFieldList, reportFieldList, widestShare, type FieldListGeometry } from './support/field-entries.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { containerCard, containerDetail, openContainerDetail } from './support/container-cards.js';

const CASE_NAME = 'container-detail-config-reading';

/**
 * Keys of one, eight, four, twelve and fifty-nine characters. The spread is the point: under the
 * arrangement REQ-54 replaces, every value began at one fixed offset whatever its key measured, and
 * under the one before that every value began where its own key ended. A constant *field* edge
 * across these five entries is reachable only by the geometry REQ-54 asks for.
 *
 * `DATABASE_URL`'s value carries an `=` of its own (the "first `=` only" split), and the long key is
 * the one a field has to wrap rather than shrink or truncate.
 */
const LONG_KEY = 'A_VERY_LONG_ENVIRONMENT_VARIABLE_NAME_THAT_OUTRUNS_ITS_TRACK';
const FIXTURE_ENV: Record<string, string> = {
  A: '1',
  NODE_ENV: 'production',
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  DATABASE_URL: 'postgres://user:secret@db.internal:5432/shop?sslmode=require&retry=1',
  [LONG_KEY]: 'short',
};

/** Two published ports, on host numbers high enough not to collide — and never bound: the container never starts. */
const PUBLISHED_PORTS: { container: number; host: number }[] = [
  { container: 443, host: 41443 },
  { container: 80, host: 41080 },
];

/** The port the two running fixtures state — published by the daemon in one, published nowhere in the other. */
const EXPOSED_PORT = 5000;

/** A port the REQ-60 fixture only declares: it binds nothing on the host, so neither reading may name it. */
const MERELY_EXPOSED_PORT = 7777;

const SHORT_DESTINATION = '/mnt/short-target';
const READ_ONLY_DESTINATION = '/mnt/ro-target';
const WRITABLE_DESTINATION = '/mnt/rw-target';

/**
 * A viewport whose dialog gives the tab's full-width groups a row of roughly 1150px — the width the
 * human's own measurements were taken at, and wide enough that a value of this fixture's length has
 * room for one line (REQ-54).
 */
const DESKTOP = { width: 1440, height: 900 };

/** `--shadow-2`, the elevation a `Card` of this tab carries: `0 8px 24px`. */
interface ShadowReach {
  top: number;
  bottom: number;
  side: number;
}

interface ConfigFixture {
  name: string;
  base: string;
  shortSource: string;
  readOnlySource: string;
  writableSource: string;
}

/**
 * A container of this file's own, created and never started: the detail reads inspect data, and
 * nothing here needs a process. Binds rather than volumes — a bind creates nothing on the daemon to
 * be swept, and the directories behind it are removed with the container.
 */
async function createConfigFixture(name: string): Promise<ConfigFixture> {
  await ensureImage(TINY_IMAGE);
  // A prefix of three characters, not a descriptive one: this directory **is** the short mount's
  // source, and what makes it short is its whole path. The system temporary directory already
  // contributes some fifty characters of its own on this platform, and a source that does not fit
  // inside half a row cannot show that a source which fits is left unwrapped (REQ-56).
  const base = await mkdtemp(join(tmpdir(), 'vx-'));
  const shortSource = base;
  // Two sources long enough to want more than half of a full-width row, and of different lengths:
  // the cap has to hold them at the same boundary anyway, which is REQ-57's whole claim.
  const readOnlySource = join(base, `ro-${'x'.repeat(48)}`, `deep-${'y'.repeat(32)}`);
  const writableSource = join(base, `rw-${'x'.repeat(36)}`, `deep-${'y'.repeat(24)}`);
  for (const source of [readOnlySource, writableSource]) await mkdir(source, { recursive: true });
  await execFileAsync('docker', [
    'create',
    '--name',
    name,
    ...ownershipArgs(CASE_NAME),
    ...Object.entries(FIXTURE_ENV).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
    ...PUBLISHED_PORTS.flatMap((port) => ['-p', `${port.host}:${port.container}`]),
    '-v',
    `${shortSource}:${SHORT_DESTINATION}`,
    '-v',
    `${readOnlySource}:${READ_ONLY_DESTINATION}:ro`,
    '-v',
    `${writableSource}:${WRITABLE_DESTINATION}`,
    TINY_IMAGE,
  ]);
  return { name, base, shortSource, readOnlySource, writableSource };
}

/** A container stating nothing at all: no port, no mount — the state REQ-51 is about. */
async function createBareFixture(name: string): Promise<void> {
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', ['create', '--name', name, ...ownershipArgs(CASE_NAME), TINY_IMAGE]);
}

/** A running container exposing a port and publishing none — REQ-59's "and only those" case. */
async function createExposedFixture(name: string): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    ...ownershipArgs(CASE_NAME),
    '--expose',
    String(EXPOSED_PORT),
    '--entrypoint',
    'sleep',
    ALPINE_IMAGE,
    '300',
  ]);
}

/**
 * A running container whose publication the **daemon** numbered (`-P`), and the host port it chose.
 *
 * The number is read back from the daemon rather than asked for, because it is the daemon's to pick;
 * it is what the tab has to state (REQ-59).
 */
async function createDaemonPublishedFixture(name: string): Promise<number> {
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    ...ownershipArgs(CASE_NAME),
    '--expose',
    String(EXPOSED_PORT),
    '-P',
    '--entrypoint',
    'sleep',
    ALPINE_IMAGE,
    '300',
  ]);
  const { stdout } = await execFileAsync('docker', ['port', name, `${EXPOSED_PORT}/tcp`]);
  return Number(stdout.trim().split('\n')[0].split(':').pop());
}

/**
 * A running container that **publishes and exposes at once**, published in the third "the daemon
 * chooses" spelling: `-p 0:N` is stored as a literal `HostPort: "0"`, which is not a host port in
 * force (`containers-service.md`). The number the daemon actually chose is read back and returned,
 * because it is what both readings have to state (REQ-59, REQ-60).
 */
async function createPublishingAndExposingFixture(name: string): Promise<number> {
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    ...ownershipArgs(CASE_NAME),
    '-p',
    `0:${EXPOSED_PORT}`,
    '--expose',
    String(MERELY_EXPOSED_PORT),
    '--entrypoint',
    'sleep',
    ALPINE_IMAGE,
    '300',
  ]);
  const { stdout } = await execFileAsync('docker', ['port', name, `${EXPOSED_PORT}/tcp`]);
  return Number(stdout.trim().split('\n')[0].split(':').pop());
}

async function removeFixture(fixture: ConfigFixture | { name: string }): Promise<void> {
  // `-v` and never a bare `-f`: an anonymous volume the daemon attached on its own behalf outlives
  // the container carrying no label of ours, invisible to any later sweep.
  await execFileAsync('docker', ['rm', '-fv', fixture.name]).catch(() => undefined);
  if ('base' in fixture) await rm(fixture.base, { recursive: true, force: true }).catch(() => undefined);
}

/** Opens the detail of the container the test created, at a stated viewport, on the tab it opens on. */
async function openConfigTab(page: Page, name: string, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  // Searched for rather than looked for in the list: the operator's own containers are none of this
  // file's business, and the list may hold hundreds of them.
  await page.getByPlaceholder('Search name, image or state…').fill(name);
  await expect(containerCard(page, name), 'the fixture container never appeared in the list').toBeVisible({ timeout: 20_000 });
  await openContainerDetail(page, name);
  await expect(editAction(page), 'the Config tab never finished loading its inspect data').toBeVisible({ timeout: 20_000 });
}

/**
 * A group's own field list, located through the heading an operator reads and the sibling it
 * titles, so the check names what the requirement names rather than an internal class of the
 * group's own.
 */
function groupList(page: Page, title: string): Locator {
  return containerDetail(page).locator(`.ui-section-header:has(.ui-section-header__title:text-is("${title}")) + .ui-field-list`);
}

/** What a group with nothing in it draws where its list would be (REQ-51). */
function groupPlaceholder(page: Page, title: string): Locator {
  return containerDetail(page).locator(`.ui-section-header:has(.ui-section-header__title:text-is("${title}")) + .ui-empty-state`);
}

/** The card a group is drawn inside — the surface whose trailing edge the action lines up with. */
function groupCard(page: Page, title: string): Locator {
  return containerDetail(page)
    .locator('.ui-surface')
    .filter({ has: page.locator(`.ui-section-header__title:text-is("${title}")`) })
    .last();
}

/**
 * Every section heading of the tab's own body, in the order it draws them, each with what it claims
 * in the header's trailing slot. The dialog's header is a `SectionHeader` too — it carries the
 * container's name and its state pills — and is left out: it heads the dialog, not the tab.
 */
async function headings(page: Page): Promise<{ title: string; count: string }[]> {
  return await containerDetail(page)
    .locator('.ui-section-header')
    .evaluateAll((headers) =>
      headers
        .filter((header) => header.closest('.ui-modal__title') === null)
        .map((header) => ({
          title: header.querySelector('.ui-section-header__title')?.textContent ?? '',
          count: header.querySelector('.ui-badge')?.textContent ?? '',
        })),
    );
}

/** The action REQ-50 moves, and the last card it must sit below. */
function editAction(page: Page): Locator {
  return containerDetail(page).getByRole('button', { name: 'Edit configuration', exact: true });
}

/** The tab's scrolled region — the one REQ-53 gives room to. */
function scrolledRegion(page: Page): Locator {
  return containerDetail(page).locator('.ui-scroll-area').first();
}

/**
 * How far a surface's own drop shadow reaches beyond it, read from the shadow the surface actually
 * carries rather than from a number written here: `0 <dy> <blur>` reaches `blur` sideways,
 * `blur − dy` above and `blur + dy` below. This is the room REQ-53 asks the region to leave, so it
 * is derived from the same thing the region is sized against.
 */
async function shadowReachOf(surface: Locator): Promise<ShadowReach> {
  const reach = await surface.evaluate((element) => {
    const outer = getComputedStyle(element)
      .boxShadow.split(/,(?![^(]*\))/)
      .map((part) => part.trim())
      .find((part) => !part.startsWith('inset'));
    const lengths = [...(outer ?? '').matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));
    if (lengths.length < 3) return null;
    const [, dy, blur] = lengths;
    return { top: Math.max(0, blur - dy), bottom: blur + dy, side: blur };
  });
  expect(reach, 'the tab’s cards carry no drop shadow at all, so there is nothing for the region to leave room for').not.toBeNull();
  return reach!;
}

/** The room the scrolled region leaves around what it scrolls, on each side, in the scroll direction too. */
async function regionRoom(region: Locator): Promise<{ top: number; bottom: number; left: number; right: number; gutter: string }> {
  return await region.evaluate((element) => {
    const content = element.firstElementChild!;
    const regionBox = element.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return {
      top: contentBox.top - regionBox.top + element.scrollTop,
      bottom: element.scrollHeight - (contentBox.bottom - regionBox.top + element.scrollTop),
      left: contentBox.left - regionBox.left,
      right: regionBox.right - contentBox.right,
      gutter: getComputedStyle(element).scrollbarGutter,
    };
  });
}

/** Every shared scrolled region the detail currently draws, and whether it has taken room of any kind. */
async function regionBoxes(page: Page): Promise<{ padding: string[]; gutter: string; hasRoom: boolean }[]> {
  return await containerDetail(page)
    .locator('.ui-scroll-area')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        const padding = [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
        return { padding, gutter: style.scrollbarGutter, hasRoom: padding.some((side) => Number.parseFloat(side) > 0) || style.scrollbarGutter !== 'auto' };
      }),
    );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

// REQ-51 — the three collection groups are drawn whether or not they hold anything, each with its
// count, and a group with nothing in it says so in the library's placeholder.
//
// **This reverses what this file asserted for REQ-49** ("a container with no mounts is shown no
// Mounts heading"). The reversal is the human's own, taken on the evidence of their daemon: an
// absent group is indistinguishable from a group that was never designed, and "this container
// publishes nothing" is an answer the operator came for.
test('Config: a container that states nothing is still shown all five groups, the collections counting zero', async ({ page }) => {
  const name = `vexel-e2e-config-bare-${Date.now()}`;
  await createBareFixture(name);
  try {
    await openConfigTab(page, name, DESKTOP);

    const drawn = await headings(page);
    console.log(`[REQ-51] the Config tab of a container stating nothing is headed: ${drawn.map((one) => `${one.title} (${one.count || '—'})`).join(' · ')}`);
    expect(
      drawn.map((one) => one.title),
      'the tab does not draw the five groups of the form it edits',
    ).toEqual(['Runtime', 'Health check', 'Environment variables', 'Port mappings', 'Mounts']);
    for (const title of ['Port mappings', 'Mounts']) {
      const group = drawn.find((one) => one.title === title)!;
      expect(group.count, `the ${title} heading states "${group.count}" instead of the number of entries it holds`).toBe('0');
      await expect(groupPlaceholder(page, title), `the ${title} group is drawn empty, with nothing where its list would be`).toBeVisible();
    }

    // Beside the content: an empty group is a group on screen, with a box of its own — not a
    // heading collapsed onto the one below it.
    const box = await boxOf(groupCard(page, 'Port mappings'), 'the empty Port mappings group');
    expect(box.height, `the empty Port mappings group is ${round(box.height)}px tall`).toBeGreaterThan(0);
    expect(box.width, `the empty Port mappings group is ${round(box.width)}px wide`).toBeGreaterThan(0);
  } finally {
    await removeFixture({ name });
  }
});

// REQ-54, REQ-18 — one variable per row at the group's full width, a key field and a value field
// side by side, each value beginning at its own field, and a value the row has room for drawn on
// one line. The keys still read down as one column, every entry giving its first field the same
// share.
test('Config: the environment reads one variable per row, two fields side by side, each value at its own field', async ({ page }) => {
  const name = `vexel-e2e-config-env-${Date.now()}`;
  const fixture = await createConfigFixture(name);
  try {
    await openConfigTab(page, name, DESKTOP);

    const environment = await measureFieldList(groupList(page, 'Environment variables'), 'the Environment variables group');
    const evidence = reportFieldList(`Environment at ${DESKTOP.width} × ${DESKTOP.height}`, environment);
    console.log(`[REQ-54] ${evidence}`);

    expect(environment.entries, 'the group does not draw one entry per variable of the fixture').toHaveLength(Object.keys(FIXTURE_ENV).length);

    // One per row, at the group's full width: as many lines as entries, and every entry as wide as
    // the list itself.
    expect(environment.perLine, `${evidence} — the group flows ${environment.perLine} entries on a line rather than one`).toBe(1);
    expect(environment.lines, `${evidence} — ${environment.entries.length} entries are drawn over ${environment.lines} line(s)`).toBe(environment.entries.length);
    for (const entry of environment.entries) {
      expect(
        Math.abs(entry.box.width - environment.box.width),
        `${evidence} — an entry is ${round(entry.box.width)}px wide inside a ${round(environment.box.width)}px group, so it does not take the row`,
      ).toBeLessThanOrEqual(1);
      expect(entry.fields, `${evidence} — an entry does not draw a key field and a value field`).toHaveLength(2);
    }

    // Two fields side by side, each taking a share of the row — the edit form's own geometry.
    for (const entry of environment.entries) {
      const [key, value] = entry.fields;
      expect(
        Math.abs(key.box.width - value.box.width),
        `${evidence} — the key field is ${round(key.box.width)}px and the value field ${round(value.box.width)}px in one row, so they do not share it`,
      ).toBeLessThanOrEqual(1);
      expect(value.box.left, `${evidence} — the value field starts at ${round(value.box.left)}, left of the key field's right edge ${round(key.box.right)}`).toBeGreaterThanOrEqual(
        key.box.right - 0.5,
      );
    }

    // **A value begins where its own field begins** (REQ-54) — the defect this replaces started
    // every value at one offset inside an otherwise empty band, a third of the way in. What a value
    // may be inset by is its own field's padding, which every field carries alike, and nothing more.
    for (const entry of environment.entries) {
      for (const field of entry.fields) {
        expect(
          field.valueBox!.left - field.box.left,
          `${evidence} — the value "${field.text}" begins ${round(field.valueBox!.left - field.box.left)}px inside a field padded by ${round(field.paddingLeft)}px`,
        ).toBeLessThanOrEqual(field.paddingLeft + 1);
      }
    }

    // Every value the row has room for is drawn on one line.
    for (const entry of environment.entries) {
      const value = entry.fields[1];
      expect(
        value.valueLines,
        `${evidence} — the value "${value.text}" occupies ${round(value.valueInk)}px of ink in a ${round(value.box.width)}px field and is drawn over ${value.valueLines} lines`,
      ).toBe(1);
    }

    // REQ-18 — the keys still read down as one column: every first field at one edge, of one width.
    const keyEdges = environment.entries.map((entry) => round(entry.fields[0].box.left));
    const keyWidths = environment.entries.map((entry) => round(entry.fields[0].box.width));
    expect(spread(keyEdges), `${evidence} — the keys start at ${new Set(keyEdges).size} different edges (${keyEdges.join(', ')})`).toBeLessThanOrEqual(1);
    expect(spread(keyWidths), `${evidence} — the key fields are of ${new Set(keyWidths).size} different widths (${keyWidths.join(', ')})`).toBeLessThanOrEqual(1);

    // Beside the geometry: each key carries its own value, split on the first `=` only.
    const read = Object.fromEntries(environment.entries.map((entry) => [entry.fields[0].text, entry.fields[1].text]));
    expect(read).toEqual(FIXTURE_ENV);
  } finally {
    await removeFixture(fixture);
  }
});

// `ui-library/specs/field-list.md` — "A value longer than its field wraps inside it, gaining no
// ellipsis, no truncation and no hidden overflow: these are the values an operator most needs to
// read exactly." The long key is the one field of this fixture that cannot fit on a line.
test('Config: a key longer than its field wraps inside it and is never truncated', async ({ page }) => {
  const name = `vexel-e2e-config-longkey-${Date.now()}`;
  const fixture = await createConfigFixture(name);
  try {
    await openConfigTab(page, name, DESKTOP);

    const overflow = await groupList(page, 'Environment variables')
      .locator('.ui-field-list__entry', { hasText: LONG_KEY })
      .locator('.ui-field-list__value')
      .first()
      .evaluate((value) => ({
        textOverflow: getComputedStyle(value).textOverflow,
        scrollWidth: value.scrollWidth,
        clientWidth: value.clientWidth,
        text: value.textContent ?? '',
      }));
    console.log(`[field-list] the ${LONG_KEY.length}-character key reads in a ${overflow.clientWidth}px field, laying out ${overflow.scrollWidth}px`);

    expect(overflow.textOverflow, 'the key is ellipsised rather than wrapped').not.toBe('ellipsis');
    expect(overflow.scrollWidth, `${overflow.scrollWidth - overflow.clientWidth}px of the key is hidden outside its own field`).toBeLessThanOrEqual(
      overflow.clientWidth + 1,
    );
    expect(overflow.text, 'the key is not shown in full').toBe(LONG_KEY);
  } finally {
    await removeFixture(fixture);
  }
});

// REQ-48, REQ-55 — the ports are a counted group of their own, one entry per port, each entry
// **naming** its two numbers so which is which is read rather than inferred; and the group goes on
// flowing more than one entry per line, which the human asked for explicitly.
test('Config: each port entry names its container port and its host port, several to a line', async ({ page }) => {
  const name = `vexel-e2e-config-ports-${Date.now()}`;
  const fixture = await createConfigFixture(name);
  try {
    await openConfigTab(page, name, DESKTOP);

    const ports = await measureFieldList(groupList(page, 'Port mappings'), 'the Port mappings group');
    const evidence = reportFieldList(`Port mappings at ${DESKTOP.width} × ${DESKTOP.height}`, ports);
    console.log(`[REQ-55] ${evidence}`);

    expect(ports.entries, 'the group does not draw one entry per port of the fixture').toHaveLength(PUBLISHED_PORTS.length);

    // The two numbers are named, in the form's own words, and each caption is drawn above its own
    // value rather than beside another entry's.
    for (const entry of ports.entries) {
      expect(
        entry.fields.map((field) => field.caption),
        `${evidence} — an entry names its fields ${JSON.stringify(entry.fields.map((field) => field.caption))}`,
      ).toEqual(['Container port', 'Host port']);
      for (const field of entry.fields) {
        expect(
          field.valueBox!.top,
          `${evidence} — the value of "${field.caption}" is drawn at y=${round(field.valueBox!.top)}, not below its own caption in a field starting at ${round(field.box.top)}`,
        ).toBeGreaterThan(field.box.top);
      }
    }

    const read = ports.entries.map((entry) => ({ container: entry.fields[0].text, host: entry.fields[1].text }));
    expect(read, 'the entries do not read the fixture’s own bindings').toEqual(
      [...PUBLISHED_PORTS]
        .sort((left, right) => left.container - right.container)
        .map((port) => ({ container: `${port.container}/tcp`, host: String(port.host) })),
    );

    // The group still flows more than one entry per line at a desktop width.
    expect(ports.perLine, `${evidence} — the group flows ${ports.perLine} entry per line, so it has stopped flowing`).toBeGreaterThan(1);
  } finally {
    await removeFixture(fixture);
  }
});

// REQ-59 — **the case the operator's card and their detail used to disagree about**: a container
// published with `-P`, whose host port the daemon chose. The tab states the number actually in
// force; until REQ-59 it read `not published` on a port that was published.
test('Config: a publication the daemon numbered reads its real host port', async ({ page }) => {
  const name = `vexel-e2e-config-published-${Date.now()}`;
  const hostPort = await createDaemonPublishedFixture(name);
  try {
    await openConfigTab(page, name, DESKTOP);

    const ports = await measureFieldList(groupList(page, 'Port mappings'), 'the Port mappings group');
    console.log(`[REQ-59] the daemon published ${EXPOSED_PORT}/tcp on host port ${hostPort}; ${reportFieldList('Port mappings', ports)}`);

    const read = ports.entries.map((entry) => ({ container: entry.fields[0].text, host: entry.fields[1].text }));
    expect(read, `the publication the daemon numbered is not read in the tab; it shows ${JSON.stringify(read)}`).toEqual([
      { container: `${EXPOSED_PORT}/tcp`, host: String(hostPort) },
    ]);

    // Beside the content: the entry is drawn, with a box of its own, and both fields put ink in it.
    const entry = ports.entries[0];
    expect(entry.box.width, 'the publication’s entry is drawn with no width').toBeGreaterThan(0);
    for (const field of entry.fields) {
      expect(field.valueInk, `the "${field.caption}" field of the publication draws no text at all`).toBeGreaterThan(0);
    }
  } finally {
    await removeFixture({ name });
  }
});

// REQ-59's other half — "and only those. A port that is merely declared is not an entry here." The
// group is still **drawn**, with its count and the library's placeholder (REQ-51): "this container
// publishes nothing" is an answer the operator came for, and an absent group is not that answer.
//
// **This reverses what this file asserted until 2026-08-27**, when the same fixture was used to
// prove the opposite — that an exposed-only port reaches the tab (REQ-52 as first read, then REQ-58,
// withdrawn the day it was written). `EXPOSE` binds no host port, so the row it produced named
// something reachable from nowhere.
test('Config: a port exposed and published nowhere is not an entry, and the group still says so', async ({ page }) => {
  const name = `vexel-e2e-config-exposed-${Date.now()}`;
  await createExposedFixture(name);
  try {
    await openConfigTab(page, name, DESKTOP);

    const card = groupCard(page, 'Port mappings');
    await expect(card, 'the Port mappings group is not drawn for a container that publishes nothing').toBeVisible();
    const placeholder = groupPlaceholder(page, 'Port mappings');
    await expect(placeholder, 'the group with nothing in it draws no placeholder saying so').toBeVisible();

    const entries = await groupList(page, 'Port mappings').locator('.ui-field-list__entry').allInnerTexts();
    console.log(`[REQ-59] the exposed-only container's Port mappings group holds ${entries.length} entry/entries: ${JSON.stringify(entries)}`);
    expect(entries, `a port that is exposed and published nowhere is drawn as a mapping: ${JSON.stringify(entries)}`).toEqual([]);

    // Geometry beside content: the group is a card of real size, not a collapsed remnant of one.
    const box = await boxOf(card, 'the empty Port mappings group');
    expect(box.height, `the empty Port mappings group is ${round(box.height)}px tall`).toBeGreaterThan(0);
    expect(box.width, `the empty Port mappings group is ${round(box.width)}px wide`).toBeGreaterThan(0);
  } finally {
    await removeFixture({ name });
  }
});

/**
 * `…-tabs_composition_refactor/REQ-60` — **the card and this tab answer the same question on the
 * same container**, which is the requirement's own wording, so it is checked on one container in one
 * pass: the chips are read off the card and the entries off the tab that card opens.
 *
 * **The rule reversed on 2026-08-27 and this check carries the new one.** Until then the card drew
 * exposed-but-unpublished ports too (the 2026-08-25 annotation of `containers_card_view/REQ-5`,
 * grounded on `REQ-12` — no value the delivered row showed may disappear), while the tab had already
 * been narrowed to publications: the human measured `--expose 7777` as two chips on the card against
 * `Port mappings (0)` in the detail. The same human reversed the card's half after being shown their
 * earlier ruling: an exposure binds no host port and gates no container-to-container traffic.
 *
 * The fixture publishes with `-p 0:N`, the spelling the daemon stores as a literal `HostPort: "0"`,
 * and exposes a second port it never publishes — so a reading that took `0` for a host port, or that
 * let a declaration through, fails here on whichever side it happened.
 */
test('Config: the card and the tab state the same publications for a container that publishes and exposes', async ({ page }) => {
  const name = `vexel-e2e-config-agreement-${Date.now()}`;
  const hostPort = await createPublishingAndExposingFixture(name);
  try {
    await page.setViewportSize(DESKTOP);
    await openApp(page, 'containers');
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
    await page.getByPlaceholder('Search name, image or state…').fill(name);
    const card = containerCard(page, name);
    await expect(card, 'the fixture container never appeared in the list').toBeVisible({ timeout: 20_000 });

    const chips = await card.locator('.ui-metric-strip__row .ui-chip').allInnerTexts();
    console.log(`[REQ-60] the daemon published ${EXPOSED_PORT}/tcp on host port ${hostPort}; the card reads ${JSON.stringify(chips)}`);
    expect(chips, `the card does not state the publication alone; it reads ${JSON.stringify(chips)}`).toEqual([`${hostPort}→${EXPOSED_PORT}`]);

    // Beside the content: the row and its chip are drawn, inside the card that carries them.
    const chipBox = await boxOf(card.locator('.ui-metric-strip__row .ui-chip').first(), 'the card’s port chip');
    const cardBox = await boxOf(card, `the card of ${name}`);
    expect(chipBox.width, 'the card’s port chip is drawn with no width').toBeGreaterThan(0);
    expect(chipBox.x, 'the card’s port chip starts outside its card').toBeGreaterThanOrEqual(cardBox.x);
    expect(chipBox.x + chipBox.width, 'the card’s port chip runs past its card').toBeLessThanOrEqual(cardBox.x + cardBox.width);

    await openContainerDetail(page, name);
    await expect(editAction(page), 'the Config tab never finished loading its inspect data').toBeVisible({ timeout: 20_000 });

    const ports = await measureFieldList(groupList(page, 'Port mappings'), 'the Port mappings group');
    const evidence = reportFieldList('Port mappings', ports);
    console.log(`[REQ-60] ${evidence}`);
    const read = ports.entries.map((entry) => ({ container: entry.fields[0].text, host: entry.fields[1].text }));
    expect(read, `the tab does not state the same publication the card does; it reads ${JSON.stringify(read)}`).toEqual([
      { container: `${EXPOSED_PORT}/tcp`, host: String(hostPort) },
    ]);
    expect(ports.entries[0].box.width, 'the publication’s entry is drawn with no width').toBeGreaterThan(0);

    // Neither reading names what the container merely declares. Read on the group itself rather than
    // on the whole dialog: the fixture's own name carries a timestamp, and a digit sequence inside it
    // would answer for the group.
    const groupText = await groupCard(page, 'Port mappings').innerText();
    expect(chips.join(' '), 'the card names a port the container only exposes').not.toContain(String(MERELY_EXPOSED_PORT));
    expect(groupText, 'the tab names a port the container only exposes').not.toContain(String(MERELY_EXPOSED_PORT));
  } finally {
    await removeFixture({ name });
  }
});

// REQ-56, REQ-57 — a mount is given its row's real width, and **no field of an entry takes more
// than half its row**. The cost written into REQ-57 is accepted and is not a failure: a source
// longer than half the row wraps onto a second line rather than running past the middle.
test('Config: a mount takes its row, no field of it passes the middle, and the boundary is one column', async ({ page }) => {
  const name = `vexel-e2e-config-mounts-${Date.now()}`;
  const fixture = await createConfigFixture(name);
  try {
    await openConfigTab(page, name, DESKTOP);

    const mounts = await measureFieldList(groupList(page, 'Mounts'), 'the Mounts group');
    const evidence = reportFieldList(`Mounts at ${DESKTOP.width} × ${DESKTOP.height}`, mounts);
    console.log(`[REQ-56] ${evidence}`);

    expect(mounts.entries, 'the group does not draw one entry per mount of the fixture').toHaveLength(3);
    expect(mounts.perLine, `${evidence} — the group flows ${mounts.perLine} mounts on a line rather than one`).toBe(1);

    // REQ-56 — the row's real width: an entry is as wide as its group, and the source of a mount
    // short enough for its field is drawn on one line rather than wrapped inside a fixed track.
    for (const entry of mounts.entries) {
      expect(
        Math.abs(entry.box.width - mounts.box.width),
        `${evidence} — a mount is ${round(entry.box.width)}px wide inside a ${round(mounts.box.width)}px group`,
      ).toBeLessThanOrEqual(1);
      expect(
        entry.fields.map((field) => field.caption),
        `${evidence} — a mount names its fields ${JSON.stringify(entry.fields.map((field) => field.caption))}`,
      ).toEqual(['Source', 'Destination']);
    }
    const short = mounts.entries.find((entry) => entry.fields[1].text.startsWith(SHORT_DESTINATION));
    expect(short, `${evidence} — no entry reads ${SHORT_DESTINATION}`).toBeDefined();
    expect(
      short!.fields[0].valueLines,
      `${evidence} — a source of ${round(short!.fields[0].valueInk)}px is wrapped over ${short!.fields[0].valueLines} lines inside a ${round(
        short!.fields[0].box.width,
      )}px field`,
    ).toBe(1);

    // REQ-57 — the cap, as a share of the entry and in every row.
    const widest = widestShare(mounts);
    console.log(`[REQ-57] the widest field takes ${(widest.share * 100).toFixed(1)}% of its entry ("${widest.caption}": ${widest.text.slice(0, 40)}…)`);
    for (const entry of mounts.entries) {
      for (const field of entry.fields) {
        expect(
          field.shareOfEntry,
          `${evidence} — the "${field.caption}" field takes ${(field.shareOfEntry * 100).toFixed(1)}% of its ${round(entry.box.width)}px row`,
        ).toBeLessThanOrEqual(0.5 + 0.005);
      }
    }

    // REQ-57's column: the two long-sourced rows are both held at the cap, so the boundary between
    // source and destination falls at one offset — which is what a column is.
    const capped = mounts.entries.filter((entry) => entry.fields[0].shareOfEntry > 0.45);
    expect(capped.length, `${evidence} — fewer than two rows reach the cap, so the alignment this asserts could not fail`).toBeGreaterThanOrEqual(2);
    const boundaries = capped.map((entry) => round(entry.fields[0].box.right));
    expect(
      spread(boundaries),
      `${evidence} — the source/destination boundary falls at ${new Set(boundaries).size} different offsets (${boundaries.join(', ')}), so the column begins somewhere new in every row`,
    ).toBeLessThanOrEqual(1);

    // REQ-21 — the read-only mount is told from the writable one by treatment, not by its label
    // alone; the chip travels with the destination.
    const readOnly = mounts.entries.find((entry) => entry.fields[1].text.startsWith(READ_ONLY_DESTINATION));
    const writable = mounts.entries.find((entry) => entry.fields[1].text.startsWith(WRITABLE_DESTINATION));
    expect(readOnly, `${evidence} — no entry reads ${READ_ONLY_DESTINATION}`).toBeDefined();
    expect(writable, `${evidence} — no entry reads ${WRITABLE_DESTINATION}`).toBeDefined();
    expect(readOnly!.fields[1].chips, 'the read-only mount carries no `ro` chip beside its destination').toEqual(['ro']);
    expect(writable!.fields[1].chips, 'the writable mount carries no `rw` chip beside its destination').toEqual(['rw']);

    const treatments = await containerDetail(page)
      .locator('.ui-field-list .ui-chip')
      .evaluateAll((chips) =>
        chips.map((chip) => {
          const style = getComputedStyle(chip);
          return { label: chip.textContent ?? '', color: style.color, background: style.backgroundColor, border: style.borderColor };
        }),
      );
    const roTreatment = treatments.find((chip) => chip.label === 'ro')!;
    const rwTreatment = treatments.find((chip) => chip.label === 'rw')!;
    console.log(`[REQ-21] ro ${JSON.stringify(roTreatment)}\n[REQ-21] rw ${JSON.stringify(rwTreatment)}`);
    expect(
      [roTreatment.color, roTreatment.background, roTreatment.border],
      `the ro chip is painted exactly like the rw one (${JSON.stringify(roTreatment)}), so the two differ only by their label`,
    ).not.toEqual([rwTreatment.color, rwTreatment.background, rwTreatment.border]);

    // The word that was repeated on every row is the heading now, and nothing else.
    expect(await containerDetail(page).innerText(), 'an entry still carries the literal `mount:` prefix').not.toMatch(/mount:/i);
  } finally {
    await removeFixture(fixture);
  }
});

// REQ-50, REQ-44 — the action sits at the **foot** of the tab, at its trailing edge, belonging to no
// group, and a real pointer at its own coordinates still opens the edit form.
//
// **This reverses REQ-22's placement**, which this file asserted at the head: with the reading now
// the same composition as the form, the action takes the form's own place. Its label and what it
// does are unchanged, and both are asserted here rather than assumed.
test('Config: Edit configuration closes the tab at its trailing edge and still opens the edit form', async ({ page }) => {
  const name = `vexel-e2e-config-action-${Date.now()}`;
  const fixture = await createConfigFixture(name);
  try {
    await openConfigTab(page, name, DESKTOP);

    // The action scrolls with the content (REQ-50), so it is scrolled to before it is measured — a
    // pinned footer would be on screen without this and is exactly what the requirement refuses.
    await editAction(page).scrollIntoViewIfNeeded();
    const boxes = await boxesOf(
      page,
      { action: editAction(page), lastGroup: groupCard(page, 'Mounts'), firstGroup: groupCard(page, 'Runtime'), dialog: containerDetail(page) },
      'the Config tab in reading',
    );
    console.log(
      `[REQ-50] action ${round(boxes.action!.x)},${round(boxes.action!.y)} ${round(boxes.action!.width)}×${round(boxes.action!.height)} / Mounts card ends at ${round(
        boxes.lastGroup!.x + boxes.lastGroup!.width,
      )},${round(boxes.lastGroup!.y + boxes.lastGroup!.height)}`,
    );

    // At the foot: below the last group, and below the first — not merely after it in the markup.
    expect(
      boxes.action!.y,
      `the action's top edge (${round(boxes.action!.y)}) is above the bottom of the last group (${round(boxes.lastGroup!.y + boxes.lastGroup!.height)})`,
    ).toBeGreaterThanOrEqual(boxes.lastGroup!.y + boxes.lastGroup!.height - 1);
    expect(boxes.action!.y, 'the action is drawn above the first group, at the head of the tab').toBeGreaterThan(boxes.firstGroup!.y);

    // At the trailing edge, lined up with the content column the groups define.
    expect(
      Math.abs(boxes.action!.x + boxes.action!.width - (boxes.lastGroup!.x + boxes.lastGroup!.width)),
      `the action ends at ${round(boxes.action!.x + boxes.action!.width)} while the tab's content column ends at ${round(boxes.lastGroup!.x + boxes.lastGroup!.width)}`,
    ).toBeLessThanOrEqual(2);

    // Belonging to no group: outside every card of the tab and outside the two-column pair.
    // Every surface between the action and the tab's own scrolled region: the dialog is a surface
    // too, and it is the one the action legitimately sits inside, so the walk stops at the region.
    const containment = await editAction(page).evaluate((button) => {
      const region = button.closest('.ui-scroll-area');
      let node: Element | null = button.parentElement;
      let inACard = false;
      while (node && node !== region) {
        if (node.classList.contains('ui-surface')) inACard = true;
        node = node.parentElement;
      }
      return { inACard, inTheGrid: button.closest('.ui-grid') !== null };
    });
    expect(containment.inACard, 'the action is drawn inside one of the tab’s cards').toBe(false);
    expect(containment.inTheGrid, 'the action is drawn inside the two-column pair, so it belongs to one of its columns').toBe(false);

    // Nothing of the tab is drawn below it: it closes the tab.
    const lowest = await containerDetail(page)
      .locator('.ui-section-header')
      .evaluateAll((headers) => Math.max(...headers.filter((header) => header.closest('.ui-modal__title') === null).map((header) => header.getBoundingClientRect().bottom)));
    expect(lowest, `a group heading is drawn at y=${round(lowest)}, below the action at ${round(boxes.action!.y)}`).toBeLessThanOrEqual(boxes.action!.y + 1);

    // A real pointer at the visible control's own coordinates (REQ-44), and the edit form it has
    // always opened.
    await clickAtItsCentre(page, editAction(page), 'the Edit configuration action');
    await expect(containerDetail(page).getByRole('combobox', { name: 'Restart policy' }), 'the action no longer opens the edit form').toBeVisible();

    // Beside the content: the dialog it happens inside did not move (REQ-2).
    const after = await boxOf(containerDetail(page), 'the container detail dialog');
    expect(
      { x: after.x, y: after.y, width: after.width, height: after.height },
      `opening the edit form moved the dialog from ${JSON.stringify(boxes.dialog)} to ${JSON.stringify(after)}`,
    ).toEqual({ x: boxes.dialog!.x, y: boxes.dialog!.y, width: boxes.dialog!.width, height: boxes.dialog!.height });
  } finally {
    await removeFixture(fixture);
  }
});

// REQ-53 — the scrolled region leaves room for what it holds: a card at its edge draws the whole of
// its drop shadow instead of having it clipped, and the scrollbar has a gutter of its own instead of
// resting on the content's trailing edge. **And every other consumer of the shared region keeps the
// box it has today**, which is the real risk of this change: eight of the library's surfaces scroll
// through the same region, each aligning something of its own against its box.
test('Config: the tab’s region leaves the shadow its room and the scrollbar its gutter, and the other tabs’ regions are untouched', async ({ page }) => {
  const name = `vexel-e2e-config-inset-${Date.now()}`;
  const fixture = await createConfigFixture(name);
  try {
    await openConfigTab(page, name, DESKTOP);

    const reach = await shadowReachOf(groupCard(page, 'Runtime'));
    const room = await regionRoom(scrolledRegion(page));
    console.log(`[REQ-53] shadow reaches ${JSON.stringify(reach)}; the region leaves ${JSON.stringify(room)}`);

    expect(room.top, `the region leaves ${round(room.top)}px above its content, against a shadow reaching ${reach.top}px`).toBeGreaterThanOrEqual(reach.top - 0.5);
    expect(room.bottom, `the region leaves ${round(room.bottom)}px below its content, against a shadow reaching ${reach.bottom}px`).toBeGreaterThanOrEqual(
      reach.bottom - 0.5,
    );
    expect(room.left, `the region leaves ${round(room.left)}px left of its content, against a shadow reaching ${reach.side}px`).toBeGreaterThanOrEqual(reach.side - 0.5);
    expect(room.right, `the region leaves ${round(room.right)}px right of its content, against a shadow reaching ${reach.side}px`).toBeGreaterThanOrEqual(
      reach.side - 0.5,
    );

    // The gutter is reserved whether or not the content is long enough to scroll, so the tab does
    // not change width when it grows past the region.
    expect(room.gutter, `the region reserves no gutter for its scrollbar (scrollbar-gutter: ${room.gutter})`).toContain('stable');

    // **The other half of REQ-53, and the real risk of this change**: the surfaces that take the
    // region as it is still do. Two of the eight are reachable on a container's own detail — the
    // code viewer inside the Inspect tab's raw payload, and the process table — and each is asked
    // for the box the browser gives it. That no *other* consumer asks for room, on any screen, is
    // settled once over the sources in `client/test/unit/scroll-area-inset.test.tsx`; what is
    // settled here is that the room the sources describe is the room the browser applies.
    await containerDetail(page).getByRole('tab', { name: 'Inspect', exact: true }).click();
    await clickAtItsCentre(page, containerDetail(page).locator('.ui-collapsible-section__header').filter({ hasText: 'Raw payload' }), 'the Raw payload section');
    await expect(containerDetail(page).locator('.ui-code-viewer'), 'the raw payload never opened, so its own region cannot be measured').toBeVisible();
    const inspectRegions = await regionBoxes(page);
    console.log(`[REQ-53] the Inspect tab's regions: ${JSON.stringify(inspectRegions)}`);
    expect(inspectRegions.length, 'the Inspect tab draws no shared region at all, so this check has stopped covering it').toBeGreaterThan(1);
    expect(
      inspectRegions.filter((region) => region.hasRoom).length,
      `${inspectRegions.filter((region) => region.hasRoom).length} of the Inspect tab's regions take room, against the one document tab that asks for it`,
    ).toBe(1);
    for (const region of inspectRegions.filter((candidate) => !candidate.hasRoom)) {
      expect(region.padding, `a region inside the Inspect tab has taken room it never asked for: padding ${region.padding.join(' ')}`).toEqual([
        '0px',
        '0px',
        '0px',
        '0px',
      ]);
      expect(region.gutter, `a region inside the Inspect tab has taken a scrollbar gutter it never asked for: ${region.gutter}`).toBe('auto');
    }
  } finally {
    await removeFixture(fixture);
  }
});

// REQ-53, on the two tabs that are surfaces of their own: the process table takes the region as it
// is. A **running** fixture, because a process table needs processes — the same one the
// exposed-only check uses.
test('Config: the tabs that are surfaces of their own take the shared region unchanged', async ({ page }) => {
  const name = `vexel-e2e-config-bare-region-${Date.now()}`;
  await createExposedFixture(name);
  try {
    await openConfigTab(page, name, DESKTOP);

    await containerDetail(page).getByRole('tab', { name: 'Processes', exact: true }).click();
    await expect(containerDetail(page).locator('.ui-data-table'), 'the process table never appeared, so its region cannot be measured').toBeVisible({ timeout: 20_000 });
    const regions = await regionBoxes(page);
    console.log(`[REQ-53] the Processes tab's regions: ${JSON.stringify(regions)}`);

    expect(regions.length, 'the Processes tab scrolls through no shared region at all, so this check has stopped covering it').toBeGreaterThan(0);
    for (const region of regions) {
      expect(region.padding, `the Processes tab's own scrolled region has taken room it never asked for: padding ${region.padding.join(' ')}`).toEqual([
        '0px',
        '0px',
        '0px',
        '0px',
      ]);
      expect(region.gutter, `the Processes tab's own scrolled region has taken a scrollbar gutter it never asked for: ${region.gutter}`).toBe('auto');
    }
  } finally {
    await removeFixture({ name });
  }
});

// REQ-40 — at 375 × 812 the tab stays usable: nothing clipped to nothing, nothing requiring
// horizontal scrolling, every chip still on screen.
//
// **What is deliberately not asserted here** is how many lines a value takes. At this width the two
// fields of an entry are an equal share each of a ~295px row, so a long value wraps many times; the
// human was shown that measurement on 2026-08-27, approved the desktop arrangement and did not ask
// for the narrow one to change, and it stands recorded and unfixed in the batch file. A check
// failing on it would be reporting a decision, not a defect.
test('Config: at 375 × 812 every group stays readable and nothing scrolls sideways', async ({ page }) => {
  const name = `vexel-e2e-config-narrow-${Date.now()}`;
  const fixture = await createConfigFixture(name);
  try {
    await openConfigTab(page, name, { width: 375, height: 812 });

    // Everything is **measured first and asserted after**, so one run reports the whole state of the
    // narrow arrangement instead of stopping at the first group that fails.
    const groups: Record<string, FieldListGeometry> = {};
    for (const title of ['Environment variables', 'Port mappings', 'Mounts']) {
      groups[title] = await measureFieldList(groupList(page, title), `the ${title} group`);
    }
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      const dialog = document.querySelector('.ui-modal--size-large');
      return {
        page: { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth },
        dialog: { scrollWidth: dialog?.scrollWidth ?? 0, clientWidth: dialog?.clientWidth ?? 0 },
      };
    });
    const chips = await containerDetail(page)
      .locator('.ui-field-list .ui-chip')
      .evaluateAll((elements) =>
        elements.map((chip) => {
          const box = chip.getBoundingClientRect();
          const entry = chip.closest('.ui-field-list__entry')!.getBoundingClientRect();
          return {
            label: chip.textContent ?? '',
            left: box.left,
            right: box.right,
            width: box.width,
            insideEntry: box.left >= entry.left - 0.5 && box.right <= entry.right + 0.5,
            entry: { left: entry.left, right: entry.right },
          };
        }),
      );
    for (const [title, geometry] of Object.entries(groups)) console.log(`[REQ-40] ${reportFieldList(`${title} at 375 × 812`, geometry)}`);
    console.log(`[REQ-40] chips ${JSON.stringify(chips)}`);
    console.log(`[REQ-40] page ${JSON.stringify(overflow.page)} / dialog ${JSON.stringify(overflow.dialog)}`);

    expect(overflow.page.scrollWidth, 'the page scrolls sideways at 375 × 812').toBeLessThanOrEqual(overflow.page.clientWidth + 1);
    expect(overflow.dialog.scrollWidth, 'the detail dialog scrolls sideways at 375 × 812').toBeLessThanOrEqual(overflow.dialog.clientWidth + 1);

    for (const [title, geometry] of Object.entries(groups)) {
      const evidence = reportFieldList(`${title} at 375 × 812`, geometry);
      for (const entry of geometry.entries) {
        expect(entry.box.left, `${evidence} — an entry starts at ${round(entry.box.left)}, outside its group (${round(geometry.box.left)})`).toBeGreaterThanOrEqual(
          geometry.box.left - 0.5,
        );
        expect(entry.box.right, `${evidence} — an entry ends at ${round(entry.box.right)}, outside its group (${round(geometry.box.right)})`).toBeLessThanOrEqual(
          geometry.box.right + 0.5,
        );
        for (const field of entry.fields) {
          expect(field.box.width, `${evidence} — the "${field.caption || field.text}" field is clipped to ${round(field.box.width)}px`).toBeGreaterThan(0);
          // A box of some width is not yet a value on screen: the ink is what the browser actually
          // laid out inside it.
          expect(
            field.valueInk,
            `${evidence} — the "${field.caption || 'value'}" field occupies a ${round(field.box.width)}px box and draws no text in it`,
          ).toBeGreaterThan(0);
        }
      }
    }

    for (const chip of chips) {
      expect(
        chip.insideEntry,
        `the ${chip.label} chip is drawn at ${round(chip.left)}…${round(chip.right)}, outside its own entry (${round(chip.entry.left)}…${round(chip.entry.right)})`,
      ).toBe(true);
      expect(chip.right, `the ${chip.label} chip ends at ${round(chip.right)}, off the right edge of a 375px viewport`).toBeLessThanOrEqual(375);
      expect(chip.width, `the ${chip.label} chip is drawn ${round(chip.width)}px wide`).toBeGreaterThan(0);
    }
  } finally {
    await removeFixture(fixture);
  }
});
