import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { DataTable, type DataTableColumn } from '../../src/ui';

/**
 * The column contract at the component's own level
 * (plan-ui-coherence-optimisation/REQ-7, REQ-9, REQ-10; ui-library/specs/data-table.md,
 * ui-library/specs/design-tokens.md).
 *
 * What is checked here is the **track a column definition produces** and the
 * stylesheet rules the pan is built on — the two things that can be read without
 * a layout engine. jsdom lays nothing out, so the geometry the requirements are
 * actually about (no track at 0px, cells reachable, header and row aligned) is
 * asserted in the browser, in `client/e2e/list-row-columns.spec.ts`. Neither
 * file replaces the other: this one says the rule is declared, that one says the
 * rule holds on screen.
 */

const CSS_ROOT = join(process.cwd(), 'src/ui');

/** The declarations of one CSS rule; jsdom loads no stylesheet, so the rule is read from the file. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  const match = new RegExp(`(?:^|\\}|\\*/)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`no CSS rule for ${selector}`);
  return match[1];
}

interface Row {
  id: string;
}

const rows: Row[] = [{ id: 'row-0' }];

function cell(id: string, extra: Partial<DataTableColumn<Row>> = {}): DataTableColumn<Row> {
  return { id, header: id.toUpperCase(), render: (row) => row.id, ...extra };
}

/** The declared tracks of the header and of a row, as the component writes them. */
function tracksOf(columns: DataTableColumn<Row>[]): { header: string; row: string } {
  const { container } = render(<DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />);
  const header = container.querySelector<HTMLElement>('.ui-data-table__header');
  const row = container.querySelector<HTMLElement>('.ui-data-table__row');
  return { header: header?.style.gridTemplateColumns ?? '', row: row?.style.gridTemplateColumns ?? '' };
}

/** Splits a `grid-template-columns` value into one string per track, respecting `minmax(...)`/`calc(...)`. */
function splitTracks(value: string): string[] {
  const tracks: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ' ' && depth === 0) {
      if (current.length > 0) tracks.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  if (current.length > 0) tracks.push(current);
  return tracks;
}

/** The two halves of a `minmax(min, max)` track. */
function minmaxParts(track: string): { minimum: string; maximum: string } {
  const inner = /^minmax\((.*)\)$/.exec(track.trim());
  if (!inner) throw new Error(`the track "${track}" is not a minmax(), so it states no minimum of its own`);
  let depth = 0;
  for (let index = 0; index < inner[1].length; index += 1) {
    const character = inner[1][index];
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      return { minimum: inner[1].slice(0, index).trim(), maximum: inner[1].slice(index + 1).trim() };
    }
  }
  throw new Error(`the track "${track}" is a minmax() with a single argument`);
}

function trackFor(column: DataTableColumn<Row>): string {
  const tracks = splitTracks(tracksOf([column]).row);
  expect(tracks).toHaveLength(1);
  return tracks[0];
}

afterEach(cleanup);

