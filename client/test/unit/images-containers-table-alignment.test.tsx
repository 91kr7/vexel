import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContainersScreen } from '../../src/containers/ContainersScreen';
import { ImagesScreen } from '../../src/images/ImagesScreen';
import type { ContainerSummary } from '../../src/data/containers-client';
import type { ImageSummary } from '../../src/data/images-client';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
// ImagesScreen reaches a layer named by another screen (images/specs/images-screen.md),
// so it only stands inside a cross-navigation provider.
import { CrossNavigationProvider } from '../../src/shell/services/CrossNavigationService';
import { ErrorReportingProvider } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';
import { ToastProvider } from '../../src/ui';

/**
 * plan-docker_management_app/REQ-3, batch-images-table-alignment's "Human
 * acceptance" — the two core list screens must apply the same `DataTable`
 * treatment uniformly: same header style, same column typography, same row
 * height, same hover/selected treatment. Per images-screen.md's and
 * containers-screen.md's own documented rationale, this is deliberately
 * **not** a promise that the two screens share an identical column set:
 * Images alone carries a leading multi-select checkbox column (and
 * `BulkActionBar`) because it alone has a bulk action needing a selection
 * ("Save to tarball…"); Containers has no per-row bulk action, so it carries
 * none. A test asserting identical column counts or an identical header/cell
 * class fingerprint therefore over-specifies REQ-3 and would forbid either
 * screen from ever gaining a feature the other does not need. What is
 * compared below is exactly what is promised — table/wrapper/header/row
 * treatment and the treatment of the columns both screens do share — plus an
 * explicit, spec-grounded assertion of the one documented difference (the
 * selection column). In jsdom no stylesheet is applied, so what is
 * comparable here is the markup the visual language is carried by: class
 * names, row height, selected-row class. The computed-style side of the
 * comparison is covered by the e2e suite.
 */

const container: ContainerSummary = {
  id: 'container-1',
  shortId: 'container1',
  name: 'web-nginx',
  image: 'nginx:1.27',
  state: 'running',
  status: 'Up 3 days',
  ports: [],
};

const image: ImageSummary = {
  id: 'sha256:0123456789abcdef0123456789abcdef',
  shortId: '0123456789ab',
  tags: ['nginx:1.27'],
  digest: 'sha256:fedcba9876543210fedcba9876543210',
  platforms: ['linux/amd64'],
  sizeBytes: 2048,
  createdAt: '2026-08-01T00:00:00Z',
};

class FakeEventSource {
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public url: string) {}

  addEventListener() {
    // no event delivery is needed for this comparison
  }

  close() {
    // no-op
  }
}

function containerInspect() {
  return {
    id: 'container-1',
    name: 'web-nginx',
    image: 'nginx:1.27',
    command: ['nginx'],
    entrypoint: [],
    createdAt: '2026-01-01T00:00:00Z',
    state: { status: 'running', startedAt: '2026-01-01T00:00:01Z' },
    restartPolicy: { name: 'no' },
    resourceLimits: {},
    env: ['FOO=bar'],
    ports: [],
    mounts: [],
    networks: [{ name: 'bridge' }],
    labels: {},
    raw: { Id: 'raw-container-1-id', Name: '/web-nginx' },
  };
}

function imageInspect() {
  return {
    id: 'sha256:0123456789abcdef0123456789abcdef',
    tags: ['nginx:1.27'],
    digest: 'sha256:fedcba9876543210fedcba9876543210',
    platforms: ['linux/amd64'],
    sizeBytes: 2048,
    createdAt: '2026-08-01T00:00:00Z',
    entrypoint: [],
    command: ['nginx'],
    env: ['PATH=/usr/bin'],
    labels: {},
    exposedPorts: ['80/tcp'],
    history: [],
    raw: { Id: 'sha256:0123456789abcdef' },
  };
}

function withServices(children: React.ReactNode) {
  return (
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <CrossNavigationProvider>
            <ToastProvider>{children}</ToastProvider>
          </CrossNavigationProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>
  );
}

