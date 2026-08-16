import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionButtonGroup, DataTable, type DataTableColumn } from '../../src/ui';

/**
 * The declarations of a CSS rule. jsdom loads no stylesheet, so a contract the
 * library expresses in CSS — a row that does not clip its content — is read
 * from the stylesheet itself, as `design-tokens-contrast.test.ts` does.
 */
function ruleBody(css: string, selector: string): string {
  // Anchored on the end of the previous rule, so a selector is never matched inside a longer
  // selector list (where it would return the wrong rule's declarations).
  const match = new RegExp(`(?:^|\\}|\\*/)\\s*${selector.replace(/[.\-]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`no CSS rule for ${selector}`);
  return match[1];
}

afterEach(cleanup);

interface Row {
  id: string;
}

function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({ id: `row-${index}` }));
}

const columns: DataTableColumn<Row>[] = [{ id: 'id', header: 'ID', render: (row) => row.id }];

describe('DataTable', () => {
  // ui-library/specs/data-table.md — maxHeight unset renders every row
  it('mounts every row when maxHeight is not set', () => {
    const rows = makeRows(200);
    render(<DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />);

    expect(screen.getAllByText(/^row-\d+$/)).toHaveLength(200);
  });

  // ui-library/specs/data-table.md — maxHeight enables virtualised scrolling so only rows in and around the visible window are mounted (REQ-109)
  it('mounts only a window of rows around the visible area when maxHeight is set', () => {
    const rows = makeRows(200);
    render(<DataTable columns={columns} rows={rows} rowKey={(row) => row.id} maxHeight="300px" />);

    const mountedCount = screen.getAllByText(/^row-\d+$/).length;
    expect(mountedCount).toBeLessThan(200);
    expect(screen.getByText('row-0')).toBeInTheDocument();
    expect(screen.queryByText('row-199')).not.toBeInTheDocument();
  });

  // ui-library/specs/data-table.md — virtualisation swaps which rows are mounted as the scroll position changes (REQ-109)
  it('mounts a different window of rows after scrolling further down the list', () => {
    const rows = makeRows(200);
    const { container } = render(<DataTable columns={columns} rows={rows} rowKey={(row) => row.id} maxHeight="300px" />);
    const scrollArea = container.querySelector('.ui-scroll-area') as HTMLDivElement;

    fireEvent.scroll(scrollArea, { target: { scrollTop: rows.length * 56 } });

    expect(screen.getByText('row-199')).toBeInTheDocument();
    expect(screen.queryByText('row-0')).not.toBeInTheDocument();
  });

  // ui-library/specs/data-table.md — a row's height never changes with scroll position
  it('keeps every mounted row at the fixed row height regardless of scroll position', () => {
    const rows = makeRows(200);
    const { container } = render(
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} rowHeight={40} maxHeight="300px" />,
    );
    const scrollArea = container.querySelector('.ui-scroll-area') as HTMLDivElement;

    fireEvent.scroll(scrollArea, { target: { scrollTop: 2000 } });

    const rowElements = container.querySelectorAll('.ui-data-table__row');
    expect(rowElements.length).toBeGreaterThan(0);
    rowElements.forEach((row) => {
      expect((row as HTMLElement).style.height).toBe('40px');
    });
  });

  // ui-library/specs/data-table.md — every column renders in the header and in every row, in the same order
  it('renders every column header once, in the order declared', () => {
    const multiColumns: DataTableColumn<Row>[] = [
      { id: 'id', header: 'ID', render: (row) => row.id },
      { id: 'upper', header: 'UPPER', render: (row) => row.id.toUpperCase() },
    ];
    render(<DataTable columns={multiColumns} rows={makeRows(1)} rowKey={(row) => row.id} />);

    const headers = screen.getAllByText(/^(ID|UPPER)$/);
    expect(headers.map((header) => header.textContent)).toEqual(['ID', 'UPPER']);
  });

  // ui-library/specs/data-table.md — "hideHeader — drops the header row entirely … the rows, their
  // tracks and their alignment are unchanged" (REQ-15)
  it('drops the header row while leaving the rows and their tracks unchanged', () => {
    const multiColumns: DataTableColumn<Row>[] = [
      { id: 'id', header: 'ID', render: (row) => row.id },
      { id: 'upper', header: 'UPPER', width: '110px', align: 'end', render: (row) => row.id.toUpperCase() },
    ];
    const { container: withHeader } = render(<DataTable columns={multiColumns} rows={makeRows(2)} rowKey={(row) => row.id} />);
    const tracksWithHeader = (withHeader.querySelector('.ui-data-table__row') as HTMLElement).style.gridTemplateColumns;
    cleanup();

    const { container } = render(<DataTable columns={multiColumns} rows={makeRows(2)} rowKey={(row) => row.id} hideHeader />);

    expect(container.querySelector('.ui-data-table__header')).toBeNull();
    expect(screen.queryByText('ID')).not.toBeInTheDocument();
    expect(screen.queryByText('UPPER')).not.toBeInTheDocument();
    expect(screen.getAllByText(/^row-\d+$/)).toHaveLength(2);
    expect((container.querySelector('.ui-data-table__row') as HTMLElement).style.gridTemplateColumns).toBe(tracksWithHeader);
  });

  // ui-library/specs/data-table.md — "the multi-select header checkbox goes with the header"
  it('drops the multi-select header checkbox along with the header, keeping the row checkboxes', () => {
    render(
      <DataTable
        columns={columns}
        rows={makeRows(2)}
        rowKey={(row) => row.id}
        hideHeader
        selection={{ selectedKeys: [], onToggle: () => undefined, onToggleAll: () => undefined, allSelected: false }}
      />,
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  // ui-library/specs/data-table.md — emptyState is shown instead of the body rows when rows is empty
  it('shows the empty state instead of rows when the row list is empty', () => {
    const rows = makeRows(3);
    const { unmount } = render(
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} emptyState={<span>Nothing to show</span>} />,
    );
    expect(screen.queryByText('Nothing to show')).not.toBeInTheDocument();
    unmount();

    render(<DataTable columns={columns} rows={[]} rowKey={(row) => row.id} emptyState={<span>Nothing to show</span>} />);
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
    expect(screen.queryByText(/^row-\d+$/)).not.toBeInTheDocument();
  });

  // ui-library/specs/data-table.md — renderExpanded's content is inserted in flow directly below the matching row
  it('inserts the expanded row content in flow directly below the row whose key matches expandedRowKey', () => {
    const rows = makeRows(3);
    const { container } = render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        expandedRowKey="row-1"
        renderExpanded={(row) => <span>{`expanded-${row.id}`}</span>}
      />,
    );

    const body = container.querySelector('.ui-data-table__body') as HTMLElement;
    const entries = Array.from(body.children)
      .filter((child) => child.classList.contains('ui-data-table__row') || child.classList.contains('ui-data-table__expanded'))
      .map((child) => (child.classList.contains('ui-data-table__expanded') ? 'expanded' : child.textContent));

    expect(entries).toEqual(['row-0', 'row-1', 'expanded', 'row-2']);
  });

  // ui-library/specs/action-button-group.md — a row action click never also triggers the containing row's onRowSelect
  it('does not trigger onRowSelect when a row action button is clicked', async () => {
    const user = userEvent.setup();
    const onRowSelect = vi.fn();
    const onAction = vi.fn();
    const actionColumns: DataTableColumn<Row>[] = [
      { id: 'id', header: 'ID', render: (row) => row.id },
      { id: 'actions', header: '', render: () => <ActionButtonGroup actions={[{ id: 'go', label: 'go', onClick: onAction }]} /> },
    ];
    render(<DataTable columns={actionColumns} rows={makeRows(1)} rowKey={(row) => row.id} onRowSelect={onRowSelect} />);

    await user.click(screen.getByRole('button', { name: 'go' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onRowSelect).not.toHaveBeenCalled();
  });
});

describe('DataTable — expanded row survives scrolling under virtualisation', () => {
  function ExpandedNote({ row }: { row: Row }) {
    const [value, setValue] = useState('');
    return <input aria-label={`note-${row.id}`} value={value} onChange={(event) => setValue(event.target.value)} />;
  }

  // ui-library/specs/data-table.md — the row matching expandedRowKey is never unmounted by virtualisation regardless of scroll position, so its component instance (and internal state) survives scrolling
  it('preserves the expanded row content\'s internal state when scrolling moves it out of the naive virtualisation window', async () => {
    const user = userEvent.setup();
    const rows = makeRows(200);
    const { container } = render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        maxHeight="300px"
        expandedRowKey="row-100"
        renderExpanded={(row) => <ExpandedNote row={row} />}
      />,
    );
    const scrollArea = container.querySelector('.ui-scroll-area') as HTMLDivElement;

    await user.type(screen.getByLabelText('note-row-100'), 'draft note');
    expect(screen.getByLabelText('note-row-100')).toHaveValue('draft note');

    // Scrolls far enough that the naive scrollTop-based window would no longer include row-100.
    fireEvent.scroll(scrollArea, { target: { scrollTop: rows.length * 56 } });

    expect(screen.getByLabelText('note-row-100')).toHaveValue('draft note');
  });

  // ui-library/specs/data-table.md — virtualisation still limits what is mounted (REQ-109); the expanded-row exemption widens the window, it does not disable virtualisation
  it('still leaves rows far from both the scroll position and the expanded row unmounted', () => {
    const rows = makeRows(200);
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        maxHeight="300px"
        expandedRowKey="row-100"
        renderExpanded={(row) => <span>{`expanded-${row.id}`}</span>}
      />,
    );

    expect(screen.queryByText('row-199')).not.toBeInTheDocument();
    expect(screen.getAllByText(/^row-\d+$/).length).toBeLessThan(200);
  });
});

// ui-library/specs/data-table.md — the matrix variant: `autoRowHeight` trades fixed row heights and
// virtualisation for text shown in full (REQ-105).
describe('DataTable — content-sized rows (autoRowHeight)', () => {
  // data-table.md — "every row grows to fit its content instead of being clipped, rowHeight becoming
  // a minimum rather than a fixed height"
  it('gives every row the row height as a minimum instead of a fixed height', () => {
    const { container } = render(
      <DataTable columns={columns} rows={makeRows(5)} rowKey={(row) => row.id} rowHeight={64} autoRowHeight />,
    );

    const rowElements = Array.from(container.querySelectorAll<HTMLElement>('.ui-data-table__row'));
    expect(rowElements).toHaveLength(5);
    rowElements.forEach((row) => {
      expect(row.style.minHeight).toBe('64px');
      expect(row.style.height).toBe('');
    });
  });

  // data-table.md — "Virtualisation is off in this mode ... so every row is mounted; maxHeight still
  // caps the body and scrolls it"
  it('mounts every row even under a maxHeight, and still caps the body', () => {
    const { container } = render(
      <DataTable columns={columns} rows={makeRows(200)} rowKey={(row) => row.id} maxHeight="300px" autoRowHeight />,
    );

    expect(screen.getAllByText(/^row-\d+$/)).toHaveLength(200);
    expect(screen.getByText('row-199')).toBeInTheDocument();
    const scrollArea = container.querySelector<HTMLElement>('.ui-scroll-area');
    expect(scrollArea?.style.maxHeight).toBe('300px');
  });

  // data-table.md — "A row's content that exceeds its fixed rowHeight is clipped ... unless
  // autoRowHeight is set": the row must not clip what its cells draw
  it('does not clip the content of a content-sized row', () => {
    const { container } = render(
      <DataTable columns={columns} rows={makeRows(1)} rowKey={(row) => row.id} rowHeight={64} autoRowHeight />,
    );
    const rowClass = container.querySelector<HTMLElement>('.ui-data-table__row')?.className ?? '';

    // The clipping is a property of the fixed-height row alone, so the variant is marked as its own.
    expect(rowClass).toContain('ui-data-table__row--auto-height');
    const css = readFileSync(join(process.cwd(), 'src/ui/data/data-table.css'), 'utf8');
    expect(ruleBody(css, '.ui-data-table__row--auto-height')).toMatch(/overflow:\s*visible/);
  });

  // data-table.md — the fixed-height default is unchanged: it is still clipped and still virtualised
  it('leaves the fixed-height default clipping and virtualising as before', () => {
    const { container } = render(<DataTable columns={columns} rows={makeRows(200)} rowKey={(row) => row.id} maxHeight="300px" />);

    expect(screen.getAllByText(/^row-\d+$/).length).toBeLessThan(200);
    const row = container.querySelector<HTMLElement>('.ui-data-table__row');
    expect(row?.style.height).toBe('56px');
    expect(row?.className).not.toContain('auto-height');
  });
});

/**
 * **The one presentation** — what survived the retirement of the card-per-row
 * one (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-1`,
 * `REQ-22`, `REQ-28`).
 *
 * These assertions are **restated**, not written: they come from
 * `data-table-comfortable-variant.test.tsx`, the unit file dedicated to the
 * retired presentation, which was removed with the thing it covered. What was a
 * comparison *between two variants* — the same cells in both, one expansion in
 * both, the same selection in both — is a claim about the one presentation here;
 * what only existed inside that presentation — the card each row was drawn on,
 * the cursor it did not have, the expansion living inside the card — went with
 * it. An assertion weakened into passing while the behaviour it named goes
 * unchecked is what REQ-28 forbids, so each of these names the file it comes
 * from.
 *
 * **Contract and state only** (REQ-31): every box is zero in jsdom, so the
 * geometry these replace — flush rows, no radius, one enclosing surface — is
 * asserted in the browser (`e2e/classic-table-criteria*.spec.ts`,
 * `e2e/classic-table-sweep.spec.ts`), never here.
 */
describe('DataTable — the one presentation', () => {
  // Restated from "draws the same cells, in the same order, in both variants": the cells are the
  // columns' own, in the order declared, on every row.
  it('draws every column’s cell on every row, in the order declared', () => {
    const multiColumns: DataTableColumn<Row>[] = [
      { id: 'id', header: 'ID', render: (row) => row.id },
      { id: 'upper', header: 'UPPER', render: (row) => row.id.toUpperCase() },
    ];
    const { container } = render(<DataTable columns={multiColumns} rows={makeRows(2)} rowKey={(row) => row.id} />);

    const cells = [...container.querySelectorAll('.ui-data-table__cell')].map((cell) => cell.textContent);
    expect(cells).toEqual(['row-0', 'ROW-0', 'row-1', 'ROW-1']);
  });

  // Restated from "leaves the dense row without a card of its own", which was the *other* variant's
  // clause and is now the list's own invariant: **no surface per row, and none anywhere inside**.
  // The count of surfaces enclosing a list is geometry and is the browser's (REQ-4, REQ-40); that a
  // list draws none of its own is a fact about the markup and belongs here.
  it('draws no surface of its own, per row or otherwise', () => {
    const { container } = render(
      <DataTable
        columns={columns}
        rows={makeRows(3)}
        rowKey={(row) => row.id}
        expandedRowKey="row-1"
        renderExpanded={() => <span>panel</span>}
        renderRowContent={(row) => <span>{`chips for ${row.id}`}</span>}
      />,
    );

    expect(container.querySelectorAll('.ui-surface'), 'the list draws a surface of its own').toHaveLength(0);
  });

  // Restated from "gives the comfortable row no cursor the dense row does not have": one list, one
  // affordance — and now one row rule, which is where the absence has to hold.
  it('gives a row no pointer cursor of its own', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/data/data-table.css'), 'utf8');

    expect(ruleBody(css, '.ui-data-table__row')).not.toMatch(/cursor\s*:/);
  });

  /**
   * Restated from "renders the row content whatever presentation the list asks for" — the assertion
   * that had to land *before* any list stopped asking for the retired presentation, since four lists
   * draw their chips, their tags and their nested lists through this slot and the gate would have
   * taken them away with no error, no type change and no shorter list, only shorter rows
   * (`.../classic-table/REQ-6`). With the presentation gone, "conditional on nothing" is simply what
   * the slot is, and this is its only unit-level statement.
   */
  it('renders the row content of every row, below its cells and outside the selectable row', () => {
    const { container } = render(
      <DataTable
        columns={columns}
        rows={makeRows(3)}
        rowKey={(row) => row.id}
        renderRowContent={(row) => <span>{`chips for ${row.id}`}</span>}
      />,
    );

    expect(container.querySelectorAll('.ui-data-table__row-content')).toHaveLength(3);
    for (const row of makeRows(3)) {
      const content = screen.getByText(`chips for ${row.id}`);
      const selectableRow = screen.getAllByText(row.id)[0]!.closest('.ui-data-table__row') as HTMLElement;
      expect(selectableRow.contains(content), 'the row content sits inside the selectable row').toBe(false);
      expect(
        selectableRow.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING,
        'the row content is not drawn below the cells it belongs to',
      ).toBeTruthy();
    }
  });

  // Restated from "expands exactly one row, whichever variant the list is in": `expandedRowKey` is
  // one key, so a list cannot present two open panels. The cross-list half of that guarantee is
  // `DetailPanel`'s (`detail-panel-one-open.test.tsx`).
  it('expands exactly one row of the list', () => {
    const { container } = render(
      <DataTable
        columns={columns}
        rows={makeRows(4)}
        rowKey={(row) => row.id}
        expandedRowKey="row-2"
        renderExpanded={(row) => <span>{`panel for ${row.id}`}</span>}
      />,
    );

    expect(container.querySelectorAll('.ui-data-table__expanded')).toHaveLength(1);
    expect(screen.getByText('panel for row-2')).toBeInTheDocument();
  });

  // Restated from "reports a row selection identically in both variants": one presentation, so the
  // claim is simply that a row reports its selection and the selected row says so.
  it('reports a row selection and marks the selected row', async () => {
    const user = userEvent.setup();
    const onRowSelect = vi.fn();
    render(
      <DataTable columns={columns} rows={makeRows(3)} rowKey={(row) => row.id} onRowSelect={onRowSelect} selectedRowKey="row-1" />,
    );

    await user.click(screen.getByText('row-2'));

    expect(onRowSelect).toHaveBeenCalledWith({ id: 'row-2' });
    expect((screen.getByText('row-1').closest('.ui-data-table__row') as HTMLElement).className).toContain(
      'ui-data-table__row--selected',
    );
  });
});

