import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { DataTable, type DataTableColumn, type DataTableColumnWidth } from '../../src/ui';

/**
 * The column contract's **refusal**, which is the only half of it a running
 * test cannot show (`ui-library/specs/data-table.md`,
 * `plan-ui-coherence-optimisation/REQ-8`).
 *
 * The contract states the admissible widths as a closed set — `'<n>fr'`,
 * `'<n>px'`, `'var(--token)'` — and states that "an intrinsic width is refused,
 * and refused **at the type**": `'max-content'`, `'min-content'`, `'auto'`,
 * `'fit-content()'` and a hand-written `'minmax()'` (which could carry one) "do
 * not compile". A value that does not compile leaves nothing behind at runtime
 * to assert, so what stands in its place is `@ts-expect-error`: it fails the
 * canonical build the moment the union is widened back, because the error it
 * expects has stopped being reported.
 *
 * That is why this file is where it is. `npm run test:typecheck -w client` is
 * the pass that checks `test/`, and it is the whole of what the refusals below
 * are checked by — vitest strips the types without looking at them, so the
 * assertions that run are the **admissions**: the forms the contract does keep,
 * resolving to the track it says they do.
 *
 * Why the refusal exists at all, per the spec: every row is a grid of its own
 * and the header another, each handed the same template string, so an intrinsic
 * track resolves against the content of whichever grid it is in — 112.3px in
 * the header against 136.8px and 164.0px on two kinds of row of the dense images
 * table — and carries every column after it out of line.
 */

interface Row {
  id: string;
}

const rows: Row[] = [{ id: 'row-0' }];

function columnOfWidth(width: DataTableColumnWidth): DataTableColumn<Row> {
  return { id: 'measured', header: 'MEASURED', width, render: (row) => row.id };
}

/** The single track the component writes for one column. */
function trackOf(column: DataTableColumn<Row>): string {
  const { container } = render(<DataTable columns={[column]} rows={rows} rowKey={(row) => row.id} />);
  return container.querySelector<HTMLElement>('.ui-data-table__row')?.style.gridTemplateColumns ?? '';
}

afterEach(cleanup);

describe('DataTableColumnWidth — the forms a column may state (data-table.md)', () => {
  // data-table.md — "a **closed** set of forms: `'<n>fr'`, `'<n>px'`, or
  // `'var(--token)'` holding one of those"
  it('admits a flex factor, a length and a token, each carried into the track it declares', () => {
    // A flexible width keeps its factor (the floor under it is
    // `data-table-column-minimums.test.tsx`'s subject, not this file's).
    expect(trackOf(columnOfWidth('1fr'))).toContain('1fr');
    cleanup();
    expect(trackOf(columnOfWidth('1.6fr'))).toContain('1.6fr');
    cleanup();
    // A length states its own minimum, so it is used exactly as given.
    expect(trackOf(columnOfWidth('88px'))).toBe('88px');
    cleanup();
    expect(trackOf(columnOfWidth('var(--data-table-action-column-width)'))).toBe('var(--data-table-action-column-width)');
  });

  // data-table.md — "**An intrinsic width is refused, and refused at the
  // type**: `'max-content'`, `'min-content'`, `'auto'`, `'fit-content()'` and a
  // hand-written `'minmax()'` (which could carry one) do not compile."
  //
  // Each `@ts-expect-error` below is the assertion: it is itself an error when
  // the value it precedes has stopped being one, so widening the union back
  // fails the typecheck pass rather than passing quietly.
  it('refuses every intrinsic width, and the minmax that could carry one, at the type', () => {
    const refused = [
      // @ts-expect-error an intrinsic track resolves against its own grid's content, so it takes one value in the header and another on every row
      columnOfWidth('max-content'),
      // @ts-expect-error the same, at the other end
      columnOfWidth('min-content'),
      // @ts-expect-error 'auto' is intrinsic under a grid's free space too
      columnOfWidth('auto'),
      // @ts-expect-error fit-content() resolves against content by definition
      columnOfWidth('fit-content(200px)'),
      // @ts-expect-error a hand-written minmax() could carry an intrinsic value in either half; a floor is stated as minWidth and the component writes the minmax
      columnOfWidth('minmax(240px, 3fr)'),
    ];

    expect(refused).toHaveLength(5);
  });

  // The same closed set governs the floor, data-table.md giving `minWidth` the
  // same type: a column may not smuggle an intrinsic value in through it.
  it('refuses an intrinsic value stated as the floor as well', () => {
    const column: DataTableColumn<Row> = {
      id: 'measured',
      header: 'MEASURED',
      width: '3fr',
      // @ts-expect-error minWidth is a DataTableColumnWidth, so it admits exactly what width admits
      minWidth: 'max-content',
      render: (row) => row.id,
    };

    expect(column.id).toBe('measured');
  });
});
