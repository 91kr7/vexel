/**
 * **The Inspect tab as the whole inspect payload** —
 * `plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload`,
 * REQ-3 … REQ-21, REQ-24, REQ-30, REQ-32, REQ-33, REQ-34, REQ-35.
 *
 * Written from scratch in place of `container-inspect-groups.spec.ts`, which measured the two
 * curated groups REQ-5 abolished. **Completeness is read off the daemon's own response** and never
 * off a list of key names written here (REQ-34): the response the tab was given is fetched from the
 * same endpoint the tab uses, and what is on screen is compared with it key by key.
 *
 * Every fixture carries the ownership labels, is created from the suite's own `alpine:3.20` (never
 * pulled here) and is removed with `docker rm -fv` in a `finally`. Nothing is asserted about the
 * operator's own daemon: the list is narrowed to the fixture by name and the card is searched for.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { clickAtItsCentre } from './support/settled.js';
import { closeContainerDetail, containerCard, containerDetail, openContainerDetail } from './support/container-cards.js';

async function createRunningContainer(name: string, extraArgs: string[] = []): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), ...extraArgs, '--entrypoint', 'sleep', ALPINE_IMAGE, '300']);
}

async function createExitedContainer(name: string, code: number): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sh', ALPINE_IMAGE, '-c', `exit ${code}`]);
  await execFileAsync('docker', ['wait', name]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  // `-v` and not just `-f`: without it an image's anonymous volumes outlive the container carrying
  // no label of ours, invisible to any later sweep.
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

async function idOf(name: string): Promise<string> {
  return (await execFileAsync('docker', ['inspect', '-f', '{{.Id}}', name])).stdout.trim();
}

/** The very response the tab is handed, from the endpoint the tab itself calls. */
async function inspectPayloadOf(page: Page, name: string): Promise<Record<string, unknown>> {
  const response = await page.request.get(`/api/containers/${await idOf(name)}/inspect`);
  expect(response.ok(), `the inspect endpoint answered ${response.status()} for ${name}`).toBe(true);
  const body = (await response.json()) as { raw?: Record<string, unknown> };
  expect(body.raw, 'the inspect response carries no raw payload at all').toBeDefined();
  return body.raw!;
}

/** Opens the fixture's detail on Inspect, with a real pointer at each visible control's coordinates. */
async function openInspect(page: Page, name: string): Promise<Locator> {
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder('Search name, image or state…').fill(name);
  await expect(containerCard(page, name), 'the fixture container never appeared in the list').toBeVisible({ timeout: 20_000 });
  await openContainerDetail(page, name);
  const detail = containerDetail(page);
  await clickAtItsCentre(page, detail.getByRole('tab', { name: 'Inspect', exact: true }), 'the Inspect tab');
  await expect(detail.getByLabel('Find in payload'), 'the Inspect tab draws no find control').toBeVisible({ timeout: 20_000 });
  return detail;
}

interface DrawnSection {
  title: string;
  summary: string;
  open: boolean;
}

async function sectionsOf(detail: Locator): Promise<DrawnSection[]> {
  return await detail.locator('.ui-payload-sections > .ui-collapsible-section').evaluateAll((elements) =>
    elements.map((element) => ({
      title: (element.querySelector('.ui-collapsible-section__title')?.textContent ?? '').trim(),
      summary: (element.querySelector('.ui-collapsible-section__summary')?.textContent ?? '').trim(),
      open: element.querySelector('.ui-collapsible-section__header')?.getAttribute('aria-expanded') === 'true',
    })),
  );
}

function sectionNamed(page: Page, title: string): Locator {
  return containerDetail(page)
    .locator('.ui-payload-sections > .ui-collapsible-section')
    .filter({ has: page.locator('.ui-collapsible-section__title', { hasText: new RegExp(`^${title}$`) }) })
    .first();
}

/** Opens every payload-derived section, with a real pointer at each header's own coordinates. */
async function openEverySection(page: Page): Promise<void> {
  const headers = containerDetail(page).locator('.ui-payload-sections > .ui-collapsible-section > .ui-collapsible-section__header');
  for (let index = 0; index < (await headers.count()); index += 1) {
    const header = headers.nth(index);
    if ((await header.getAttribute('aria-expanded')) === 'true') continue;
    await clickAtItsCentre(page, header, `the section header at position ${index}`);
    await expect(header).toHaveAttribute('aria-expanded', 'true');
  }
}