/**
 * **One scrolling box for the header and the rows**
 * (`data-table.md`, "A row and the header share one width and one set of
 * resolved tracks" — third bullet; the classic-table plan's `REQ-5`).
 *
 * A vertical scrollbar takes real layout space out of its scroll container's
 * content box, so a header drawn as a *sibling* of that container resolves its
 * tracks in a wider box than the rows do. The repair is structural: the header
 * is a **child** of the box that scrolls.
 *
 * **Everything here is contract and state** (`.../classic-table/REQ-31`): every
 * box is zero in jsdom, so no drift can be measured and none is asserted. Which
 * element contains which, what the cap is set on, which class the scrolled state
 * carries, and what the stylesheet declares — those are what a jsdom render can
 * say. The drift itself is measured in a browser, with a scrollbar gutter really
 * reserved: `e2e/data-table-header-column-alignment.spec.ts`.
 */
describe('DataTable — the header and the rows share one scrolling box', () => {
  it('draws the header inside the scroll area rather than beside it', () => {
    const { container } = render(<DataTable columns={columns} rows={makeRows(3)} rowKey={(row) => row.id} maxHeight="300px" />);

    const table = container.querySelector('.ui-data-table') as HTMLElement;
    const scrollArea = table.querySelector('.ui-scroll-area') as HTMLElement;
    const header = table.querySelector('.ui-data-table__header') as HTMLElement;
    const body = table.querySelector('.ui-data-table__body') as HTMLElement;

    expect(scrollArea, 'the table has no scrolling box at all').not.toBeNull();
    expect(header, 'the table draws no column header').not.toBeNull();
    expect(scrollArea.contains(header), 'the header is drawn outside the box that scrolls').toBe(true);
    expect(scrollArea.contains(body), 'the rows are drawn outside the box that scrolls').toBe(true);
    // …and there is exactly one such box: two would put the two grids back in two
    // content boxes by another route.
    expect(table.querySelectorAll('.ui-scroll-area'), 'the table holds more than one scrolling box').toHaveLength(1);
  });

  // data-table.md — "`maxHeight?: string` — caps the height of the **list**, the column header and
  // the rows together". Corrected 2026-08-16: it bounded the rows alone.
  it('caps the header and the rows together, not the rows alone', () => {
    const { container } = render(<DataTable columns={columns} rows={makeRows(200)} rowKey={(row) => row.id} maxHeight="300px" />);

    const capped = container.querySelector<HTMLElement>('[style*="max-height"]');
    expect(capped, 'nothing carries the stated cap').not.toBeNull();
    expect(capped!.style.maxHeight).toBe('300px');
    expect(
      capped!.contains(container.querySelector('.ui-data-table__header') as Node),
      'the cap is set on a box that does not hold the header, so a list stated at 300px is 300px plus a header tall',
    ).toBe(true);
  });

  // The empty state is inside the same box: it replaces the rows, not the list.
  it('draws the empty state inside the same scrolling box, under the header', () => {
    const { container } = render(
      <DataTable columns={columns} rows={[]} rowKey={(row: Row) => row.id} emptyState={<p>nothing here</p>} />,
    );

    const scrollArea = container.querySelector('.ui-scroll-area') as HTMLElement;
    expect(scrollArea.querySelector('.ui-data-table__empty'), 'the empty state is drawn outside the scrolling box').not.toBeNull();
    expect(scrollArea.querySelector('.ui-data-table__header'), 'the header left the scrolling box on an empty list').not.toBeNull();
  });

  // data-table.md — "The sticky header is **opaque only while the list is scrolled away from its
  // top**, carrying a state class for it: its own wash is 4% white and hides nothing, and a list
  // that never scrolls is drawn exactly as before."
  it('takes the opaque state only while something is scrolling under it', () => {
    const { container } = render(<DataTable columns={columns} rows={makeRows(200)} rowKey={(row) => row.id} maxHeight="300px" />);
    const scrollArea = container.querySelector('.ui-scroll-area') as HTMLDivElement;
    const header = () => container.querySelector('.ui-data-table__header') as HTMLElement;

    expect(header().className, 'the header is opaque at rest, where its paint must be unchanged').not.toContain('--stuck');

    fireEvent.scroll(scrollArea, { target: { scrollTop: 240 } });
    expect(header().className, 'the header stays transparent while rows pass beneath it').toContain('ui-data-table__header--stuck');

    fireEvent.scroll(scrollArea, { target: { scrollTop: 0 } });
    expect(header().className, 'the header keeps its floor after the list is scrolled back to its top').not.toContain('--stuck');
  });

  // The stylesheet is where "sticky at its top" lives, and jsdom loads none: the rule is read from
  // the file itself, as `design-tokens-contrast.test.ts` does. `z-index` is load-bearing — the
  // expansion is positioned and comes later in the DOM, so without it a tall open panel paints over
  // the header it is scrolling under.
  it('declares the header sticky at the top of that box, above the expansion, with no blur', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/data/data-table.css'), 'utf8');
    const header = ruleBody(css, '.ui-data-table__header');

    expect(header).toMatch(/position:\s*sticky/);
    expect(header).toMatch(/top:\s*0/);
    expect(header).toMatch(/z-index:\s*[1-9]/);
    // These lists are main view: the floor under a sticky header is a colour, never a filter
    // (CLAUDE.md, "Performance — background and blur").
    expect(css.slice(css.indexOf('.ui-data-table__header'))).not.toMatch(/backdrop-filter|filter:\s*blur/);
  });
});

