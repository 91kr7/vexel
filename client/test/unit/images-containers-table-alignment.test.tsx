import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
 * plan-docker_management_app/REQ-3 asked the two core list screens to apply the same `DataTable`
 * treatment uniformly — same header style, same column typography, same row height, same
 * hover/selected treatment. **On 2026-08-25 the containers screen stopped being a table**
 * (plan-docker_management_app-containers_card_view/REQ-1), so half of that claim stopped having a
 * subject: there is no containers header to compare, no containers row height, no containers
 * column typography.
 *
 * What is left is restated rather than removed
 * (plan-docker_management_app-containers_card_view/REQ-38), in three parts:
 *
 * - **the images half is exactly what it was** — the images list is still the classic table, with
 *   its own treatment, its own selection column and its own action-column token, and it is still
 *   not a stack of cards;
 * - **the containers half is the card's own arrangement** — one surface per container, its three
 *   bands in order, its four controls, its selected treatment;
 * - **and what the two still genuinely share is their material**, which is the part of REQ-3 that
 *   survives: the card's hover and selected highlights are the table row's own tokens, taken by
 *   reference and declared in exactly one place each
 *   (plan-docker_management_app-containers_card_view/REQ-28, REQ-29).
 *
 * In jsdom no stylesheet is applied, so what is comparable here is the markup the visual language
 * is carried by — class names, arrangement, the row height the images table still writes — and the
 * stylesheet is read as source where a token has to be shown to be referenced rather than
 * re-declared. The **measured** geometry of the card is `client/e2e/containers-card-geometry.spec.ts`.
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

  url: string;

  constructor(url: string) {
    this.url = url;
  }

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
  actionGroupClass: string;
}

function fingerprint(root: HTMLElement): TableFingerprint {
  const table = root.querySelector<HTMLElement>('.ui-data-table')!;
  const header = table.querySelector<HTMLElement>('.ui-data-table__header')!;
  const row = table.querySelector<HTMLElement>('.ui-data-table__row')!;
  const scrollArea = table.querySelector<HTMLElement>('[style*="max-height"], .ui-scroll-area');
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
    actionGroupClass: row.querySelector('.ui-action-button-group')?.className ?? '',
  };
}

/**
 * The track a list reserves for its last column — the action column. Deliberately outside the
 * shared fingerprint: the two screens no longer reserve the same width, and that difference is a
 * requirement rather than a drift (see the check that asserts each one's token). Read from the
 * inline grid track list the header carries, since jsdom applies no stylesheet.
 */