interface DrawnBand {
  label: string;
  value: string;
  reading: string;
  empty: boolean;
  danger: boolean;
  pill: string | null;
}

async function bandsOf(scope: Locator): Promise<DrawnBand[]> {
  return await scope.locator('.ui-payload-band').evaluateAll((elements) =>
    elements.map((element) => {
      const value = element.querySelector('.ui-payload-band__value');
      return {
        label: (element.querySelector('.ui-payload-band__label')?.textContent ?? '').trim(),
        value: value?.textContent ?? '',
        reading: (element.querySelector('.ui-payload-band__reading')?.textContent ?? '').trim(),
        empty: value?.classList.contains('ui-payload-band__value--empty') ?? false,
        danger: value?.classList.contains('ui-payload-band__value--tone-danger') ?? false,
        pill: element.querySelector('.ui-badge')?.textContent ?? null,
      };
    }),
  );
}

async function bandNamed(scope: Locator, label: string): Promise<DrawnBand> {
  const bands = await bandsOf(scope);
  const found = bands.find((band) => band.label === label);
  expect(found, `no band labelled "${label}" is on screen; the bands are ${bands.map((band) => band.label).join(', ') || 'none'}`).toBeDefined();
  return found!;
}

/** Every path the payload holds, walked here rather than read from the module the tab uses. */
function pathsOfPayload(value: unknown, prefix: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => [[...prefix, `[${index}]`].join(' › '), ...pathsOfPayload(item, [...prefix, `[${index}]`])]);
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => [
      [...prefix, key].join(' › '),
      ...pathsOfPayload(item, [...prefix, key]),
    ]);
  }
  return [];
}

/** Every path the tab has drawn, reconstructed from the labels on screen. */
async function pathsOnScreen(detail: Locator): Promise<string[]> {
  return await detail.evaluate((panel) => {
    const found: string[] = [];
    const walk = (fields: Element | null | undefined, prefix: string[]) => {
      for (const node of Array.from(fields?.children ?? [])) {
        if (node.classList.contains('ui-payload-band')) {
          found.push([...prefix, (node.querySelector('.ui-payload-band__label')?.textContent ?? '').trim()].join(' › '));
          continue;
        }
        if (!node.classList.contains('ui-payload-group')) continue;
        const key = (node.querySelector('.ui-payload-group__label')?.textContent ?? '').trim();
        found.push([...prefix, key].join(' › '));
        walk(node.querySelector(':scope > .ui-payload-group__body > .ui-payload-fields'), [...prefix, key]);
      }
    };
    for (const section of Array.from(panel.querySelectorAll('.ui-payload-sections > .ui-collapsible-section'))) {
      const title = (section.querySelector('.ui-collapsible-section__title')?.textContent ?? '').trim();
      if (title === 'Raw payload') continue;
      const body = section.querySelector(':scope > .ui-collapsible-section__body > .ui-payload-fields');
      if (title === 'Fields') {
        walk(body, []);
        continue;
      }
      found.push(title);
      walk(body, [title]);
    }
    return found;
  });
}

