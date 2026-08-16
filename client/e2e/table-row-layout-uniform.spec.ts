/**
 * The object list's column guarantee, across every table in the product
 * (`ui-library/specs/data-table.md`; `plan-ui-coherence-optimisation/REQ-8`,
 * `REQ-10`, `REQ-39`).
 *
 * The contract: "**A row and the header share one width and one set of resolved
 * tracks**, so a column and the label naming it are aligned at every pan offset
 * — measured as identical `x` for every header cell and its row cell, on
 * **every** row". And the reason it needs measuring on every row rather than on
 * one: "the table is not one grid" — the header is a grid and each row is a
 * grid of its own, each handed the same template string, so a track that
 * resolves against content takes one value in the header and another on every
 * row whose content differs.
 *
 * That is why this file measures **resolved** tracks (`getComputedStyle`) and
 * not declared ones: a declared `max-content` and a declared `1.6fr` look
 * equally reasonable in the source, and the whole defect was that the first of
 * them resolves per row. One distinct row layout per table, with the header's
 * identical to it, is the observable form of the guarantee.
 *
 * It sweeps every table the operator can reach rather than the migrated screens
 * alone, because the repair is the library's and REQ-10 is that every adopter
 * inherits it by construction. A table with no rows is reported and skipped: it
 * has no row layout to compare a header against.
 *
 * The fixtures are this file's own — a container, an image tag, a volume and a
 * network, each labelled and each removed in an `afterAll` — so the sweep never
 * depends on what the operator's daemon happens to hold, and never asserts a
 * count or an emptiness.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';

interface Viewport {
  width: number;
  height: number;
}

const VIEWPORTS: Viewport[] = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
];

/** The one viewport where a table's columns exceed the box it is read in, so there is a pan. */
const PHONE: Viewport = { width: 375, height: 812 };

/** The screens holding an object list, by the id the preference holds and the heading each draws. */
const SCREENS: { id: string; heading: string }[] = [
  { id: 'containers', heading: 'Containers' },
  { id: 'images-layers', heading: 'Images & layers' },
  { id: 'volumes-networks', heading: 'Volumes & networks' },
  { id: 'registries', heading: 'Registries' },
  { id: 'builders-cache', heading: 'Builders & cache' },
  // plan-ui-coherence-optimisation/REQ-42 — the contexts list joined the object list in batch 9,
  // and this sweep is written to cover **every** table the operator can reach.
  { id: 'contexts', heading: 'Contexts' },
  // plan-ui-coherence-optimisation/REQ-46 — and the two plugin inventories in batch 10. The daemon
  // list is empty on a machine running no managed plugin: it is reported and skipped by the sweep
  // below, exactly as any other empty list is, while the CLI list is the fifteen-row column REQ-47
  // is measured on.
  { id: 'plugins', heading: 'Plugins' },
  // plan-ui-coherence-optimisation/REQ-49 — the compose project list, and the nested header-less
  // list every project row carries, joined the object list in batch 11. Both are swept, and the
  // nested one is the first list in the product whose header is drawn nowhere: it therefore has no
  // header to compare its rows against, and the sweep reports it and moves on, exactly as it does
  // for a list with no row. On a machine running no compose project the outer list is empty too.
  { id: 'compose', heading: 'Compose' },
  // plan-ui-coherence-optimisation/REQ-55 — the five swarm inventories joined the object list in
  // batch 12, the last of the migrations, and this sweep is written to cover **every** table the
  // operator can reach. On a daemon outside a swarm the screen draws no list at all — the panels are
  // rendered only where there is a cluster to read (REQ-52) — so the sweep finds nothing here and
  // moves on, exactly as it does for any empty list. Nothing in this file initialises a swarm to
  // make it find one: swarm mode is a property of the whole daemon, and the geometry of these rows
  // is measured against a stubbed reading in `swarm-row-geometry.spec.ts` (REQ-56).
  { id: 'swarm', heading: 'Swarm' },
];

/** The widths a column may not state: each of them resolves against its own grid's content. */
const INTRINSIC = /\b(max-content|min-content|fit-content|auto)\b/;