function actionColumnTrack(root: HTMLElement): string {
  const header = root.querySelector<HTMLElement>('.ui-data-table__header')!;
  const tracks = header.style.gridTemplateColumns.split(' ');
  return tracks[tracks.length - 1] ?? '';
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

/** One container's card: the surface the containers screen draws per container, in the row's place. */
function containerCards(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.ui-surface--selectable'));
}

/** A stylesheet with its comments stripped, so a token named in a comment cannot be read as a declaration. */
function stylesheet(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The declarations of one selector, in source order, as written. */
function declarationsOf(css: string, selector: string): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((rule) => rule[1].split(',').some((one) => one.trim() === selector))
    .map((rule) => rule[2].trim());
}

describe('The images list is still the classic table (plan-docker_management_app/REQ-3)', () => {
  it('renders it through the one DataTable, with its wrapper, header, row and data-cell treatment', () => {
    const imagesFingerprint = fingerprint(renderImages());

    expect(imagesFingerprint.tableCount).toBe(1);
    expect(imagesFingerprint.tableClass).toContain('ui-data-table');
    expect(imagesFingerprint.wrapperClass).not.toBe('');
    expect(imagesFingerprint.headerClass).toContain('ui-data-table__header');
    expect(imagesFingerprint.rowClass).toContain('ui-data-table__row');
    expect(imagesFingerprint.dataHeaderCellClasses).not.toHaveLength(0);
    expect(imagesFingerprint.dataCellClasses).not.toHaveLength(0);
    expect(imagesFingerprint.actionGroupClass).toContain('ui-action-button-group');
  });

  // images-screen.md — Images alone has a bulk action needing a selection; Containers carries none
  // (plan-docker_management_app-containers_card_view/REQ-25).
  it('gives Images alone the multi-select checkbox column, which Containers still does not carry', () => {
    const imagesRoot = renderImages();
    expect(hasSelectionColumn(imagesRoot)).toBe(true);
    cleanup();

    const containersRoot = renderContainers();
    expect(containersRoot.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(containersRoot.querySelector('.ui-bulk-action-bar')).toBeNull();
  });

  it('still writes a row height on every row of it', () => {
    const imagesFingerprint = fingerprint(renderImages());

    expect(imagesFingerprint.rowHeight).not.toBe('');
  });

  it('still marks its selected row with the library\'s own selected class', async () => {
    const user = userEvent.setup();
    const imagesRoot = renderImages();

    await user.click(imagesRoot.querySelector<HTMLElement>('.ui-data-table__row')!);

    const selected = imagesRoot.querySelector<HTMLElement>('.ui-data-table__row')!;
    expect(selected.className).toContain('ui-data-table__row--selected');
    expect(selected.getAttribute('aria-selected')).toBe('true');
  });

  // Every header label is uppercase, and every genuine data-column header (the selection column
  // excluded — it carries no label) uses the library's own header-cell class.
  it('keeps its headers uppercase and its data-column typography the library\'s', () => {
    const imagesRoot = renderImages();

    const labels = Array.from(imagesRoot.querySelectorAll('.ui-data-table__header-cell')).map((cell) => cell.textContent ?? '');
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).toBe(label.toUpperCase());
    for (const cellClass of fingerprint(imagesRoot).dataHeaderCellClasses) {
      expect(cellClass).toContain('ui-data-table__header-cell');
    }
  });

  // plan-docker_management_app-image_row_actions/REQ-18 — the images row reserves the narrower of the
  // two action-column tokens, its own having come down to the overflow control alone.
  it('sizes its action column from the library token matching what its rows carry', () => {
    const imagesRoot = renderImages();

    expect(actionColumnTrack(imagesRoot)).toBe('var(--data-table-menu-action-column-width)');
  });

  it('is not, and has not become, a stack of cards', () => {
    const imagesRoot = renderImages();

    expect(imagesRoot.querySelector('.ui-card-list')).toBeNull();
    expect(containerCards(imagesRoot)).toHaveLength(0);
    expect(imagesRoot.querySelector('.ui-data-table')).not.toBeNull();
  });
});

// The containers half, restated against the card rather than deleted
// (plan-docker_management_app-containers_card_view/REQ-1, REQ-9, REQ-38).
describe('The containers list is a card per container (plan-docker_management_app-containers_card_view/REQ-1, REQ-9)', () => {
  it('draws one surface per container and no table on the screen at all', () => {
    const containersRoot = renderContainers();

    expect(containerCards(containersRoot)).toHaveLength(1);
    expect(containersRoot.querySelector('.ui-data-table')).toBeNull();
    expect(containersRoot.querySelector('.ui-data-table__header')).toBeNull();
    expect(containersRoot.querySelector('.ui-data-table__row')).toBeNull();
  });

  // container-card.md — five content bands then a footer, in one order on every card (REQ-9).
  it('lays its bands out in order: identity, state, image, metrics, then the footer’s actions', () => {
    const [card] = containerCards(renderContainers());

    const body = card.querySelector<HTMLElement>('.ui-surface__body')!;
    const bands = Array.from((body.firstElementChild as HTMLElement).children);
    expect(bands).toHaveLength(4);
    expect(bands[0].querySelector('.ui-section-header__title')?.textContent).toBe('web-nginx');
    expect(bands[0].querySelector('.ui-table-identifier-cell')?.textContent).toBe('container1');
    expect(bands[1].querySelector('.ui-badge')?.textContent).toBe('RUNNING');
    expect(bands[1].textContent).toContain('Up 3 days');
    expect(bands[2].className, 'the image does not take a field of its own').toContain('ui-chip--block');
    expect(bands[3].querySelector('.ui-metric-strip__column')).not.toBeNull();
    expect(bands[3].querySelectorAll('.ui-metric-strip__column')).toHaveLength(3);
    expect(bands[3].querySelector('.ui-metric-strip__row .ui-meter__label--eyebrow')?.textContent).toBe('PORTS');

    // Read and act are two gestures: no action stands between two bands of content.
    const footer = card.querySelector<HTMLElement>('.ui-surface__footer')!;
    expect(footer.querySelectorAll('.ui-action-button-group')).toHaveLength(2);
    expect(body.querySelector('.ui-action-button-group')).toBeNull();
  });

  // container-card.md — the identity row's reading order, and the four action slots in the footer.
  it('carries the dot and the name at the left, the id anchored right, then its four controls below', () => {
    const [card] = containerCards(renderContainers());

    const identity = card.querySelector('.ui-surface__body .ui-row') as HTMLElement;
    expect(identity.querySelector('.ui-table-status-dot')).not.toBeNull();
    expect(identity.querySelector('.ui-section-header__title')?.textContent).toBe('web-nginx');
    expect(identity.lastElementChild!.querySelector('.ui-table-identifier-cell')?.textContent).toBe('container1');
    expect(identity.querySelector('.ui-icon-button')?.getAttribute('aria-label')).toBe('Open web-nginx details');

    const controls = Array.from(card.querySelectorAll<HTMLButtonElement>('.ui-action-button-group button'));
    expect(controls.map((control) => control.textContent?.trim())).toEqual(['Stop', 'Pause', 'Restart', '…']);
    // `Pause` · `Restart` · `…` share one boundary; the primary slot stands apart from them (REQ-4).
    expect(card.querySelectorAll('.ui-action-button-group--segmented')).toHaveLength(1);
    expect(card.querySelector('.ui-action-button-group--segmented')?.querySelectorAll('button')).toHaveLength(3);
  });

  it('marks the selected card with the surface\'s own selected treatment', async () => {
    const user = userEvent.setup();
    const containersRoot = renderContainers();

    await user.click(containerCards(containersRoot)[0]);

    const [card] = containerCards(containersRoot);
    expect(card.className).toContain('ui-surface--selected');
    expect(card.getAttribute('aria-selected')).toBe('true');
  });
});

// The part of plan-docker_management_app/REQ-3 that survives the card view: the material is still
// the table row's, by reference (plan-docker_management_app-containers_card_view/REQ-28, REQ-29).
describe('The card takes the table row\'s material by reference (containers_card_view/REQ-28, REQ-29)', () => {
  const tableCss = stylesheet('src/ui/data/data-table.css');
  const surfaceCss = stylesheet('src/ui/glass/surface.css');

  it('highlights a hovered card with the very token the hovered row uses', () => {
    const rowHover = declarationsOf(tableCss, '.ui-data-table__row:hover').join(' ');
    const cardHover = declarationsOf(surfaceCss, '.ui-surface--selectable:hover').join(' ');

    expect(rowHover).toContain('var(--color-surface-2)');
    expect(cardHover, 'the card declares no hover highlight at all').not.toBe('');
    expect(cardHover).toContain('var(--color-surface-2)');
    expect(cardHover, 'the card writes a colour of its own for the hover highlight').not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|hsla?\(/i);
  });

  it('highlights the selected card with the very token the selected row uses', () => {
    const rowSelected = declarationsOf(tableCss, '.ui-data-table__row--selected').join(' ');
    const cardSelected = declarationsOf(surfaceCss, '.ui-surface--selected').join(' ');

    expect(rowSelected).toContain('var(--color-accent-tint)');
    expect(cardSelected, 'the card declares no selected highlight at all').not.toBe('');
    expect(cardSelected).toContain('var(--color-accent-tint)');
    expect(cardSelected, 'the card writes a colour of its own for the selected highlight').not.toMatch(
      /#[0-9a-f]{3,8}|rgba?\(|hsla?\(/i,
    );
  });

  it('leaves the box, the border and the radius to the one surface declaration', () => {
    const surface = declarationsOf(surfaceCss, '.ui-surface').join(' ');

    expect(surface).toContain('var(--radius-xl)');
    expect(surface).toContain('var(--color-border-subtle)');
    // The containers feature owns none of it: no stylesheet of its own, and no card stylesheet either.
    expect(existsSync(join(process.cwd(), 'src/ui/glass/card.css')), 'a card stylesheet was created').toBe(false);
    expect(readFileSync(join(process.cwd(), 'src/containers/ContainerCard.tsx'), 'utf8')).not.toMatch(/import\s+['"].*\.css['"]/);
  });
});