describe('DataTable — a column carries a minimum it may not resolve below', () => {
  // data-table.md: "Omitted, a flexible `width` takes the flex factor times
  // `--data-table-column-min-width`" — and the default `width` is `1fr`, so the
  // column a screen declares nothing about is exactly the case REQ-7 is about.
  it('gives a column that declares no width a floor of the column-minimum token', () => {
    const track = trackFor(cell('image'));

    const { minimum, maximum } = minmaxParts(track);
    expect(minimum).toContain('--data-table-column-min-width');
    expect(maximum).toBe('1fr');
  });

  // data-table.md / design-tokens.md: the floor is scaled by the flex factor —
  // "a 1.8fr track never below 1.8 × 72px" — which is what keeps a compressed
  // table in the proportions it was declared with instead of equalising it.
  it('scales a flexible column’s floor by its own flex factor', () => {
    for (const [width, factor] of [
      ['1.8fr', '1.8'],
      ['1.2fr', '1.2'],
      ['0.6fr', '0.6'],
      ['2fr', '2'],
    ] as const) {
      const { minimum, maximum } = minmaxParts(trackFor(cell('name', { width })));

      expect(maximum, `a ${width} column no longer resolves up to ${width} when there is room for it`).toBe(width);
      expect(minimum, `the floor under a ${width} column does not reference the column-minimum token`).toContain(
        '--data-table-column-min-width',
      );
      expect(minimum, `the floor under a ${width} column is not scaled by its flex factor (${factor})`).toContain(factor);
      cleanup();
    }
  });

  // data-table.md: a `width` that is a length — a px value, or a token holding
  // one — "is its own minimum and is used as given". The hand-written
  // `minmax()` this list used to carry went out with the intrinsic widths: the
  // admissible set is now closed to `'<n>fr'`, `'<n>px'` and `'var(--token)'`,
  // "a hand-written `minmax()` (which could carry one)" among the forms that do
  // not compile — see `data-table-column-width-refusal.test.ts`, and the
  // reassembly of the one call site that declared one, below. This is also
  // REQ-9's half at this level: the action column's track is a fixed length, so
  // it neither grows nor shrinks with the data columns beside it.
  it('leaves a length exactly as the screen declared it', () => {
    for (const width of ['20px', 'var(--data-table-action-column-width)', 'var(--data-table-menu-action-column-width)'] as const) {
      expect(trackFor(cell('fixed', { width })), `the declared width ${width} was rewritten`).toBe(width);
      cleanup();
    }
  });

  // data-table.md: "Stated with a flexible `width`, it is the floor and the
  // component writes the `minmax()` itself" — which is how a column that used
  // to declare `minmax(240px, 3fr)` of its own states the same track now
  // (`ContainerProcessesView`'s command column). The track must come back out
  // identical, or the rewrite has changed a layout it only meant to restate.
  it('reassembles a flexible width and its floor into the minmax a column used to write by hand', () => {
    expect(trackFor(cell('command', { width: '3fr', minWidth: '240px' }))).toBe('minmax(240px, 3fr)');
  });

  // data-table.md: `minWidth` is "the width that column may never resolve
  // below", stated by a column that needs a different floor from the derived one.
  it('takes an explicit minWidth as the floor, over the derived one', () => {
    expect(minmaxParts(trackFor(cell('name', { width: '1.8fr', minWidth: '200px' })))).toEqual({ minimum: '200px', maximum: '1.8fr' });
    cleanup();
    expect(minmaxParts(trackFor(cell('fixed', { width: '200px', minWidth: '120px' })))).toEqual({ minimum: '120px', maximum: '200px' });
  });

  // data-table.md: "A row and the header share one width and one set of resolved
  // tracks", which is what keeps a column and the label naming it aligned at
  // every pan offset (REQ-8).
  it('lays the header and the rows out on one identical set of tracks', () => {
    const columns = [
      cell('status', { width: '20px' }),
      cell('name', { width: '1.8fr' }),
      cell('image'),
      cell('size', { width: '0.6fr', align: 'end' }),
      cell('actions', { width: 'var(--data-table-action-column-width)' }),
    ];

    const { header, row } = tracksOf(columns);

    expect(splitTracks(row)).toHaveLength(columns.length);
    expect(header).toBe(row);
  });
});