interface TableGeometry {
  /** The card's section header, or the table's position, so a failure names the list. */
  label: string;
  headers: string[];
  headerX: number[];
  headerComputed: string;
  declared: string;
  rowCount: number;
  /** One entry per distinct resolved row layout, with the rows reporting it. */
  layouts: { computed: string; rows: string[] }[];
  /**
   * The list draws no header at all — the nested service list a compose project
   * row carries (`hideHeader`, compose-screen.md). Its rows still owe one set of
   * resolved tracks; what it has no header to be compared against is the half of
   * the guarantee that needs one.
   */
  headerless: boolean;
  /** Rows whose cell x differs from the header cell above it, with the figures. */
  misaligned: string[];
  clientWidth: number;
  scrollWidth: number;
}

/** Every table on the screen, measured in one pass so no two figures come from two layouts. */
async function measureTables(page: Page): Promise<TableGeometry[]> {
  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll<HTMLElement>('.ui-frame__content .ui-data-table')).map((table, index) => {
      const card = table.closest('.ui-surface');
      // A converted list's card holds the table and nothing else, its section header sitting above
      // it (REQ-40 of the classic-table plan), so the name of the panel is the last header drawn
      // before the table rather than one inside its card. Failures name the list either way.
      const headings = Array.from(document.querySelectorAll('.ui-frame__content .ui-section-header__title'));
      const preceding = headings.filter(
        (heading) => (heading.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      );
      const label = (
        card?.querySelector('.ui-section-header__title')?.textContent ??
        preceding[preceding.length - 1]?.textContent ??
        `list #${index}`
      ).trim();
      // The multi-select checkbox is a structural control, not column data: the header carries it
      // as a header cell while the row's own is not a column cell at all (data-table.md), so it is
      // left out of the header before the two are compared column by column.
      const headerCells = Array.from(
        table.querySelectorAll<HTMLElement>('.ui-data-table__header-cell:not(.ui-data-table__select-cell)'),
      ).filter((cell) => cell.closest('.ui-data-table') === table);
      const headerElement = table.querySelector<HTMLElement>('.ui-data-table__header');
      // **A list's own rows, not the rows of a list inside it.** A compose project row carries a
      // nested list of its services, whose rows are a grid of their own with a template of their
      // own; counted into the outer list they would read as a second row layout — an offence
      // reported against the guarantee rather than against the probe.
      const rows = Array.from(table.querySelectorAll<HTMLElement>('.ui-data-table__row')).filter(
        (row) => row.closest('.ui-data-table') === table,
      );

      const layouts = new Map<string, string[]>();
      const misaligned: string[] = [];
      for (const row of rows) {
        const computed = getComputedStyle(row).gridTemplateColumns;
        const name = (row.querySelector('.ui-table-two-line-cell__title')?.textContent ?? row.textContent ?? '').trim().slice(0, 40);
        layouts.set(computed, [...(layouts.get(computed) ?? []), name]);

        const cells = Array.from(row.querySelectorAll<HTMLElement>('.ui-data-table__cell')).filter(
          (cell) => cell.closest('.ui-data-table__row') === row,
        );
        if (headerCells.length === 0) continue;
        if (cells.length !== headerCells.length) {
          misaligned.push(`${name || 'a row'} draws ${cells.length} cell(s) under ${headerCells.length} column header(s)`);
        }
        cells.forEach((cell, cellIndex) => {
          const header = headerCells[cellIndex];
          if (!header) return;
          const cellX = cell.getBoundingClientRect().x;
          const headerX = header.getBoundingClientRect().x;
          if (Math.abs(cellX - headerX) > 0.5) {
            misaligned.push(
              `${name || `row ${cellIndex}`} — ${(header.textContent ?? '').trim() || `column ${cellIndex}`}: cell x ${
                Math.round(cellX * 10) / 10
              } under header x ${Math.round(headerX * 10) / 10}`,
            );
          }
        });
      }

      return {
        label,
        headers: headerCells.map((cell) => (cell.textContent ?? '').trim()),
        headerX: headerCells.map((cell) => Math.round(cell.getBoundingClientRect().x * 10) / 10),
        headerComputed: headerElement ? getComputedStyle(headerElement).gridTemplateColumns : '',
        declared: rows[0]?.style.gridTemplateColumns ?? headerElement?.style.gridTemplateColumns ?? '',
        rowCount: rows.length,
        layouts: [...layouts].map(([computed, names]) => ({ computed, rows: names })),
        headerless: headerCells.length === 0,
        misaligned,
        clientWidth: table.clientWidth,
        scrollWidth: table.scrollWidth,
      };
    });
  });
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The pan region's `scrollLeft` once the scroll a wheel produced has stopped moving.
 *
 * A wheel is delivered to the compositor and the scroll it causes is neither instantaneous nor one
 * event; what the pin is written from is the scroll **event**, so the box is worth reading only
 * once the offset has settled and the handler has run for it.
 */