interface TableFingerprint {
  tableCount: number;
  tableClass: string;
  wrapperClass: string;
  headerClass: string;
  /** Only the genuine data-column header cells — the (Images-only) selection column is excluded on
   *  purpose (`.ui-data-table__select-cell` marks a structural control, not column data, per
   *  `DataTable.tsx`'s own comment), since REQ-3 promises identical treatment of the columns both
   *  screens share, never an identical column set. */
  dataHeaderCellClasses: string[];
  scrollAreaMaxHeight: string;
  rowClass: string;
  rowHeight: string;
  dataCellClasses: string[];
  actionColumnTrack: string;
  actionGroupClass: string;
}

function fingerprint(root: HTMLElement): TableFingerprint {
  const table = root.querySelector<HTMLElement>('.ui-data-table')!;
  const header = table.querySelector<HTMLElement>('.ui-data-table__header')!;
  const row = table.querySelector<HTMLElement>('.ui-data-table__row')!;
  const scrollArea = table.querySelector<HTMLElement>('[style*="max-height"], .ui-scroll-area');
  const headerTracks = header.style.gridTemplateColumns.split(' ');
  const dataHeaderCells = Array.from(header.children).filter((cell) => !cell.classList.contains('ui-data-table__select-cell'));
  const dataCells = Array.from(row.children).filter((cell) => !cell.classList.contains('ui-data-table__select-cell'));
  return {
    tableCount: root.querySelectorAll('.ui-data-table').length,
    tableClass: table.className,
    wrapperClass: table.parentElement?.className ?? '',
    headerClass: header.className,
    dataHeaderCellClasses: Array.from(new Set(dataHeaderCells.map((cell) => cell.className))),
    scrollAreaMaxHeight: scrollArea?.style.maxHeight ?? '',
    rowClass: row.className,
    rowHeight: row.style.height,
    dataCellClasses: Array.from(new Set(dataCells.map((cell) => cell.className))),
    actionColumnTrack: headerTracks[headerTracks.length - 1] ?? '',
    actionGroupClass: row.querySelector('.ui-action-button-group')?.className ?? '',
  };
}

/** Whether the screen's table carries the (Images-only) leading multi-select checkbox column. */
function hasSelectionColumn(root: HTMLElement): boolean {
  const header = root.querySelector<HTMLElement>('.ui-data-table__header')!;
  const row = root.querySelector<HTMLElement>('.ui-data-table__row')!;
  return header.querySelector('.ui-data-table__select-cell') !== null && row.querySelector('.ui-data-table__select-cell') !== null;
}

function renderContainers() {
  const { container: root } = render(withServices(<ContainersScreen containers={[container]} loaded onRefresh={vi.fn()} />));
  return root;
}

