/**
 * F5 — one object list, in two densities
 * (`plan-ui-coherence-optimisation/REQ-22`, `REQ-28`, `REQ-30`).
 *
 * The requirement is not "a comfortable variant exists": it is that a screen
 * choosing a variant chooses **a density and nothing else**. That is what makes
 * the nine screens migrating onto it inherit batch 2's column repair and batch
 * 4's truncation contract by construction, without one of them restating a
 * column minimum. So the assertions below are mostly comparisons *between* the
 * two variants — same tracks, same cells, same one-expansion-per-list — beside
 * the two things that genuinely differ: the room a row is given and the surface
 * it is drawn on.
 *
 * jsdom lays nothing out; what a variant does to a row's geometry is read from
 * the library's own stylesheet, as the other `DataTable` unit files do.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DataTable, EmptyState, type DataTableColumn, type DataTableVariant } from '../../src/ui';

afterEach(cleanup);

const css = readFileSync(join(process.cwd(), 'src', 'ui', 'data', 'data-table.css'), 'utf8');

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  const match = new RegExp(`(?:^|\\}|\\*/)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`no CSS rule for ${selector}`);
  return match[1];
}

interface Row {
  id: string;
  name: string;
}

function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({ id: `row-${index}`, name: `name-${index}` }));
}

const columns: DataTableColumn<Row>[] = [
  { id: 'status', header: 'STATUS', width: '20px', render: () => 'x' },
  { id: 'name', header: 'NAME', width: '1.8fr', render: (row) => row.name },
  { id: 'id', header: 'ID', render: (row) => row.id },
  { id: 'size', header: 'SIZE', width: '0.6fr', align: 'end', render: () => '12 MB' },
];

function rowsOnScreen(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.ui-data-table__row')];
}