async function settledScrollLeft(page: Page, table: Locator): Promise<number> {
  let previous = Number.NaN;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const current = await table.evaluate((element) => (element as HTMLElement).scrollLeft);
    if (current === previous) return Math.round(current);
    previous = current;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
  return Math.round(previous);
}

/** The tables once the screen has stopped moving: its content arrives with a daemon read behind it. */
async function settledTables(page: Page, budget = 20_000): Promise<TableGeometry[]> {
  const deadline = Date.now() + budget;
  let previous = JSON.stringify(await measureTables(page));
  while (Date.now() < deadline) {
    await page.waitForTimeout(400);
    const current = await measureTables(page);
    const serialised = JSON.stringify(current);
    if (serialised === previous) return current;
    previous = serialised;
  }
  return await measureTables(page);
}

const RUN_ID = `${process.pid}-${Date.now()}`;
const containerName = `vexel-e2e-tracks-${RUN_ID}`;
const imageTag = `vexel-e2e-tracks-${RUN_ID}:1`;
const volumeName = `vexel-e2e-tracks-${RUN_ID}`;
const networkName = `vexel-e2e-tracks-${RUN_ID}`;

test.beforeAll(async () => {
  // Ensured at the point of use, not once for the run: the exclusive project prunes the host.
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', ['run', '-d', '--name', containerName, ...ownershipArgs(containerName), '--entrypoint', 'sleep', ALPINE_IMAGE, '600']);
  await execFileAsync('docker', ['tag', ALPINE_IMAGE, imageTag]);
  await execFileAsync('docker', ['volume', 'create', ...ownershipArgs(volumeName), volumeName]);
  await execFileAsync('docker', ['network', 'create', ...ownershipArgs(networkName), networkName]);
});

test.afterAll(async () => {
  // `-v` and not just `-f`: without it an image's anonymous volumes outlive the container.
  await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
  await execFileAsync('docker', ['rmi', '-f', imageTag]).catch(() => undefined);
  await execFileAsync('docker', ['volume', 'rm', volumeName]).catch(() => undefined);
  await execFileAsync('docker', ['network', 'rm', networkName]).catch(() => undefined);
});

