import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DataTable, type DataTableColumn } from '../../src/ui';

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
});
