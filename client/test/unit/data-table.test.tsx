import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionButtonGroup, DataTable, type DataTableColumn } from '../../src/ui';

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