for (const viewport of VIEWPORTS) {
  const at = `${viewport.width}×${viewport.height}`;

  // data-table.md — one set of resolved tracks for the header and every row, on every table the
  // product draws; REQ-10 — the repair is the library's and every adopter inherits it without
  // saying anything of its own about columns.
  test(`every table in the product shows one row layout, with its header identical to it — ${at}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(viewport);

    const offences: string[] = [];
    let measured = 0;

    for (const screen of SCREENS) {
      await openApp(page, screen.id);
      await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible({ timeout: 20_000 });
      const tables = await settledTables(page);

      for (const table of tables) {
        if (table.rowCount === 0) {
          console.log(`[REQ-8] ${at} ${screen.heading} · ${table.label}: no rows on screen, nothing to compare a header against`);
          continue;
        }
        measured += 1;
        console.log(
          `[REQ-8] ${at} ${screen.heading} · ${table.label}: ${table.rowCount} row(s), ${table.layouts.length} distinct layout(s), header x ${table.headerX.join(
            '/',
          )}, pan ${table.scrollWidth}/${table.clientWidth}`,
        );
        console.log(`[REQ-8] ${at} ${screen.heading} · ${table.label}: declared ${table.declared}`);
        for (const layout of table.layouts) console.log(`[REQ-8] ${at}   resolved ${layout.computed} — ${layout.rows.length} row(s)`);
        if (table.headerComputed !== table.layouts[0]?.computed) {
          console.log(`[REQ-8] ${at}   header   ${table.headerComputed}`);
        }

        if (table.layouts.length !== 1) {
          offences.push(
            `${screen.heading} · ${table.label}: ${table.layouts.length} row layouts — ${table.layouts
              .map((layout) => `${layout.computed} on ${layout.rows.length} row(s) (${layout.rows.slice(0, 2).join(', ')})`)
              .join(' against ')}`,
          );
        }
        // A list drawing no header of its own — the nested service list of a compose project row —
        // owes one row layout and has nothing to compare it against. Reported, and its half of the
        // guarantee left alone rather than asserted against an empty string.
        if (table.headerless) {
          console.log(`[REQ-8] ${at} ${screen.heading} · ${table.label}: draws no header, so there is none to compare its rows against`);
        } else if (table.headerComputed !== table.layouts[0].computed) {
          offences.push(`${screen.heading} · ${table.label}: the header resolves ${table.headerComputed} over rows resolving ${table.layouts[0].computed}`);
        }
        for (const misalignment of table.misaligned) {
          offences.push(`${screen.heading} · ${table.label}: ${misalignment}`);
        }
        // data-table.md — an intrinsic width is refused, so no table may have one declared on it.
        if (INTRINSIC.test(table.declared)) {
          offences.push(`${screen.heading} · ${table.label}: an intrinsic track is declared — ${table.declared}`);
        }
      }
    }

    console.log(`[REQ-8] ${at}: ${measured} table(s) measured over ${SCREENS.length} screens, ${offences.length} offence(s)`);
    expect(measured, `${at}: no table had a row on it, so this sweep proves nothing`).toBeGreaterThan(3);
    expect(offences, `${at}: a table's header and its rows are not on one set of resolved tracks`).toEqual([]);
  });
}

/**
 * data-table.md — "**An expansion is never wider than the box the table is read in, and never
 * pans.** While the table pans, `renderExpanded`'s content keeps the width of the table's own
 * visible box and stays in it as the grid pans underneath: its left edge holds the table's left
 * edge at every scroll offset."
 *
 * Asserted across every list that expands, at the one viewport where there is a pan to hold against
 * — the desktop widths fit their columns and the component writes no geometry at all. **The images
 * table is measured beside the others as the control**: it is the case batch 2 pinned and
 * `list-row-columns.spec.ts` covers, so a reading that accuses the migrated lists has to leave it
 * alone or it is accusing the probe. Volumes and networks were two of the "comfortable subjects"
 * this file measured against that control; since
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-14` they are the
 * same table the control is, and the assertion below is unchanged because it never depended on
 * which presentation drew them — build cache still asks for the retired one until batch 2 converts
 * it.
 *
 * **The pan is driven by a real wheel, and that is the whole reliability of this check.** The
 * offset is written from the pan region's **scroll event**; a programmatic `scrollLeft =` moves the
 * grid without dispatching that event in the same tick, so a box read straight after the assignment
 * reads a position the product occupies only between the assignment and its own event, and which no
 * operator can reach — `element.click()` in another costume (CLAUDE.md, "What a check drives, and
 * what it measures"). Read that way at 375×812 the build cache measured x −199, volumes −170 and
 * the **dense** images table −369, the control failing hardest because its pan is longest. Driven by
 * a wheel and sampled once each scroll has settled, none of the four moves at any offset.
 */