describe('DataTable — the stylesheet rules the horizontal pan is built on', () => {
  const css = readFileSync(join(CSS_ROOT, 'data/data-table.css'), 'utf8');

  // data-table.md: "it is the list region itself (`.ui-data-table`) that
  // scrolls", because the header row is laid out on the same tracks as the rows
  // and lives outside the body's scroll region (REQ-8).
  it('makes the list region the box that pans horizontally', () => {
    expect(ruleBody(css, '.ui-data-table')).toMatch(/overflow-x:\s*auto/);
  });

  // data-table.md: "Both grow to the width their columns need; the body's own
  // scroll region grows with them and therefore never scrolls horizontally
  // itself" — the row, the header and that region all sized to their content.
  it('sizes the row, the header and the body’s scroll region to the width their columns need', () => {
    expect(ruleBody(css, '.ui-data-table__row')).toMatch(/min-width:\s*min-content/);
    expect(ruleBody(css, '.ui-data-table__header')).toMatch(/min-width:\s*min-content/);
    expect(ruleBody(css, '.ui-data-table > .ui-scroll-area')).toMatch(/min-width:\s*min-content/);
  });

  // data-table.md: "A row does not clip on the inline axis: its overflow is the
  // table's to scroll, not the row's to hide. It still clips on the block axis"
  // — the half the delivered `overflow: hidden` was actually protecting (REQ-8).
  it('stops the row clipping on the inline axis while it still clips on the block axis', () => {
    const row = ruleBody(css, '.ui-data-table__row');

    expect(row).toMatch(/overflow-x:\s*visible/);
    expect(row).toMatch(/overflow-y:\s*(clip|hidden)/);
    expect(row, 'a single `overflow` shorthand puts the inline-axis clipping back').not.toMatch(/overflow:\s*hidden/);
  });
});

describe('the column minimum is the library’s, and every screen inherits it', () => {
  // design-tokens.md: "--data-table-column-min-width (72px) — the floor under a
  // flexible column"; every value used by the library is a token declared there.
  it('declares the column minimum as a token, with the two action-column widths', () => {
    const tokens = readFileSync(join(CSS_ROOT, 'tokens.css'), 'utf8');

    expect(tokens).toMatch(/--data-table-column-min-width:\s*\d/);
    expect(tokens).toMatch(/--data-table-action-column-width:\s*\d/);
    expect(tokens).toMatch(/--data-table-menu-action-column-width:\s*\d/);
  });

  /** Every `.ts`/`.tsx`/`.css` file of feature code — everything under `src/` except `src/ui/`. */
  function featureFiles(): string[] {
    const sourceRoot = join(process.cwd(), 'src');
    const found: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.(ts|tsx|css)$/.test(entry.name)) continue;
        if (relative(sourceRoot, path).split('/')[0] === 'ui') continue;
        found.push(relative(sourceRoot, path));
      }
    };
    walk(sourceRoot);
    return found;
  }

  function stating(pattern: RegExp): string[] {
    const sourceRoot = join(process.cwd(), 'src');
    return featureFiles().filter((file) => pattern.test(readFileSync(join(sourceRoot, file), 'utf8')));
  }

  // REQ-10, data-table.md — "The default floor (`--data-table-column-min-width`) and its scaling by
  // a column's flex factor are the component's, applied by construction; no screen declares them
  // again, states a breakpoint-conditional column set, or writes a width to compensate for a column
  // the component failed to size. That is the line REQ-10 draws."
  it('leaves the library’s own floor and its scaling unrestated outside the library', () => {
    const offenders = stating(/--data-table-column-min-width/);

    expect(offenders, `these files outside the library restate the library's own floor: ${offenders.join(', ')}`).toEqual([]);
  });

  // data-table.md — "**A caller may declare `minWidth` for a column whose content it knows**, and
  // the component still resolves the track (it writes the `minmax()`) … `ContainerProcessesView`'s
  // `Command` column is the case this is written for — the only caller in the client that declares
  // one."
  //
  // Pinned rather than bounded, as the retired list component's budget was: it fails when another screen
  // quietly acquires a floor of its own — which is how a hand-tuned width would arrive — and it
  // fails when this one loses it without the sentence above being changed with it.
  it('has a column floor declared by the one screen the contract names, and by no other', () => {
    expect(stating(/\bminWidth[=:]/)).toEqual([join('containers', 'ContainerProcessesView.tsx')]);
  });
});