describe('DataTable — the comfortable variant is a density, not a second list (REQ-22)', () => {
  // data-table.md — "`variant?: 'dense' | 'comfortable'` (default `'dense'`)": a caller that says
  // nothing gets the delivered list, which is what leaves the thirteen screens where they were
  it('is dense when no variant is stated, exactly as the delivered list is', () => {
    const first = render(<DataTable columns={columns} rows={makeRows(3)} rowKey={(row) => row.id} />);
    const silent = first.container.innerHTML;
    first.unmount();

    const stated = render(<DataTable columns={columns} rows={makeRows(3)} rowKey={(row) => row.id} variant="dense" />);

    expect(stated.container.innerHTML).toBe(silent);
  });

  // data-table.md — "Both resolve their columns through the same tracks and the same minimums":
  // the column repair is inherited by construction, not restated by the screens that migrate
  it('resolves the same tracks in both variants, header and rows alike', () => {
    const tracksOf = (variant: DataTableVariant) => {
      const { container, unmount } = render(
        <DataTable columns={columns} rows={makeRows(2)} rowKey={(row) => row.id} variant={variant} />,
      );
      const header = container.querySelector<HTMLElement>('.ui-data-table__header')?.style.gridTemplateColumns ?? '';
      const rows = [...container.querySelectorAll<HTMLElement>('.ui-data-table__row')].map(
        (row) => row.style.gridTemplateColumns,
      );
      unmount();
      return { header, rows };
    };

    const dense = tracksOf('dense');
    const comfortable = tracksOf('comfortable');

    expect(comfortable.header).toBe(dense.header);
    expect(comfortable.rows).toEqual(dense.rows);
    expect(new Set(comfortable.rows)).toEqual(new Set([comfortable.header]));
  });

  // data-table.md — "both draw their cells with the same `TableCells` and therefore the same
  // truncation contract": a comfortable row is the same cells in the same columns
  it('draws the same cells, in the same order, in both variants', () => {
    const cellsOf = (variant: DataTableVariant) => {
      const { container, unmount } = render(
        <DataTable columns={columns} rows={makeRows(2)} rowKey={(row) => row.id} variant={variant} />,
      );
      const cells = [...container.querySelectorAll('.ui-data-table__cell')].map((cell) => cell.textContent);
      unmount();
      return cells;
    };

    expect(cellsOf('comfortable')).toEqual(cellsOf('dense'));
  });

  // data-table.md — "`variant='comfortable'` makes the same trade [as `autoRowHeight`] for the same
  // reason — a row that grows to fit its content has no height known before it is rendered — so a
  // comfortable list mounts every row and `maxHeight` still scrolls it."
  it('mounts every row under a maxHeight, where the dense list virtualises', () => {
    const { unmount } = render(
      <DataTable columns={columns} rows={makeRows(200)} rowKey={(row) => row.id} maxHeight="300px" />,
    );
    const denseMounted = rowsOnScreen().length;
    unmount();

    render(
      <DataTable
        columns={columns}
        rows={makeRows(200)}
        rowKey={(row) => row.id}
        maxHeight="300px"
        variant="comfortable"
      />,
    );

    expect(denseMounted).toBeLessThan(200);
    expect(rowsOnScreen()).toHaveLength(200);
    expect(screen.getByText('name-199')).toBeInTheDocument();
  });

  // data-table.md — the body is still capped and scrolled by `maxHeight`, virtualisation or not
  it('still caps and scrolls the body it was given a maxHeight for', () => {
    const { container } = render(
      <DataTable columns={columns} rows={makeRows(200)} rowKey={(row) => row.id} maxHeight="300px" variant="comfortable" />,
    );

    const scrollArea = container.querySelector<HTMLElement>('.ui-scroll-area');
    expect(scrollArea?.style.maxHeight).toBe('300px');
  });

  // data-table.md — "each row on a flat glass card of its own, separated rather than ruled": the
  // card is the library's `Surface`, not a rule the list draws
  it('draws each comfortable row on a flat surface of its own', () => {
    render(<DataTable columns={columns} rows={makeRows(3)} rowKey={(row) => row.id} variant="comfortable" />);

    const cards = [...document.querySelectorAll('.ui-surface')];
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card.className).toContain('ui-surface--flat');
      expect(card.querySelectorAll('.ui-data-table__row')).toHaveLength(1);
    }
  });

  // data-table.md — the dense variant is unchanged by the second one existing: no card, no surface
  it('leaves the dense row without a card of its own', () => {
    render(<DataTable columns={columns} rows={makeRows(3)} rowKey={(row) => row.id} />);

    expect(document.querySelectorAll('.ui-surface')).toHaveLength(0);
  });

  // data-table.md — "A comfortable row carries no pointer cursor of its own — the same as a dense
  // row, which is also clickable. One list, one affordance."
  it('gives the comfortable row no cursor the dense row does not have', () => {
    expect(ruleBody('.ui-data-table__row--comfortable')).not.toMatch(/cursor\s*:/);
  });

  // data-table.md — the empty state is the list's, whichever density is asked for
  it('shows the empty state instead of rows in either variant', () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(row) => row.id}
        variant="comfortable"
        emptyState={<EmptyState title="No objects" description={null} action={null} />}
      />,
    );

    expect(screen.getByText('No objects')).toBeInTheDocument();
    expect(rowsOnScreen()).toHaveLength(0);
  });
});

describe('DataTable — the content a comfortable row always carries (REQ-22)', () => {
  // data-table.md — "`renderRowContent?(row)` — content rendered inside **every** row's card,
  // below its cells and outside the selectable row itself"
  it('renders the row content inside every comfortable row, below its cells', () => {
    const { container } = render(
      <DataTable
        columns={columns}
        rows={makeRows(3)}
        rowKey={(row) => row.id}
        variant="comfortable"
        renderRowContent={(row) => <span>chips for {row.name}</span>}
      />,
    );

    expect(container.querySelectorAll('.ui-data-table__row-content')).toHaveLength(3);
    for (const row of makeRows(3)) {
      const content = screen.getByText(`chips for ${row.name}`);
      const selectableRow = screen.getByText(row.name).closest('.ui-data-table__row') as HTMLElement;
      expect(selectableRow.contains(content), 'the row content sits inside the selectable row').toBe(false);
      expect(
        selectableRow.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING,
        'the row content is drawn above the cells',
      ).toBeTruthy();
    }
  });

  // data-table.md — "Comfortable rows only; a dense row is a fixed-height line and ignores it."
  it('ignores the row content in the dense variant', () => {
    render(
      <DataTable
        columns={columns}
        rows={makeRows(3)}
        rowKey={(row) => row.id}
        renderRowContent={() => <span>chips</span>}
      />,
    );

    expect(document.querySelectorAll('.ui-data-table__row-content')).toHaveLength(0);
    expect(screen.queryByText('chips')).toBeNull();
  });

  // data-table.md — "A grouped list is this slot holding a nested `hideHeader` comfortable list of
  // the group's children — one list rendering both levels, sharing its rows, its action cluster and
  // its truncation contract rather than a grouped component duplicating them."
  it('renders a grouped list as a nested header-less list inside the row content', () => {
    const groups = makeRows(2);
    const { container } = render(
      <DataTable
        columns={columns}
        rows={groups}
        rowKey={(row) => row.id}
        variant="comfortable"
        renderRowContent={(group) => (
          <DataTable
            columns={columns}
            rows={makeRows(2).map((child) => ({ id: `${group.id}-${child.id}`, name: `${group.name}/${child.name}` }))}
            rowKey={(child) => child.id}
            variant="comfortable"
            hideHeader
          />
        )}
      />,
    );

    // One header for the outer list and none for the nested ones, and the children's tracks are
    // the same tracks their parent's are.
    const headers = [...container.querySelectorAll<HTMLElement>('.ui-data-table__header')];
    expect(headers).toHaveLength(1);
    expect(screen.getByText('name-0/name-1')).toBeInTheDocument();
    const outerRow = screen.getByText('name-0').closest('.ui-data-table__row') as HTMLElement;
    const nestedRow = screen.getByText('name-0/name-1').closest('.ui-data-table__row') as HTMLElement;
    expect(nestedRow.style.gridTemplateColumns).toBe(outerRow.style.gridTemplateColumns);
    expect(headers[0].style.gridTemplateColumns).toBe(outerRow.style.gridTemplateColumns);
  });
});