test('an open expansion holds the table’s left edge at every scroll offset, under a real wheel — 375×812', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize(PHONE);

  const offences: string[] = [];
  const measured: string[] = [];

  for (const screen of SCREENS) {
    await openApp(page, screen.id);
    await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible({ timeout: 20_000 });
    await settledTables(page);

    const tables = page.locator('.ui-frame__content .ui-data-table');
    for (let index = 0; index < (await tables.count()); index += 1) {
      const table = tables.nth(index);
      const rows = table.locator('.ui-data-table__row');
      if ((await rows.count()) === 0) continue;
      const list = `${screen.heading} · list #${index}`;

      // A row is selected on its **first cell**, with a real pointer: below the desktop breakpoint
      // the row is wider than the box it is read in, so its own centre can sit over another column.
      const firstCell = rows.first().locator('.ui-data-table__cell').first();
      await firstCell.scrollIntoViewIfNeeded();
      const cellBox = await firstCell.boundingBox();
      if (!cellBox) continue;
      await page.mouse.click(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2);

      const expansion = table.locator('.ui-data-table__expanded');
      if ((await expansion.count()) === 0) {
        // The registries list is this case: its rows select a registry, and the repositories list
        // carries its tags through `renderRowContent` rather than expanding a row.
        console.log(`[REQ-8] 375×812 ${list}: selecting a row opens no expansion here`);
        continue;
      }
      await expect(expansion).toBeVisible({ timeout: 20_000 });

      const geometry = await table.evaluate((element) => ({
        x: element.getBoundingClientRect().x,
        clientWidth: (element as HTMLElement).clientWidth,
        scrollWidth: (element as HTMLElement).scrollWidth,
      }));
      if (geometry.scrollWidth <= geometry.clientWidth) {
        console.log(`[REQ-8] 375×812 ${list}: the columns fit, so there is no pan to hold against`);
        continue;
      }

      // The wheel is delivered over a **row**, not over the panel: the panel scrolls nothing
      // horizontally, and a wheel there would be handed to whichever ancestor does.
      const rowBox = (await rows.first().boundingBox())!;
      await page.mouse.move(rowBox.x + Math.min(60, rowBox.width / 2), rowBox.y + rowBox.height / 2);

      const readings: string[] = [];
      let previous = -1;
      for (let step = 0; step < 12; step += 1) {
        await page.mouse.wheel(80, 0);
        // Sampled once the scroll this wheel produced has settled — after the event, which is what
        // the pin is written from, rather than in the tick that moved the grid.
        const offset = await settledScrollLeft(page, table);
        if (offset === previous) break;
        previous = offset;

        const box = (await expansion.boundingBox())!;
        readings.push(`scrollLeft ${offset} → x ${round(box.x)}, w ${round(box.width)}`);

        if (box.x - geometry.x < -0.5 || box.x - geometry.x > 1.5) {
          offences.push(
            `${list}: at scrollLeft ${offset} the panel sits at x ${round(box.x)} where the table's visible box starts at ${round(geometry.x)}`,
          );
        }
        if (box.width > geometry.clientWidth + 0.5) {
          offences.push(`${list}: at scrollLeft ${offset} the panel is ${round(box.width)}px wide in a ${geometry.clientWidth}px visible box`);
        }
        if (offset >= geometry.scrollWidth - geometry.clientWidth) break;
      }

      // The premise: the wheel really did pan the grid, over several offsets, or the series above
      // says nothing about a panel that holds still.
      expect(readings.length, `${list}: a wheel over the list moved it to no new offset at all`).toBeGreaterThan(1);
      expect(previous, `${list}: the wheel did not reach the end of the pan`).toBeGreaterThanOrEqual(geometry.scrollWidth - geometry.clientWidth - 1);
      measured.push(`${list} (table x ${round(geometry.x)}): ${readings.join('; ')}`);
      console.log(`[REQ-8] 375×812 ${list}: table x ${round(geometry.x)}, ${geometry.scrollWidth}/${geometry.clientWidth} — ${readings.join('; ')}`);
    }
  }

  console.log(`[REQ-8] 375×812: ${measured.length} panned expansion(s) measured under a real wheel, ${offences.length} offence(s)`);
  // Volumes, networks, build cache — and the images table as the control.
  expect(measured.length, 'fewer expansions panned than the four the contract is measured on').toBeGreaterThanOrEqual(4);
  expect(offences, 'an open expansion does not hold the table’s visible box while the grid pans').toEqual([]);
});