// REQ-8, REQ-9, REQ-10, REQ-11, REQ-12 — the sections are the response's own top-level keys, in the
// response's own order, each stating what it holds; two are open on entry and the payload is last.
test('the tab is divided into the payload’s own top-level keys, in the payload’s order', async ({ page }) => {
  const name = `vexel-e2e-inspect-sections-${Date.now()}`;
  try {
    await createRunningContainer(name);
    const detail = await openInspect(page, name);
    const payload = await inspectPayloadOf(page, name);

    const composites = Object.entries(payload)
      .filter(([, value]) => value !== null && typeof value === 'object')
      .map(([key]) => key);
    const scalars = Object.entries(payload).filter(([, value]) => value === null || typeof value !== 'object');
    const drawn = await sectionsOf(detail);
    console.log(`[REQ-8] the tab draws ${JSON.stringify(drawn.map((section) => `${section.title} (${section.summary})`))}`);

    expect(drawn.map((section) => section.title), 'the sections are not the payload’s own top-level keys, in its own order').toEqual([
      'Fields',
      ...composites,
      'Raw payload',
    ]);
    expect(drawn[0]!.summary, 'the gathered scalars state a count other than the payload’s own').toBe(
      scalars.length === 1 ? '1 field' : `${scalars.length} fields`,
    );
    for (const [key, value] of Object.entries(payload)) {
      if (value === null || typeof value !== 'object') continue;
      const count = Array.isArray(value) ? value.length : Object.keys(value).length;
      const expected = Array.isArray(value) ? (count === 1 ? '1 item' : `${count} items`) : count === 1 ? '1 field' : `${count} fields`;
      expect(drawn.find((section) => section.title === key)!.summary, `the ${key} section states something other than what it holds`).toBe(expected);
    }

    // REQ-11 — exactly two open, and REQ-12 — the payload last and closed.
    expect(drawn.filter((section) => section.open).map((section) => section.title)).toEqual(['Fields', 'State']);
    expect(drawn.at(-1), 'the raw payload is not the last section of the tab, closed').toMatchObject({ title: 'Raw payload', open: false });

    await closeContainerDetail(page);
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-3, REQ-4, REQ-34 — completeness against the response itself: every key it carries is on
// screen, and no field is drawn that it does not carry. A key nobody has seen fails this by absence.
test('every field the daemon returns is on screen, and no field the daemon did not send', async ({ page }) => {
  const name = `vexel-e2e-inspect-complete-${Date.now()}`;
  try {
    await createRunningContainer(name, ['-p', '0:80', '--label', 'vexel.e2e.completeness=yes']);
    const detail = await openInspect(page, name);
    const payload = await inspectPayloadOf(page, name);
    await openEverySection(page);

    const expected = pathsOfPayload(payload);
    const drawn = await pathsOnScreen(detail);
    console.log(`[REQ-34] the response carries ${expected.length} keys; the tab drew ${drawn.length} fields`);

    expect(expected.length, 'the response carries no key at all, so this check proves nothing').toBeGreaterThan(20);
    const missing = expected.filter((path) => !drawn.includes(path));
    expect(missing, `the tab draws no field for ${missing.length} of the response's ${expected.length} keys: ${missing.slice(0, 20).join(' | ')}`).toEqual([]);
    const invented = drawn.filter((path) => !expected.includes(path));
    expect(invented, `the tab draws ${invented.length} fields the response never carried: ${invented.slice(0, 20).join(' | ')}`).toEqual([]);

    await closeContainerDetail(page);
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-6, REQ-7 — a field with nothing in it is drawn in its own place and marked empty; a zero and a
// false are the values they are. Which fields those are is read off the response, not written here.
test('a field with nothing in it says so, and a zero says zero', async ({ page }) => {
  const name = `vexel-e2e-inspect-empty-${Date.now()}`;
  try {
    await createExitedContainer(name, 0);
    const detail = await openInspect(page, name);
    const payload = await inspectPayloadOf(page, name);
    await openEverySection(page);

    const drawn = await bandsOf(detail);
    const emptyMarkers = { null: 'empty (null)', text: 'empty (text)', list: 'empty (list)', object: 'empty (object)' };
    const emptiesInPayload = Object.entries(payload).filter(
      ([, value]) => value === null || value === '' || (Array.isArray(value) && value.length === 0) || (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0),
    );
    console.log(`[REQ-6] the response carries ${emptiesInPayload.length} empty top-level fields`);

    for (const [key, value] of emptiesInPayload) {
      const expected =
        value === null ? emptyMarkers.null : value === '' ? emptyMarkers.text : Array.isArray(value) ? emptyMarkers.list : emptyMarkers.object;
      // An empty top-level composite is a section of its own, whose body is the marker; an empty
      // top-level scalar is a band inside the gathered scalars. Either way it is in its own place.
      if (value !== null && typeof value === 'object') {
        const section = sectionNamed(page, key);
        await expect(section, `the empty field ${key} is missing from the tab instead of being marked empty`).toBeVisible();
        await expect(
          section.locator('.ui-collapsible-section__body'),
          `the empty section ${key} draws an empty body rather than saying it is empty`,
        ).toHaveText(expected);
        continue;
      }
      const band = drawn.find((candidate) => candidate.label === key);
      expect(band, `the empty field ${key} is missing from the tab instead of being marked empty`).toBeDefined();
      expect(band!.value, `the empty field ${key} is not marked as empty`).toBe(expected);
      expect(band!.empty).toBe(true);
    }

    // REQ-7 — the exit code of a container that exited cleanly, and a boolean the payload carries.
    const exitCode = await bandNamed(sectionNamed(page, 'State'), 'ExitCode');
    expect(exitCode, 'a zero exit code is marked empty or toned as bad news').toMatchObject({ value: '0', empty: false, danger: false });
    const booleans = drawn.filter((band) => band.value === 'false');
    expect(booleans.length, 'the payload carries no false at all, so this check proves nothing').toBeGreaterThan(0);
    expect(
      booleans.filter((band) => band.empty).map((band) => band.label),
      'a false is marked empty',
    ).toEqual([]);

    await closeContainerDetail(page);
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-13, REQ-14 — a nested object is a labelled group of its own fields and an array is a list of
// positional items; no value anywhere is a line of stringified JSON.
test('nesting is drawn as nesting, and no value is a line of JSON', async ({ page }) => {
  const name = `vexel-e2e-inspect-nesting-${Date.now()}`;
  try {
    await createRunningContainer(name, ['-p', '0:80']);
    const detail = await openInspect(page, name);
    await openEverySection(page);

    const groups = await detail.locator('.ui-payload-group').evaluateAll((elements) =>
      elements.map((element) => ({
        label: (element.querySelector('.ui-payload-group__label')?.textContent ?? '').trim(),
        count: (element.querySelector('.ui-payload-group__count')?.textContent ?? '').trim(),
      })),
    );
    console.log(`[REQ-13] the tab draws ${groups.length} nested groups`);
    expect(groups.length, 'the tab draws no nested group at all, so nesting cannot have been rendered').toBeGreaterThan(3);
    expect(groups.every((group) => group.count.length > 0), 'a nested group states nothing about what it holds').toBe(true);

    // REQ-14 — an array reads as separate, positional items rather than as one joined string.
    const positional = groups.filter((group) => /^\[\d+\]$/.test(group.label));
    const positionalBands = (await bandsOf(detail)).filter((band) => /^\[\d+\]$/.test(band.label));
    expect(positional.length + positionalBands.length, 'no item of any array is identified by its position').toBeGreaterThan(0);

    // REQ-13 — nothing on the surface is stringified JSON.
    const stringified = (await bandsOf(detail)).filter((band) => /^\s*[[{][\s\S]*[\]}]\s*$/.test(band.value));
    expect(stringified.map((band) => `${band.label}: ${band.value.slice(0, 60)}`), 'a value is drawn as a line of stringified JSON').toEqual([]);

    await closeContainerDetail(page);
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-5 — the ten curated properties survive as fields of the payload, each in the section its own
// key belongs to, and no summary block stands at the head of the tab.
test('the ten former properties are each found in the section of their own key, with no summary block', async ({ page }) => {
  const name = `vexel-e2e-inspect-ten-${Date.now()}`;
  try {
    await createExitedContainer(name, 0);
    const detail = await openInspect(page, name);
    const payload = await inspectPayloadOf(page, name);
    await openEverySection(page);

    const scalars = await bandsOf(sectionNamed(page, 'Fields'));
    const state = await bandsOf(sectionNamed(page, 'State'));
    expect(scalars.find((band) => band.label === 'Id')!.value, 'the tab does not carry the daemon’s own container id').toBe(await idOf(name));
    expect(scalars.find((band) => band.label === 'Name')!.value).toBe(`/${name}`);
    expect(scalars.find((band) => band.label === 'Created')!.value).toBe(payload.Created);
    expect(scalars.map((band) => band.label), 'the image the container runs is not among the payload’s own fields').toContain('Image');
    expect(state.map((band) => band.label), 'the lifecycle facts are not under the State section').toEqual(
      expect.arrayContaining(['Status', 'StartedAt', 'FinishedAt', 'ExitCode']),
    );

    // The command and the entry point, wherever the payload puts them — found rather than assumed.
    const everything = await bandsOf(detail);
    const groups = await detail.locator('.ui-payload-group__label').allTextContents();
    const named = new Set([...everything.map((band) => band.label), ...groups.map((label) => label.trim())]);
    for (const key of ['Cmd', 'Entrypoint', 'Path']) {
      expect(named.has(key), `${key} is nowhere in the tab, so a former property was lost`).toBe(true);
    }

    // REQ-5 — nothing is drawn twice, and no curated block heads the tab.
    expect(everything.filter((band) => band.label === 'ExitCode').length, 'the exit code is drawn twice').toBe(1);
    await expect(detail.getByText('Identity', { exact: true }), 'the abolished Identity group is still drawn').toHaveCount(0);
    await expect(detail.getByText('Lifecycle', { exact: true }), 'the abolished Lifecycle group is still drawn').toHaveCount(0);
    await expect(detail.locator('.ui-payload-explorer .ui-definition-list'), 'a curated reading list still heads the tab').toHaveCount(0);

    await closeContainerDetail(page);
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-15, REQ-16, REQ-17, REQ-18, REQ-35 — the daemon's own key name labels the field, the readable
// date / byte unit / yes-no / pill / binding is drawn **beside** the literal, and a token is in full.
test('a value is readable and still exactly what the daemon said', async ({ page }) => {
  const name = `vexel-e2e-inspect-readings-${Date.now()}`;
  try {
    await createRunningContainer(name, ['--memory', '512m', '-p', '0:80', '-e', 'VEXEL_TOKEN=s3cr3t-value-in-full']);
    const detail = await openInspect(page, name);
    const payload = await inspectPayloadOf(page, name);
    await openEverySection(page);

    // REQ-16 — the state as a pill, and REQ-17 — beside the daemon's own literal, not instead of it.
    const status = await bandNamed(sectionNamed(page, 'State'), 'Status');
    expect(status.value, 'the pill replaced the daemon’s own literal').toBe((payload.State as Record<string, unknown>).Status);
    expect(status.pill, 'the state is drawn as a plain value rather than as a pill').toBe('RUNNING');

    // REQ-18 — Go's zero time, the one documented instant sentinel, and REQ-16 — a real instant.
    const finished = await bandNamed(sectionNamed(page, 'State'), 'FinishedAt');
    expect(finished.value, 'the sentinel replaced the daemon’s own literal').toBe('0001-01-01T00:00:00Z');
    expect(finished.reading, 'the zero instant is not read as never').toBe('never');
    const started = await bandNamed(sectionNamed(page, 'State'), 'StartedAt');
    expect(started.value).toBe((payload.State as Record<string, unknown>).StartedAt);
    expect(started.reading.length, 'a real instant carries no readable date beside it').toBeGreaterThan(0);
    expect(started.reading, 'the readable date is the literal again').not.toBe(started.value);

    // REQ-16 — a byte count with a unit, beside the number the daemon sent.
    const memory = await bandNamed(sectionNamed(page, 'HostConfig'), 'Memory');
    expect(memory.value, 'the byte reading replaced the daemon’s own number').toBe(String((payload.HostConfig as Record<string, unknown>).Memory));
    expect(memory.reading, 'the memory limit carries no byte unit beside it').toMatch(/^[\d.]+ (B|KB|MB|GB|TB)$/);

    // REQ-16 — a boolean as yes/no, and REQ-16 — a port binding read host to container.
    const privileged = await bandNamed(sectionNamed(page, 'HostConfig'), 'Privileged');
    expect(privileged, 'a boolean is not read as yes/no beside its literal').toMatchObject({ value: 'false', reading: 'no' });
    const bindings = (await bandsOf(sectionNamed(page, 'NetworkSettings'))).filter((band) => band.label === 'HostPort');
    expect(bindings.length, 'the fixture published no port, so the binding reading cannot be checked').toBeGreaterThan(0);
    const bindingGroup = await detail
      .locator('.ui-payload-group')
      .filter({ has: page.locator('.ui-payload-band__label', { hasText: /^HostPort$/ }) })
      .first()
      .locator('.ui-payload-band__reading')
      .first()
      .textContent();
    expect(bindingGroup ?? '', 'a port binding is not read as host to container').toMatch(/:\d+ → 80\/tcp$/);

    // REQ-35 — an environment variable carrying a token is on screen in full, like any other value.
    const env = (await bandsOf(detail)).map((band) => band.value);
    expect(env, 'a value carrying a token is masked, truncated or hidden').toContain('VEXEL_TOKEN=s3cr3t-value-in-full');

    // REQ-15 — every label on screen is a key the response itself carries.
    const keysInPayload = new Set(pathsOfPayload(payload).map((path) => path.split(' › ').at(-1)!));
    const invented = (await bandsOf(detail)).map((band) => band.label).filter((label) => !keysInPayload.has(label));
    expect(invented, 'a field is labelled with something other than the daemon’s own key name').toEqual([]);

    await closeContainerDetail(page);
  } finally {
    await removeContainerQuietly(name);
  }
});

/** The colour a band's value is painted, beside an ordinary one and the application's danger roles. */
async function exitCodeColouring(detail: Locator): Promise<{ exitCode: string; ordinary: string; dangerRoles: string[] }> {
  return await detail.evaluate((panel) => {
    const valueOf = (label: string) => {
      const band = Array.from(panel.querySelectorAll('.ui-payload-band')).find(
        (candidate) => candidate.querySelector('.ui-payload-band__label')?.textContent === label,
      );
      return band?.querySelector('.ui-payload-band__value') as HTMLElement | undefined;
    };
    const probe = document.createElement('span');
    panel.append(probe);
    const roleOf = (token: string) => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    };
    const dangerRoles = [roleOf('--color-danger'), roleOf('--color-danger-strong')];
    probe.remove();
    return {
      exitCode: getComputedStyle(valueOf('ExitCode')!).color,
      ordinary: getComputedStyle(valueOf('StartedAt')!).color,
      dangerRoles,
    };
  });
}

// REQ-16 — a container that was killed says so where it is read, and one that exited cleanly is
// drawn like every other value. Two fixtures, because one container cannot show both.
test('a non-zero exit code reads as bad news and a zero one does not', async ({ page }) => {
  const stem = `vexel-e2e-inspect-exit-${Date.now()}`;
  const badly = `${stem}-badly`;
  const cleanly = `${stem}-cleanly`;
  try {
    await createExitedContainer(badly, 3);
    await createExitedContainer(cleanly, 0);

    const onBadly = await openInspect(page, badly);
    expect(await bandNamed(sectionNamed(page, 'State'), 'ExitCode')).toMatchObject({ value: '3', danger: true });
    const bad = await exitCodeColouring(onBadly);
    console.log(`[REQ-16] exited 3: exit code ${bad.exitCode}, an ordinary value ${bad.ordinary}, the danger roles ${bad.dangerRoles.join(' / ')}`);
    expect(bad.exitCode, 'a non-zero exit code is drawn in the ordinary value colour, so it reads as no news at all').not.toBe(bad.ordinary);
    expect(bad.dangerRoles, 'a non-zero exit code is drawn in some colour of its own rather than the application’s danger role').toContain(bad.exitCode);
    await closeContainerDetail(page);

    const onCleanly = await openInspect(page, cleanly);
    expect(await bandNamed(sectionNamed(page, 'State'), 'ExitCode')).toMatchObject({ value: '0', danger: false });
    const clean = await exitCodeColouring(onCleanly);
    console.log(`[REQ-16] exited 0: exit code ${clean.exitCode}, an ordinary value ${clean.ordinary}`);
    expect(clean.exitCode, 'a container that exited cleanly is drawn as bad news').toBe(clean.ordinary);
    await closeContainerDetail(page);
  } finally {
    await removeContainerQuietly(badly);
    await removeContainerQuietly(cleanly);
  }
});

// REQ-19, REQ-20, REQ-21 — the find filters the whole payload, opens the sections holding matches
// however deep they sit, states the count, and clearing it puts the tab back the way it opened.
// Driven with a real keyboard: the term is typed and then deleted key by key.
test('the operator finds a field without opening a single section, and clearing the find restores the tab', async ({ page }) => {
  const name = `vexel-e2e-inspect-find-${Date.now()}`;
  try {
    await createRunningContainer(name, ['-p', '0:80']);
    const detail = await openInspect(page, name);
    const entry = await sectionsOf(detail);

    const find = detail.getByLabel('Find in payload');
    await clickAtItsCentre(page, find, 'the find control');
    await page.keyboard.type('RestartPolicy');

    const filtered = await sectionsOf(detail);
    console.log(`[REQ-19] filtering on RestartPolicy leaves ${JSON.stringify(filtered.map((section) => section.title))}`);
    expect(filtered.map((section) => section.title), 'the find did not filter the sections down to the ones holding a match').toEqual(['HostConfig']);
    expect(filtered.every((section) => section.open), 'the section holding the match did not open itself').toBe(true);
    await expect(detail.locator('.ui-payload-explorer__matches'), 'the find states no count').toHaveText(/^\d+ matching fields?$/);
    expect((await bandsOf(detail)).map((band) => band.label), 'fields that do not match are still on screen').toEqual(['Name', 'MaximumRetryCount']);

    // REQ-21 — a value only present inside a collapsed, deeply nested object is found all the same.
    for (let index = 0; index < 'RestartPolicy'.length; index += 1) await page.keyboard.press('Backspace');
    await page.keyboard.type('80/tcp');
    await expect(detail.locator('.ui-payload-explorer__matches')).toHaveText(/^\d+ matching fields?$/);
    const deep = await sectionsOf(detail);
    expect(deep.map((section) => section.title), 'a match buried in a nested object did not open its own section').toContain('NetworkSettings');

    // REQ-20 — a search matching nothing says so rather than leaving a blank tab.
    for (let index = 0; index < '80/tcp'.length; index += 1) await page.keyboard.press('Backspace');
    await page.keyboard.type('vexel-nothing-carries-this');
    await expect(detail.locator('.ui-empty-state'), 'a search matching nothing left the tab blank').toBeVisible();
    await expect(detail.locator('.ui-payload-explorer__matches')).toHaveText('0 matching fields');

    // REQ-20 — cleared with a real keyboard, the tab is exactly the way it opened.
    for (let index = 0; index < 'vexel-nothing-carries-this'.length; index += 1) await page.keyboard.press('Backspace');
    await expect(find, 'the find control still holds text after the term was deleted key by key').toHaveValue('');
    await expect(detail.locator('.ui-payload-explorer__matches')).toHaveCount(0);
    expect(await sectionsOf(detail), 'clearing the find did not put the tab back the way it opened').toEqual(entry);

    await closeContainerDetail(page);
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-12, REQ-24 — the raw payload is the last section, closed on entry, the whole response as real
// selectable text with no action of its own, and nothing in the tab is a copy affordance.
test('the raw payload is the last section, selectable, and no copy control appears anywhere', async ({ page }) => {
  const name = `vexel-e2e-inspect-raw-${Date.now()}`;
  try {
    await createRunningContainer(name);
    const detail = await openInspect(page, name);
    const explorer = detail.locator('.ui-payload-explorer');

    const raw = sectionNamed(page, 'Raw payload');
    await expect(raw.locator('.ui-collapsible-section__header')).toHaveAttribute('aria-expanded', 'false');
    await expect(detail.locator('.ui-code-viewer'), 'the payload is drawn before its section has been opened').toHaveCount(0);

    await clickAtItsCentre(page, raw.locator('.ui-collapsible-section__header'), 'the Raw payload header');
    const block = detail.locator('.ui-code-viewer__code').last();
    await expect(block).toBeVisible({ timeout: 20_000 });
    const text = (await block.textContent()) ?? '';
    expect(JSON.parse(text).Id, 'the block does not hold the daemon’s own payload for this container').toBe(await idOf(name));
    await expect(block, 'the payload cannot be selected with the mouse any more').toHaveCSS('user-select', /^(auto|text)$/);

    // REQ-24 — the tab's whole control inventory: the find field and the section headers.
    const controls = await explorer.evaluate((element) =>
      Array.from(element.querySelectorAll<HTMLElement>('button, [role="button"], a[href], input:not([type="hidden"])')).map(
        (control) => control.className || control.tagName.toLowerCase(),
      ),
    );
    const headers = await explorer.locator('.ui-collapsible-section__header').count();
    expect(controls.length, `the tab holds ${controls.length} controls against ${headers} section headers and one find field: ${controls.join(', ')}`).toBe(
      headers + 1,
    );
    await expect(detail.locator('.ui-code-viewer__actions'), 'the payload block carries an action row').toHaveCount(0);
    expect((await explorer.textContent())?.toLowerCase() ?? '', 'the tab offers something to copy').not.toContain('copy to clipboard');

    await closeContainerDetail(page);
  } finally {
    await removeContainerQuietly(name);
  }
});