function renderImages() {
  const { container: root } = render(withServices(<ImagesScreen images={[image]} loaded onRefresh={vi.fn()} />));
  return root;
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(String(url).includes('/images/') ? imageInspect() : containerInspect()),
      }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Images and Containers present the same table (plan-docker_management_app/REQ-3)', () => {
  it('renders both lists with the same table component, wrapper, header, row and shared-column cell treatment', () => {
    const imagesRoot = renderImages();
    const imagesFingerprint = fingerprint(imagesRoot);
    cleanup();
    const containersRoot = renderContainers();
    const containersFingerprint = fingerprint(containersRoot);

    expect(imagesFingerprint).toEqual(containersFingerprint);
  });

  // images-screen.md, containers-screen.md — Images alone carries the leading multi-select
  // checkbox column (and BulkActionBar) because it alone has a bulk action needing a selection
  // ("Save to tarball…"); Containers deliberately carries none ("Prune stopped" needs no per-row
  // selection). This is the one documented, intentional column-set difference REQ-3 does not forbid.
  it("gives Images alone the multi-select checkbox column, which Containers deliberately does not carry", () => {
    const imagesRoot = renderImages();
    expect(hasSelectionColumn(imagesRoot)).toBe(true);
    cleanup();

    const containersRoot = renderContainers();
    expect(hasSelectionColumn(containersRoot)).toBe(false);
  });

  it('gives both lists the same row height', () => {
    const imagesRoot = renderImages();
    const imagesRowHeight = fingerprint(imagesRoot).rowHeight;
    cleanup();
    const containersRoot = renderContainers();

    expect(imagesRowHeight).toBe(fingerprint(containersRoot).rowHeight);
    expect(imagesRowHeight).not.toBe('');
  });

  it('gives both lists the same selected-row treatment', async () => {
    const user = userEvent.setup();
    const imagesRoot = renderImages();
    await user.click(imagesRoot.querySelector<HTMLElement>('.ui-data-table__row')!);
    const imagesSelectedRow = imagesRoot.querySelector<HTMLElement>('.ui-data-table__row')!;
    const imagesSelectedClass = imagesSelectedRow.className;
    const imagesAriaSelected = imagesSelectedRow.getAttribute('aria-selected');
    cleanup();

    const containersRoot = renderContainers();
    await user.click(containersRoot.querySelector<HTMLElement>('.ui-data-table__row')!);
    const containersSelectedRow = containersRoot.querySelector<HTMLElement>('.ui-data-table__row')!;

    expect(imagesSelectedClass).toBe(containersSelectedRow.className);
    expect(imagesSelectedClass).toContain('ui-data-table__row--selected');
    expect(imagesAriaSelected).toBe(containersSelectedRow.getAttribute('aria-selected'));
  });

  // Every header label is uppercase on both screens, and every genuine data-column header (the
  // selection column excluded — it carries no label) uses the exact same class on both screens.
  // What is *not* asserted is that the two screens have the same number of headers: REQ-3 promises
  // shared column typography, not an identical column set (images-screen.md, containers-screen.md).
  it('gives both lists the same header column typography and uppercase headers on their own columns', () => {
    const imagesRoot = renderImages();
    const imagesHeaders = Array.from(imagesRoot.querySelectorAll('.ui-data-table__header-cell')).map((cell) => cell.textContent ?? '');
    const imagesDataHeaderClasses = fingerprint(imagesRoot).dataHeaderCellClasses;
    cleanup();
    const containersRoot = renderContainers();
    const containersHeaders = Array.from(containersRoot.querySelectorAll('.ui-data-table__header-cell')).map((cell) => cell.textContent ?? '');
    const containersDataHeaderClasses = fingerprint(containersRoot).dataHeaderCellClasses;

    for (const label of [...imagesHeaders, ...containersHeaders]) {
      expect(label).toBe(label.toUpperCase());
    }
    expect(imagesDataHeaderClasses).toEqual(containersDataHeaderClasses);
  });

  it('reserves the same action column width on both lists', () => {
    const imagesRoot = renderImages();
    const imagesTrack = fingerprint(imagesRoot).actionColumnTrack;
    cleanup();
    const containersRoot = renderContainers();

    expect(imagesTrack).toBe(fingerprint(containersRoot).actionColumnTrack);
  });

  it('no longer renders the images list as stacked cards', () => {
    const imagesRoot = renderImages();

    expect(imagesRoot.querySelector('.ui-card-list')).toBeNull();
    expect(imagesRoot.querySelector('.ui-data-table')).not.toBeNull();
  });
});

// The containers table is the reference layout: this batch must leave it
// untouched (batch-images-table-alignment, "Constraints").
describe('ContainersScreen remains the reference layout (plan-docker_management_app/REQ-3)', () => {
  it('still renders its own eight columns, in order, with the lifecycle action column last', () => {
    const containersRoot = renderContainers();

    const headers = Array.from(containersRoot.querySelectorAll('.ui-data-table__header-cell')).map((cell) => cell.textContent ?? '');
    expect(headers).toEqual(['', 'NAME', 'IMAGE', 'CPU', 'MEMORY', 'PORTS', 'UPTIME', 'LIFECYCLE']);
  });

  it('still shows its lifecycle actions on the row', () => {
    const containersRoot = renderContainers();

    const row = containersRoot.querySelector<HTMLElement>('.ui-data-table__row')!;
    const labels = Array.from(row.querySelectorAll('.ui-action-button-group button')).map((button) => button.textContent?.trim());
    expect(labels).toEqual(['stop', 'pause', 'restart', 'kill', 'rm']);
  });
});