/**
 * `nested` — a list drawn **inside a row of another list**
 * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-7`,
 * `ui-library/specs/data-table.md`).
 *
 * **Contract and state only** (that plan's REQ-31): every box is zero in jsdom, so the indentation
 * itself, the one enclosing surface and the group's closing hairline are measured in a browser by
 * `e2e/classic-table-criteria-nested-lists.spec.ts`. What is asserted here is what a call site
 * states, what the tree therefore holds, and what the stylesheet declares — the last of which no
 * browser check can distinguish: a 16px inset written on the spot and one taken from the spacing
 * token measure identically, and only one of them is what REQ-33 admits.
 */
describe('DataTable — a list drawn inside a row of another list (`nested`)', () => {
  const childColumns: DataTableColumn<Row>[] = [
    { id: 'child', header: 'CHILD', width: '2fr', render: (row) => row.id },
    { id: 'trailing', header: 'TRAILING', width: '90px', align: 'end', render: (row) => row.id.toUpperCase() },
  ];

  // data-table.md — "`nested?: boolean` (default `false`) — this list is drawn **inside a row of
  // another list** … It takes **no surface, corner, outline or shadow of its own**."
  it('states the nesting on the list itself, and states it only when asked for', () => {
    const { container } = render(
      <DataTable
        columns={columns}
        rows={makeRows(2)}
        rowKey={(row) => row.id}
        renderRowContent={(group) => (
          <DataTable
            nested
            hideHeader
            columns={childColumns}
            rows={makeRows(2).map((child) => ({ id: `${group.id}/${child.id}` }))}
            rowKey={(child) => child.id}
          />
        )}
      />,
    );

    const tables = [...container.querySelectorAll<HTMLElement>('.ui-data-table')];
    expect(tables, 'the outer list does not draw one nested list per row').toHaveLength(3);
    expect(tables[0].className, 'the list that was not asked to nest states the nesting anyway').not.toContain(
      'ui-data-table--nested',
    );
    for (const nested of tables.slice(1)) {
      expect(nested.className, 'a list asked to nest does not say so').toContain('ui-data-table--nested');
      // The nesting is the one list's own property: no wrapper, and no surface anywhere inside.
      expect(nested.parentElement?.className, 'the nested list is not the row content slot’s own child').toContain(
        'ui-data-table__row-content',
      );
    }
    expect(container.querySelectorAll('.ui-surface'), 'a surface is drawn inside a list that states the nesting').toHaveLength(0);
    expect(
      [...container.querySelectorAll('.ui-data-table__row')]
        .flatMap((row) => [...row.classList])
        .filter((name) => name !== 'ui-data-table__row'),
      'a row of either level states a modifier of its own',
    ).toEqual([]);
  });

  // data-table.md — "It keeps the columns it declares — what is shared is the surface, the pan
  // region and the ruled treatment, never the tracks."
  it('keeps the columns the child declares rather than taking its parent’s tracks', () => {
    const { container } = render(
      <DataTable
        columns={[
          { id: 'id', header: 'ID', width: '1.4fr', render: (row) => row.id },
          { id: 'extra', header: 'EXTRA', width: '120px', render: () => 'x' },
        ]}
        rows={makeRows(1)}
        rowKey={(row) => row.id}
        renderRowContent={() => (
          <DataTable nested hideHeader columns={childColumns} rows={makeRows(1)} rowKey={(child) => `child-${child.id}`} />
        )}
      />,
    );

    const rows = [...container.querySelectorAll<HTMLElement>('.ui-data-table__row')];
    expect(rows.length, 'neither level drew a row').toBe(2);
    expect(rows[1].style.gridTemplateColumns, 'the child was handed its parent’s tracks').not.toBe(
      rows[0].style.gridTemplateColumns,
    );
    // …and they are its own: the tracks it declared, in the order it declared them.
    expect(rows[1].style.gridTemplateColumns).toContain('90px');
    expect(screen.queryByText('TRAILING'), 'the child list draws a header of its own').toBeNull();
  });

  /**
   * The indentation itself is a stylesheet rule, and jsdom loads none — but **what it is written
   * with** is exactly what a browser cannot tell apart, so it is read from the file, as
   * `design-tokens-contrast.test.ts` does. Three things the plan requires of it: the inset is a
   * spacing **token** and not a length written on the spot (REQ-33), it introduces **no** surface,
   * radius, outline or shadow (REQ-3, REQ-7), and the child computes no pan region of its own so
   * that parent and child move together (REQ-12).
   */
  it('declares the indentation from a spacing token, introducing no surface and no pan region of its own', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/data/data-table.css'), 'utf8');
    const nested = ruleBody(css, '.ui-data-table--nested');

    expect(nested, 'the nested list is inset by a length written on the spot instead of a spacing token').toMatch(
      /padding-inline-start:\s*var\(--space-\d\)/,
    );
    expect(nested, 'the nested list computes a horizontal overflow of its own, so it is a second pan region').toMatch(
      /overflow-x:\s*visible/,
    );
    expect(nested, 'the indentation introduces a surface of its own').not.toMatch(
      /border-radius|outline|box-shadow|background/,
    );
    // …and the wrapper gives up its block-end padding to it, so the last child is as flush with
    // what follows as any other row is (REQ-2). Matched directly rather than through `ruleBody`,
    // whose escaping covers a class selector and not the `:has()` this one is written with.
    expect(
      /\.ui-data-table__row-content:has\(>\s*\.ui-data-table--nested\)\s*\{[^}]*padding-bottom:\s*0/.test(css),
      'the wrapper keeps its block-end padding under a nested list, which is a gap between two levels of one list',
    ).toBe(true);
    // …and the last child gives up its own rule, the group's closing hairline being the wrapper's.
    expect(
      /\.ui-data-table--nested\s+\.ui-data-table__body\s*>\s*\.ui-data-table__row:last-child\s*\{[^}]*border-bottom:\s*none/.test(css),
      'the last child of a group draws a rule of its own under the wrapper’s, so the two are drawn one above the other',
    ).toBe(true);
  });
});
