import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContainersScreen } from '../../src/containers/ContainersScreen';
import { ImagesScreen } from '../../src/images/ImagesScreen';
import type { ContainerSummary } from '../../src/data/containers-client';
import type { ImageSummary } from '../../src/data/images-client';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
import { ErrorReportingProvider } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';
import { ToastProvider } from '../../src/ui';

/**
 * plan-docker_management_app/REQ-3 — the two core list screens must present the
 * same kind of object with one single visual language: same header row
 * treatment, same column typography, same row height, same hover/selected
 * treatment. In jsdom no stylesheet is applied, so what is comparable here is
 * the markup the visual language is carried by: the table element, its header
 * and cell class names (which the typography is attached to), the row height,
 * the selected-row class, the table's wrapper and its height policy. The
 * computed-style side of the comparison is covered by the e2e suite.
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
          <ToastProvider>{children}</ToastProvider>
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
  headerCellClasses: string[];
  scrollAreaMaxHeight: string;
  rowClass: string;
  rowHeight: string;
  cellClasses: string[];
  actionColumnTrack: string;
  actionGroupClass: string;
}

function fingerprint(root: HTMLElement): TableFingerprint {
  const table = root.querySelector<HTMLElement>('.ui-data-table')!;
  const header = table.querySelector<HTMLElement>('.ui-data-table__header')!;
  const row = table.querySelector<HTMLElement>('.ui-data-table__row')!;
  const scrollArea = table.querySelector<HTMLElement>('[style*="max-height"], .ui-scroll-area');
  const headerTracks = header.style.gridTemplateColumns.split(' ');
  return {
    tableCount: root.querySelectorAll('.ui-data-table').length,
    tableClass: table.className,
    wrapperClass: table.parentElement?.className ?? '',
    headerClass: header.className,
    headerCellClasses: Array.from(new Set(Array.from(header.children).map((cell) => cell.className))),
    scrollAreaMaxHeight: scrollArea?.style.maxHeight ?? '',
    rowClass: row.className,
    rowHeight: row.style.height,
    cellClasses: Array.from(new Set(Array.from(row.children).map((cell) => cell.className))),
    actionColumnTrack: headerTracks[headerTracks.length - 1] ?? '',
    actionGroupClass: row.querySelector('.ui-action-button-group')?.className ?? '',
  };
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
  it('renders both lists with the same table component, wrapper, header, row and cell treatment', () => {
    const imagesRoot = renderImages();
    const imagesFingerprint = fingerprint(imagesRoot);
    cleanup();
    const containersRoot = renderContainers();
    const containersFingerprint = fingerprint(containersRoot);

    expect(imagesFingerprint).toEqual(containersFingerprint);
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

  it('gives both lists the same header column typography and uppercase headers', () => {
    const imagesRoot = renderImages();
    const imagesHeaders = Array.from(imagesRoot.querySelectorAll('.ui-data-table__header-cell')).map((cell) => cell.textContent ?? '');
    cleanup();
    const containersRoot = renderContainers();
    const containersHeaders = Array.from(containersRoot.querySelectorAll('.ui-data-table__header-cell')).map((cell) => cell.textContent ?? '');

    for (const label of [...imagesHeaders, ...containersHeaders]) {
      expect(label).toBe(label.toUpperCase());
    }
    expect(imagesHeaders.length).toBe(containersHeaders.length);
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