describe('DataTable — one expansion per list, in either variant (REQ-22, REQ-24)', () => {
  // data-table.md — "At most one row is expanded in one list, by construction: `expandedRowKey` is
  // one key, so a list cannot present two open panels."
  it('expands exactly one row, whichever variant the list is in', () => {
    for (const variant of ['dense', 'comfortable'] as const) {
      const { unmount } = render(
        <DataTable
          columns={columns}
          rows={makeRows(4)}
          rowKey={(row) => row.id}
          variant={variant}
          expandedRowKey="row-2"
          renderExpanded={(row) => <span>panel for {row.name}</span>}
        />,
      );

      expect(document.querySelectorAll('.ui-data-table__expanded'), `${variant} list`).toHaveLength(1);
      expect(screen.getByText('panel for name-2')).toBeInTheDocument();
      unmount();
    }
  });

  // data-table.md — "A comfortable row, the content it always carries and the panel it expands into
  // are one card": the expansion is inside the row's own surface
  it('keeps a comfortable row and the panel it expands into inside one card', () => {
    render(
      <DataTable
        columns={columns}
        rows={makeRows(3)}
        rowKey={(row) => row.id}
        variant="comfortable"
        expandedRowKey="row-1"
        renderExpanded={() => <span>panel</span>}
      />,
    );

    const card = screen.getByText('panel').closest('.ui-surface') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.contains(screen.getByText('name-1'))).toBe(true);
    expect(document.querySelectorAll('.ui-surface')).toHaveLength(3);
  });

  // data-table.md — "the expansion is set apart from the row by a hairline rather than by the wash
  // the dense variant uses, the card already setting it apart from the list around it"
  it('sets a comfortable expansion apart by a hairline rather than by the wash', () => {
    const comfortable = ruleBody('.ui-data-table--comfortable .ui-data-table__expanded');

    expect(comfortable).toMatch(/border-top:\s*var\(--border-width-hairline\)/);
    expect(comfortable).toMatch(/background:\s*(none|transparent)/);
  });

  // data-table.md — a row is still clickable in both variants, and the selection is the same one
  it('reports a row selection identically in both variants', () => {
    for (const variant of ['dense', 'comfortable'] as const) {
      const onRowSelect = vi.fn();
      const { unmount } = render(
        <DataTable
          columns={columns}
          rows={makeRows(3)}
          rowKey={(row) => row.id}
          variant={variant}
          onRowSelect={onRowSelect}
          selectedRowKey="row-1"
        />,
      );

      (screen.getByText('name-2').closest('.ui-data-table__row') as HTMLElement).click();

      expect(onRowSelect, `${variant} list`).toHaveBeenCalledWith({ id: 'row-2', name: 'name-2' });
      expect(
        (screen.getByText('name-1').closest('.ui-data-table__row') as HTMLElement).className,
        `${variant} list`,
      ).toContain('ui-data-table__row--selected');
      unmount();
    }
  });
});
