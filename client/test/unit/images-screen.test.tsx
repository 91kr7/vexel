import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImagesScreen } from '../../src/images/ImagesScreen';
import type { ImageSummary } from '../../src/data/images-client';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
// ImagesScreen reaches a layer named by another screen (images/specs/images-screen.md),
// so it only stands inside a cross-navigation provider.
import { CrossNavigationProvider } from '../../src/shell/services/CrossNavigationService';
import { ErrorReportingProvider, useErrorReporter } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';
import { ToastProvider } from '../../src/ui';

function makeImage(overrides: Partial<ImageSummary> = {}): ImageSummary {
  return {
    id: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef',
    shortId: '0123456789ab',
    tags: ['nginx:1.27'],
    digest: 'sha256:fedcba9876543210fedcba9876543210fedcba98',
    platforms: ['linux/amd64'],
    sizeBytes: 2048,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

// The detail panel's inspect hook subscribes to daemon events through a
// module-level EventSource, which jsdom does not provide.
class FakeEventSource {
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  url: string;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener() {
    // no event delivery is needed for these tests
  }

  close() {
    this.closed = true;
  }
}

function ReportedErrors() {
  const { errors } = useErrorReporter();
  return (
    <>
      {errors.map((error) => (
        <p key={error.id}>{`${error.title}${error.detail ? `: ${error.detail}` : ''}`}</p>
      ))}
    </>
  );
}

function screenTree(images: ImageSummary[], onRefresh: () => void) {
  return (
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <CrossNavigationProvider>
            <ToastProvider>
              <ImagesScreen images={images} loaded onRefresh={onRefresh} />
              <ReportedErrors />
            </ToastProvider>
          </CrossNavigationProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>
  );
}

function renderScreen(images: ImageSummary[], onRefresh = vi.fn()) {
  const view = render(screenTree(images, onRefresh));
  return {
    onRefresh,
    /** Re-renders the screen with a new list, the way the live list re-reads under it. */
    withImages: (next: ImageSummary[]) => view.rerender(screenTree(next, onRefresh)),
  };
}

/** The row's action area, which is the row's only action-bearing area. */
function actionArea(index = 0): HTMLElement {
  return document.querySelectorAll<HTMLElement>('.ui-action-button-group')[index]!;
}

/** Opens a row's overflow menu and returns its entries, in the order they are listed. */
async function openOverflow(user: ReturnType<typeof userEvent.setup>, title = 'nginx:1.27'): Promise<HTMLElement[]> {
  await user.click(screen.getByRole('button', { name: `More actions for ${title}` }));
  return screen.getAllByRole('menuitem');
}

/**
 * The width the table reserves for its last column — the action column. Read
 * from the inline grid track list the header carries, since jsdom applies no
 * stylesheet.
 */
function actionColumnTrack(): string {
  const header = document.querySelector<HTMLElement>('.ui-data-table__header')!;
  const tracks = /grid-template-columns:\s*([^;]+)/.exec(header.getAttribute('style') ?? '')?.[1] ?? '';
  return tracks.trim().split(/\s+/).pop() ?? '';
}

function tableRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-data-table__row'));
}

// The primary cell is a title-over-subtitle pair (ui-library TwoLineCell), so
// the reference it shows is read from the title line rather than from the row's
// text as a whole — the same reference also appears as a tag badge.
function primaryReference(row: HTMLElement): string {
  return row.querySelector('.ui-table-two-line-cell__title')?.textContent ?? '';
}

function primarySubtitle(row: HTMLElement): string {
  return row.querySelector('.ui-table-two-line-cell__subtitle')?.textContent ?? '';
}

function headerLabels(): string[] {
  return Array.from(document.querySelectorAll('.ui-data-table__header-cell')).map((cell) => cell.textContent ?? '');
}

function inspectPayload() {
  return {
    id: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef',
    tags: ['nginx:1.27'],
    digest: 'sha256:fedcba9876543210fedcba9876543210fedcba98',
    platforms: ['linux/amd64'],
    sizeBytes: 2048,
    createdAt: '2026-01-01T00:00:00Z',
    entrypoint: [],
    command: ['nginx'],
    env: ['PATH=/usr/bin'],
    labels: { team: 'platform' },
    exposedPorts: ['80/tcp'],
    history: [],
    raw: { Id: 'sha256:0123456789abcdef' },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // The expanded detail panel reads the image's inspect payload; every other
  // call is a mutation answered with an empty success.
  fetchMock = vi.fn().mockImplementation((url: string) =>
    Promise.resolve(
      String(url).includes('/inspect')
        ? { ok: true, status: 200, json: () => Promise.resolve(inspectPayload()) }
        : { ok: true, status: 204, json: () => Promise.resolve({}) },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// images/specs/images-screen.md — "Shows": a header row and one row per image,
// in the columns the requirement lists.
describe('ImagesScreen — image list columns (plan-docker_management_app/REQ-37)', () => {
  it('presents the images as a table with a header row naming every column', () => {
    renderScreen([makeImage()]);

    expect(document.querySelector('.ui-data-table')).not.toBeNull();
    // images-screen.md — a leading multi-select checkbox column (REQ-42) precedes the status dot column.
    expect(headerLabels()).toEqual(['', '', 'REPOSITORY:TAG', 'TAGS', 'DIGEST', 'PLATFORM', 'SIZE', 'CREATED', 'ACTIONS']);
  });

  it('shows the first reference over the short id, the tags, the digest, the platform, the size and the age', () => {
    renderScreen([
      makeImage({
        tags: ['nginx:1.27'],
        shortId: '0123456789ab',
        digest: 'sha256:fedcba9876543210fedcba9876543210fedcba98',
        platforms: ['linux/amd64'],
        sizeBytes: 2048,
      }),
    ]);

    const row = tableRows()[0]!;
    expect(primaryReference(row)).toBe('nginx:1.27');
    expect(primarySubtitle(row)).toBe('0123456789ab');
    expect(within(row).getByTitle('sha256:fedcba9876543210fedcba9876543210fedcba98')).toBeInTheDocument();
    expect(within(row).getByText('linux/amd64')).toBeInTheDocument();
    expect(row.textContent).toMatch(/2\.0KB/);
    expect(row.textContent).toMatch(/3 days ago/);
  });

  it('shows every platform of a multi-platform image', () => {
    renderScreen([makeImage({ platforms: ['linux/amd64', 'linux/arm64'] })]);

    expect(tableRows()[0]!.textContent).toContain('linux/arm64');
  });

  it('falls back to the id in the digest column when the image has no digest', () => {
    renderScreen([makeImage({ digest: undefined, id: 'sha256:0123456789abcdef0123456789abcdef' })]);

    expect(within(tableRows()[0]!).getByTitle('sha256:0123456789abcdef0123456789abcdef')).toBeInTheDocument();
  });

  it('shows at most two tag badges and reports the remaining ones with a +N badge', () => {
    renderScreen([makeImage({ tags: ['nginx:1.27', 'nginx:latest', 'nginx:stable'] })]);

    const badges = Array.from(tableRows()[0]!.querySelectorAll('.ui-badge')).map((badge) => badge.textContent);
    expect(badges).toEqual(['nginx:1.27', 'nginx:latest', '+1']);
  });

  it('marks a dangling image with a warning status dot and a "dangling" badge, and shows <none> as its reference', () => {
    renderScreen([makeImage({ tags: [] })]);

    const row = tableRows()[0]!;
    expect(row.querySelector('.ui-table-status-dot--tone-warning')).not.toBeNull();
    const danglingBadge = within(row).getByText('dangling');
    expect(danglingBadge.className).toContain('ui-badge--tone-warning');
    expect(primaryReference(row)).toBe('<none>');
  });

  it('marks a tagged image with a success status dot', () => {
    renderScreen([makeImage({ tags: ['nginx:1.27'] })]);

    expect(tableRows()[0]!.querySelector('.ui-table-status-dot--tone-success')).not.toBeNull();
  });
});

// images/specs/images-screen.md — the row's action area holds one overflow control and nothing
// else, in every state of the image, and the six operations are its menu's entries
// (plan-docker_management_app-image_row_actions/REQ-1, REQ-2, REQ-3).
describe('ImagesScreen — the row carries the overflow control alone (REQ-1, REQ-2, REQ-3)', () => {
  const STATES: Array<{ label: string; image: ImageSummary; title: string }> = [
    { label: 'tagged', image: makeImage({ id: 'image-a', tags: ['nginx:1.27'] }), title: 'nginx:1.27' },
    { label: 'multi-tagged', image: makeImage({ id: 'image-b', tags: ['multi:1', 'multi:2'] }), title: 'multi:1, multi:2' },
    { label: 'dangling', image: makeImage({ id: 'image-c', shortId: 'cccccccccccc', tags: [] }), title: '<none> (cccccccccccc)' },
  ];

  it.each(STATES)('carries the overflow control, and only it, on a $label image', ({ image, title }) => {
    renderScreen([image]);

    const controls = Array.from(actionArea().querySelectorAll('button'));
    expect(controls).toHaveLength(1);
    expect(controls[0]).toHaveAccessibleName(`More actions for ${title}`);
    // It reads as "there is more here": a menu opener, announcing whether it is open.
    expect(controls[0]).toHaveAttribute('aria-haspopup', 'menu');
    expect(controls[0]).toHaveAttribute('aria-expanded', 'false');
  });

  it.each(STATES)('puts no other action-bearing control anywhere on the row of a $label image', ({ image }) => {
    renderScreen([image]);

    const row = tableRows()[0]!;
    const rowButtons = within(row).getAllByRole('button');
    expect(rowButtons).toHaveLength(1);
    expect(actionArea().contains(rowButtons[0]!)).toBe(true);
    // None of the six flat actions survives anywhere on the row.
    for (const label of ['run', 'tag', 'untag', 'push', 'save', 'remove']) {
      expect(within(row).queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  it('carries it in the same final position on every row, whatever the image', () => {
    renderScreen([
      makeImage({ id: 'image-a', tags: ['a:1'] }),
      makeImage({ id: 'image-b', tags: [] }),
      makeImage({ id: 'image-c', tags: ['c:1', 'c:2', 'c:3'] }),
    ]);

    for (const row of tableRows()) {
      const cells = Array.from(row.children);
      const area = row.querySelector('.ui-action-button-group')!;
      expect(cells[cells.length - 1]!.contains(area)).toBe(true);
      expect(Array.from(area.querySelectorAll('button'))).toHaveLength(1);
    }
  });

  it('names the control after its own image, keeping two dangling rows apart', () => {
    renderScreen([
      makeImage({ id: 'image-a', shortId: 'aaaaaaaaaaaa', tags: [] }),
      makeImage({ id: 'image-b', shortId: 'bbbbbbbbbbbb', tags: [] }),
    ]);

    expect(screen.getByRole('button', { name: 'More actions for <none> (aaaaaaaaaaaa)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions for <none> (bbbbbbbbbbbb)' })).toBeInTheDocument();
  });

  // images-screen.md — the column is sized from the library's menu-only action column token, not
  // from the wider button one, and no length is written on the screen (REQ-18).
  it('sizes the action column for the single control it now carries', () => {
    renderScreen([makeImage()]);

    expect(actionColumnTrack()).toBe('var(--data-table-menu-action-column-width)');
  });
});

// images/specs/images-screen.md — the menu holds exactly ten entries, always all ten, always in
// the same order, read as three groups marked by separation and tone alone
// (REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-25, REQ-26).
describe('ImagesScreen — the row menu of ten (REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-25, REQ-26)', () => {
  const LABELS = [
    'Explore layers…',
    'Efficiency & signals…',
    'Browse filesystem…',
    'Compare with…',
    'Run…',
    'Tag…',
    'Untag',
    'Push…',
    'Save',
    'Remove',
  ];

  it.each([
    { label: 'tagged', tags: ['nginx:1.27'], title: 'nginx:1.27' },
    { label: 'multi-tagged', tags: ['multi:1', 'multi:2'], title: 'multi:1, multi:2' },
    { label: 'dangling', tags: [], title: '<none> (0123456789ab)' },
  ])('lists the four analyses, then Run…, Tag…, Untag, Push…, Save, then Remove, in that order and nothing else, on a $label image', async ({ tags, title }) => {
    const user = userEvent.setup();
    renderScreen([makeImage({ tags })]);

    const entries = await openOverflow(user, title);

    expect(entries).toHaveLength(LABELS.length);
    LABELS.forEach((label, index) => expect(entries[index]).toHaveAccessibleName(label));
  });

  it('opens the same ten entries in the same order at every opening', async () => {
    const user = userEvent.setup();
    renderScreen([makeImage({ tags: ['nginx:1.27'] })]);

    const first = (await openOverflow(user)).map((entry) => entry.textContent);
    await user.keyboard('{Escape}');
    const second = (await openOverflow(user)).map((entry) => entry.textContent);

    expect(second).toEqual(first);
  });

  // Three groups, marked by separation and tone alone: one boundary above `Run…`, the one that
  // already set `Remove` apart, and nothing else — no heading, no group label (REQ-6).
  it('marks the two group boundaries and introduces no section heading', async () => {
    const user = userEvent.setup();
    renderScreen([makeImage({ tags: ['nginx:1.27'] })]);

    await openOverflow(user);

    const separators = screen.getAllByRole('separator');
    expect(separators).toHaveLength(2);
    expect(separators[0]!.nextElementSibling).toHaveAccessibleName('Run…');
    expect(separators[1]!.nextElementSibling).toHaveAccessibleName('Remove');
    // The popup holds entries and separators, and nothing that reads as a heading.
    const list = screen.getByRole('menu');
    expect(within(list).queryByRole('heading')).not.toBeInTheDocument();
    for (const child of Array.from(list.children)) {
      expect(['menuitem', 'separator']).toContain(child.getAttribute('role'));
    }
  });

  it('keeps Remove destructive with rmi as the menu\'s only hint, the four arrivals carrying none', async () => {
    const user = userEvent.setup();
    // Two images, so `Compare with…` is available and carries no reason of its own either.
    renderScreen([makeImage({ id: 'image-a', tags: ['nginx:1.27'] }), makeImage({ id: 'image-b', tags: ['other:1'] })]);

    const entries = await openOverflow(user);

    expect(entries[9]!.className).toContain('destructive');
    expect(entries[9]).toHaveTextContent('rmi');
    expect(entries[9]).toHaveAccessibleDescription(/rmi/);
    // No other entry is destructive, and none of them carries a secondary hint: the four arrivals
    // keep the labels they had on the panel, ellipses included, and nothing beside them.
    entries.slice(0, 9).forEach((entry, index) => {
      expect(entry.className).not.toContain('destructive');
      expect(entry.textContent?.trim()).toBe(LABELS[index]);
      expect(entry).toHaveAccessibleDescription('');
    });
  });

  it('keeps Untag and Push… in place and disabled, stating why, when the image has no tags', async () => {
    const user = userEvent.setup();
    renderScreen([makeImage({ id: 'image-c', shortId: 'cccccccccccc', tags: [] }), makeImage({ id: 'image-b', tags: ['other:1'] })]);

    const entries = await openOverflow(user, '<none> (cccccccccccc)');

    expect(entries[6]).toHaveAccessibleName('Untag');
    expect(entries[6]).toHaveAttribute('aria-disabled', 'true');
    expect(entries[6]).toHaveAccessibleDescription(/no tags to untag/i);
    expect(entries[7]).toHaveAccessibleName('Push…');
    expect(entries[7]).toHaveAttribute('aria-disabled', 'true');
    expect(entries[7]).toHaveAccessibleDescription(/no tags to push/i);
    // Every other entry — the four analyses included — applies to a dangling image just as well.
    for (const index of [0, 1, 2, 3, 4, 5, 8, 9]) {
      expect(entries[index]).not.toHaveAttribute('aria-disabled', 'true');
    }
  });

  // The tallest state the menu is ever read in, and the one no live daemon can be put into: a
  // dangling image that is also the only image in the list, so `Untag`, `Push…` **and**
  // `Compare with…` each carry a reason line under their label at once. The popup's own height is
  // not measurable here (jsdom lays nothing out) and is asserted in the browser on the states a
  // daemon can be put into (`images.spec.ts`); what is checked here is that all ten entries and all
  // three reasons are rendered together (REQ-9, REQ-25).
  it('renders all ten entries and all three reasons at once on a dangling image alone in the list', async () => {
    const user = userEvent.setup();
    renderScreen([makeImage({ id: 'image-c', shortId: 'cccccccccccc', tags: [] })]);

    const entries = await openOverflow(user, '<none> (cccccccccccc)');

    expect(entries).toHaveLength(LABELS.length);
    LABELS.forEach((label, index) => expect(entries[index]).toHaveAccessibleName(label));
    expect(entries[3]).toHaveAccessibleDescription(/second image/i);
    expect(entries[6]).toHaveAccessibleDescription(/no tags to untag/i);
    expect(entries[7]).toHaveAccessibleDescription(/no tags to push/i);
    const reasons = screen.getByRole('menu').querySelectorAll('.ui-menu__item-reason');
    expect(reasons).toHaveLength(3);
  });

  // REQ-25 — shown in place and disabled, never removed, and the reason states a condition of the
  // *list* rather than a fault of this row's image, deliberately unlike Untag's and Push…'s.
  it('shows Compare with… disabled, on a reason naming the list, while the list holds one image', async () => {
    const user = userEvent.setup();
    renderScreen([makeImage({ tags: ['nginx:1.27'] })]);

    const entries = await openOverflow(user);

    expect(entries[3]).toHaveAccessibleName('Compare with…');
    expect(entries[3]).toHaveAttribute('aria-disabled', 'true');
    expect(entries[3]).toHaveAccessibleDescription(/list/i);
    expect(entries[3]).toHaveAccessibleDescription(/second image/i);
    // Not a fact about this image, which is what Untag's and Push…'s reasons are.
    expect(entries[3]).not.toHaveAccessibleDescription(/this image/i);
  });

  // REQ-26 — the availability follows the live list: a second image appearing from outside the
  // application makes the entry available at the next opening.
  it('offers Compare with… once a second image appears in the list', async () => {
    const user = userEvent.setup();
    const first = makeImage({ id: 'image-a', tags: ['a:1'] });
    const { withImages } = renderScreen([first]);

    expect((await openOverflow(user, 'a:1'))[3]).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Escape}');

    withImages([first, makeImage({ id: 'image-b', tags: ['b:1'] })]);

    const entries = await openOverflow(user, 'a:1');
    expect(entries[3]).toHaveAccessibleName('Compare with…');
    expect(entries[3]).not.toHaveAttribute('aria-disabled', 'true');
    expect(entries[3]).toHaveAccessibleDescription('');
  });
});

// The operations these checks drove before this change are all still driven, through the entry
// each of them now has (REQ-10, REQ-11, REQ-32).
describe('ImagesScreen — the operations behind the entries (REQ-10, REQ-11)', () => {
  it('untags a single-tag image straight away, without a dialog and without a confirmation, then re-reads the list', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeImage({ tags: ['solo:1'] })]);

    const entries = await openOverflow(user, 'solo:1');
    await user.click(entries[6]!);

    expect(screen.queryByRole('heading', { name: /^Confirm:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Reference to untag' })).not.toBeInTheDocument();
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/images/untag');
    expect(url).toContain('reference=solo%3A1');
    expect(init.method).toBe('DELETE');
  });

  it('asks which reference to drop when the image has several tags, and untags the chosen one', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeImage({ tags: ['multi:1', 'multi:2'] })]);

    const entries = await openOverflow(user, 'multi:1, multi:2');
    await user.click(entries[6]!);

    const select = screen.getByRole('combobox', { name: 'Reference to untag' });
    await user.selectOptions(select, 'multi:2');
    await user.click(screen.getByRole('button', { name: 'Untag' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('reference=multi%3A2');
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('asks for confirmation naming the image before removing it, and performs nothing on cancel', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeImage({ tags: ['nginx:1.27'] })]);

    const entries = await openOverflow(user);
    await user.click(entries[9]!);

    expect(screen.getByRole('heading', { name: 'Confirm: nginx:1.27' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('removes the image and re-reads the list once confirmed', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeImage({ id: 'image-1', tags: ['nginx:1.27'] })]);

    const entries = await openOverflow(user);
    await user.click(entries[9]!);
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/images/image-1');
    expect(init.method).toBe('DELETE');
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('opens the tag dialog from its entry and reports the daemon error when tagging fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({ error: 'reference already exists' }) });
    renderScreen([makeImage({ tags: ['nginx:1.27'] })]);

    const entries = await openOverflow(user);
    await user.click(entries[5]!);
    const field = screen.getByRole('textbox', { name: 'New reference' });
    await user.clear(field);
    await user.type(field, 'nginx:copy');
    await user.click(screen.getByRole('button', { name: 'Tag' }));

    expect(await screen.findByText(/reference already exists/)).toBeInTheDocument();
  });

  // images-screen.md — a menu's entries are bound to the image its row was rendered for, so a
  // re-read or a re-sort under an open menu can never point an entry at another image (REQ-16).
  it('acts on the image its own row was rendered for', async () => {
    const user = userEvent.setup();
    renderScreen([makeImage({ id: 'image-a', tags: ['a:1'] }), makeImage({ id: 'image-b', tags: ['b:1'] })]);

    const entries = await openOverflow(user, 'b:1');
    await user.click(entries[9]!);
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/api/images/image-b');
  });
});

// images/specs/images-screen.md — selecting a row expands the detail panel
// directly below it, and the expanded region carries the panel alone.
describe('ImagesScreen — row expansion (plan-docker_management_app/REQ-37)', () => {
  it('expands the image detail panel directly below the selected row', async () => {
    const user = userEvent.setup();
    renderScreen([makeImage({ id: 'image-1', tags: ['nginx:1.27'] })]);

    expect(document.querySelector('.ui-data-table__expanded')).toBeNull();

    await user.click(tableRows()[0]!);

    const expanded = document.querySelector<HTMLElement>('.ui-data-table__expanded');
    expect(expanded).not.toBeNull();
    expect(expanded!.previousElementSibling?.className).toContain('ui-data-table__row');
    expect(tableRows()[0]!.getAttribute('aria-selected')).toBe('true');
  });

  // images-screen.md — the expanded region carries the panel alone: no row control of any kind
  // is rendered inside it (REQ-1, REQ-17).
  it('keeps every row control out of the expanded region, which carries the detail panel alone', async () => {
    const user = userEvent.setup();
    renderScreen([makeImage({ tags: ['nginx:1.27'] })]);

    await user.click(tableRows()[0]!);

    const expanded = document.querySelector<HTMLElement>('.ui-data-table__expanded')!;
    expect(expanded.querySelector('.ui-detail-panel')).not.toBeNull();
    expect(expanded.querySelector('.ui-action-button-group')).toBeNull();
    expect(within(expanded).queryByRole('button', { name: /^More actions for/ })).not.toBeInTheDocument();
    for (const label of ['run', 'tag', 'untag', 'push', 'save', 'remove']) {
      expect(within(expanded).queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  it('expands only one image at a time', async () => {
    const user = userEvent.setup();
    renderScreen([makeImage({ id: 'image-a', tags: ['a:1'] }), makeImage({ id: 'image-b', tags: ['b:1'] })]);

    await user.click(tableRows()[0]!);
    await user.click(tableRows()[1]!);

    expect(document.querySelectorAll('.ui-data-table__expanded')).toHaveLength(1);
    expect(document.querySelectorAll('.ui-data-table__row--selected')).toHaveLength(1);
  });
});

// image-detail-panel.md, images-screen.md — the panel offers no close control: the row that opened
// it closes it, and `Escape` closes it from the keyboard, arbitrated against everything this screen
// opens over it (REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-31).
describe('ImagesScreen — the detail panel is dismissed by its row and by Escape (REQ-20 … REQ-27, REQ-31)', () => {
  const first = makeImage({ id: 'image-a', shortId: 'aaaaaaaaaaaa', tags: ['a:1'] });
  const second = makeImage({ id: 'image-b', shortId: 'bbbbbbbbbbbb', tags: ['b:1'] });

  function expandedRegion(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.ui-data-table__expanded');
  }

  /** The row the open panel is rendered directly below — which image it is pointing at. */
  function panelOwner(): string {
    const expanded = expandedRegion();
    if (!expanded) throw new Error('no panel is open');
    return expanded.previousElementSibling?.textContent ?? '';
  }

  function rowFor(reference: string): HTMLElement {
    const row = tableRows().find((candidate) => candidate.textContent?.includes(reference));
    if (!row) throw new Error(`no row for ${reference}`);
    return row;
  }

  it('presents no close control on the panel, and nothing in its place', async () => {
    const user = userEvent.setup();
    renderScreen([first]);

    await user.click(rowFor('a:1'));

    const expanded = expandedRegion()!;
    expect(screen.queryByRole('button', { name: 'Close detail' })).not.toBeInTheDocument();
    expect(expanded.querySelector('.ui-detail-panel__close')).toBeNull();
    // The variant the shared panel already offers, asked for through its public contract.
    expect(expanded.querySelector('.ui-detail-panel')!.className).toContain('ui-detail-panel--no-close');
  });

  // Inverted, not dropped: the four actions this panel used to carry are gone from it, and nothing
  // takes their place — no strip, no gap, no link, no chevron, no tab, no keyboard hint
  // (panel_actions_to_menu REQ-1, REQ-2).
  it('presents no action bar at all, and none of the four analysis actions', async () => {
    const user = userEvent.setup();
    renderScreen([first]);

    await user.click(rowFor('a:1'));

    const panel = expandedRegion()!.querySelector<HTMLElement>('.ui-detail-panel')!;
    // The slot is omitted rather than emptied: no header strip is kept where the four buttons sat.
    expect(panel.querySelector('.ui-detail-panel__actions')).toBeNull();
    expect(panel.querySelector('.ui-detail-panel__header')).toBeNull();
    for (const label of ['Explore layers…', 'Efficiency & signals…', 'Browse filesystem…', 'Compare with…']) {
      expect(within(panel).queryByRole('button', { name: label })).not.toBeInTheDocument();
      expect(within(panel).queryByRole('link', { name: label })).not.toBeInTheDocument();
      expect(within(panel).queryByRole('tab', { name: label })).not.toBeInTheDocument();
    }
  });

  // The affordance moved rather than vanished: with a second image to compare with, the entry is
  // the row menu's, and the panel still offers nothing (REQ-1, REQ-25).
  it('offers Compare with… from the row menu, never from the panel, once there are two images', async () => {
    const user = userEvent.setup();
    renderScreen([first, second]);

    await user.click(rowFor('a:1'));

    expect(within(expandedRegion()!).queryByRole('button', { name: 'Compare with…' })).not.toBeInTheDocument();

    const entries = await openOverflow(user, 'a:1');

    expect(entries[3]).toHaveAccessibleName('Compare with…');
    expect(entries[3]).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('closes the panel when the already-selected row is selected again', async () => {
    const user = userEvent.setup();
    renderScreen([first, second]);

    await user.click(rowFor('a:1'));
    expect(expandedRegion()).not.toBeNull();

    await user.click(rowFor('a:1'));

    expect(expandedRegion()).toBeNull();
    expect(rowFor('a:1').getAttribute('aria-selected')).toBe('false');
  });

  it('keeps the panel open and re-points it when a different row is selected', async () => {
    const user = userEvent.setup();
    renderScreen([first, second]);

    await user.click(rowFor('a:1'));
    await user.click(rowFor('b:1'));

    expect(document.querySelectorAll('.ui-data-table__expanded')).toHaveLength(1);
    expect(panelOwner()).toContain('b:1');
    expect(rowFor('b:1').getAttribute('aria-selected')).toBe('true');
    expect(rowFor('a:1').getAttribute('aria-selected')).toBe('false');
  });

  it('closes the panel on Escape, including from a control inside its own contents', async () => {
    const user = userEvent.setup();
    renderScreen([first]);

    await user.click(rowFor('a:1'));
    await user.keyboard('{Escape}');
    expect(expandedRegion()).toBeNull();

    await user.click(rowFor('a:1'));
    // A control of the panel's own contents, the four analysis actions having left it.
    const section = await within(expandedRegion()!).findByRole('button', { name: /Environment/ });
    section.focus();

    await user.keyboard('{Escape}');

    expect(expandedRegion()).toBeNull();
  });

  it('leaves the point of interaction on the list region when Escape closes the panel', async () => {
    const user = userEvent.setup();
    renderScreen([first]);

    await user.click(rowFor('a:1'));
    (await within(expandedRegion()!).findByRole('button', { name: /Environment/ })).focus();

    await user.keyboard('{Escape}');

    expect(document.activeElement).toBe(document.querySelector('.ui-data-table'));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('closes only the row menu on the first Escape, and the panel on the second', async () => {
    const user = userEvent.setup();
    renderScreen([first]);

    await user.click(rowFor('a:1'));
    await openOverflow(user, 'a:1');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(expandedRegion()).not.toBeNull();

    await user.keyboard('{Escape}');

    expect(expandedRegion()).toBeNull();
  });

  it('leaves the panel exactly as it was while the remove confirmation is open', async () => {
    const user = userEvent.setup();
    renderScreen([first]);

    await user.click(rowFor('a:1'));
    const entries = await openOverflow(user, 'a:1');
    await user.click(entries[9]!);
    expect(screen.getByRole('heading', { name: 'Confirm: a:1' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.getByRole('heading', { name: 'Confirm: a:1' })).toBeInTheDocument();
    expect(expandedRegion()).not.toBeNull();
  });

  it('changes nothing on the screen when Escape is pressed with no panel open', async () => {
    const user = userEvent.setup();
    renderScreen([first, second]);
    const search = screen.getByPlaceholderText('Search reference or digest…');
    await user.type(search, 'a:1');

    await user.keyboard('{Escape}');

    expect(search).toHaveValue('a:1');
    expect(tableRows()).toHaveLength(1);
    expect(expandedRegion()).toBeNull();
    expect(document.querySelectorAll('.ui-data-table__row--selected')).toHaveLength(0);
  });
});

// images/specs/images-screen.md — the image's four analyses are views the screen presents: each
// opens from the row's own menu entry with no detail panel open anywhere, on the image whose menu
// opened it, one at a time, and none of them outlives its image
// (panel_actions_to_menu REQ-13, REQ-14, REQ-15, REQ-16, REQ-20).
describe('ImagesScreen — the four analysis views, opened from the row menu (REQ-13, REQ-14, REQ-15, REQ-16, REQ-20)', () => {
  const first = makeImage({ id: 'image-a', shortId: 'aaaaaaaaaaaa', tags: ['a:1'] });
  const second = makeImage({ id: 'image-b', shortId: 'bbbbbbbbbbbb', tags: ['b:1'] });

  /** Every entry of the first group, with the heading its view is titled by. */
  const VIEWS = [
    { entry: 0, label: 'Explore layers…', heading: 'Layer stack — b:1' },
    { entry: 1, label: 'Efficiency & signals…', heading: 'Efficiency & signals — b:1' },
    { entry: 2, label: 'Browse filesystem…', heading: 'Filesystem — b:1' },
    { entry: 3, label: 'Compare with…', heading: 'Compare filesystems' },
  ];

  function expandedRegion(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.ui-data-table__expanded');
  }

  function rowFor(reference: string): HTMLElement {
    const row = tableRows().find((candidate) => candidate.textContent?.includes(reference));
    if (!row) throw new Error(`no row for ${reference}`);
    return row;
  }

  /** The way out every one of the four offers: the dialog's own overlay (`Modal`). */
  async function dismissView(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(document.querySelector<HTMLElement>('.ui-modal-overlay')!);
  }

  it.each(VIEWS)('opens $label on the invoked row\'s image with no panel open, and opens none', async ({ entry, heading }) => {
    const user = userEvent.setup();
    renderScreen([first, second]);

    const entries = await openOverflow(user, 'b:1');
    await user.click(entries[entry]!);

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    // No panel opened behind it, and no row became selected.
    expect(expandedRegion()).toBeNull();
    expect(document.querySelectorAll('.ui-data-table__row--selected')).toHaveLength(0);
  });

  it.each(VIEWS)('leaves the screen with no panel and no selection when $label is closed again', async ({ entry, heading }) => {
    const user = userEvent.setup();
    renderScreen([first, second]);

    const entries = await openOverflow(user, 'b:1');
    await user.click(entries[entry]!);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();

    await dismissView(user);

    await waitFor(() => expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument());
    expect(expandedRegion()).toBeNull();
    expect(document.querySelectorAll('.ui-data-table__row--selected')).toHaveLength(0);
  });

  // REQ-14, REQ-15 — the subject is the row whose menu was used, never the selected image nor the
  // one an open panel is showing, and that panel is exactly as it was left when the view closes.
  it('acts on the invoked row\'s image while a panel is open on another, and leaves that panel untouched', async () => {
    const user = userEvent.setup();
    renderScreen([first, second]);

    await user.click(rowFor('a:1'));
    expect(expandedRegion()).not.toBeNull();

    const entries = await openOverflow(user, 'b:1');
    await user.click(entries[0]!);

    expect(await screen.findByRole('heading', { name: 'Layer stack — b:1' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Layer stack — a:1' })).not.toBeInTheDocument();
    expect(expandedRegion()!.previousElementSibling?.textContent).toContain('a:1');

    await dismissView(user);

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Layer stack — b:1' })).not.toBeInTheDocument());
    expect(expandedRegion()).not.toBeNull();
    expect(expandedRegion()!.previousElementSibling?.textContent).toContain('a:1');
    expect(rowFor('a:1').getAttribute('aria-selected')).toBe('true');
  });

  // REQ-16 — at most one of the four is on screen at a time.
  it('closes whichever of the four was already open when another is chosen', async () => {
    const user = userEvent.setup();
    renderScreen([first, second]);

    await user.click((await openOverflow(user, 'a:1'))[0]!);
    expect(await screen.findByRole('heading', { name: 'Layer stack — a:1' })).toBeInTheDocument();

    await dismissView(user);
    await user.click((await openOverflow(user, 'a:1'))[2]!);

    expect(await screen.findByRole('heading', { name: 'Filesystem — a:1' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Layer stack — a:1' })).not.toBeInTheDocument();
  });

  // REQ-20 — none of the four outlives its image: compared against the unfiltered list, once read.
  it('resolves an open view when its image leaves the list', async () => {
    const user = userEvent.setup();
    const { withImages } = renderScreen([first, second]);

    await user.click((await openOverflow(user, 'a:1'))[0]!);
    expect(await screen.findByRole('heading', { name: 'Layer stack — a:1' })).toBeInTheDocument();

    // Removed from that very menu, pruned, or removed in the operator's own terminal: the live
    // list re-reads without it.
    withImages([second]);

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Layer stack — a:1' })).not.toBeInTheDocument());
  });

  it('keeps an open view when its image is merely hidden by the search', async () => {
    const user = userEvent.setup();
    renderScreen([first, second]);

    await user.click((await openOverflow(user, 'a:1'))[0]!);
    expect(await screen.findByRole('heading', { name: 'Layer stack — a:1' })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search reference or digest…'), 'b:1');

    expect(tableRows()).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Layer stack — a:1' })).toBeInTheDocument();
  });

  // REQ-19, REQ-33 (first half) — the menu hands the focus back to the row's own trigger before the
  // view opens, so the point of interaction is in the images list for the whole life of the view.
  it('leaves the point of interaction on the row\'s own overflow trigger while a view is open', async () => {
    const user = userEvent.setup();
    renderScreen([first, second]);

    await user.click((await openOverflow(user, 'b:1'))[0]!);

    expect(await screen.findByRole('heading', { name: 'Layer stack — b:1' })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions for b:1' }));
  });
});

// images/specs/image-diff-view.md — one comparison view, two shapes of the operation: the row shape
// supplies the first operand alone and states it in words, the bulk shape supplies both, and neither
// leaves its operands behind for a later opening of the other
// (panel_actions_to_menu REQ-23, REQ-24, REQ-27, REQ-35).
describe('ImagesScreen — the comparison serves both shapes (REQ-23, REQ-24, REQ-27, REQ-35)', () => {
  const first = makeImage({ id: 'image-a', shortId: 'aaaaaaaaaaaa', tags: ['a:1'] });
  const second = makeImage({ id: 'image-b', shortId: 'bbbbbbbbbbbb', tags: ['b:1'] });

  async function dismissView(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(document.querySelector<HTMLElement>('.ui-modal-overlay')!);
  }

  it('opens from a row with that image as the first side, stated in words, and the second unchosen', async () => {
    const user = userEvent.setup();
    renderScreen([first, second]);

    await user.click((await openOverflow(user, 'a:1'))[3]!);

    expect(await screen.findByRole('heading', { name: 'Compare filesystems' })).toBeInTheDocument();
    expect(screen.getByLabelText('First image')).toHaveValue('image-a');
    expect(screen.getByLabelText('Second image')).toHaveValue('');
    // Read, not inferred from a pre-filled control: the reference the row shows, in the view.
    expect(screen.getByText(/Started from a:1/)).toBeInTheDocument();
  });

  it('states the first side only while it still is the one the comparison was started from', async () => {
    const user = userEvent.setup();
    renderScreen([first, second]);

    await user.click((await openOverflow(user, 'a:1'))[3]!);
    expect(await screen.findByText(/Started from a:1/)).toBeInTheDocument();

    // Stated, never pinned: the operand stays changeable.
    await user.selectOptions(screen.getByLabelText('First image'), 'image-b');

    expect(screen.getByLabelText('First image')).toHaveValue('image-b');
    expect(screen.queryByText(/Started from/)).not.toBeInTheDocument();
  });

  it('cannot start a comparison of an image with itself', async () => {
    const user = userEvent.setup();
    renderScreen([first, second]);

    await user.click((await openOverflow(user, 'a:1'))[3]!);
    expect(await screen.findByRole('heading', { name: 'Compare filesystems' })).toBeInTheDocument();

    // The second side unchosen: nothing to compare yet.
    expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Second image'), 'image-a');

    expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Second image'), 'image-b');

    expect(screen.getByRole('button', { name: 'Compare' })).toBeEnabled();
  });

  // REQ-35 — both shapes, one after the other, against the one view: neither leaks its operands.
  it('runs both shapes in the same session without either leaving its operands behind', async () => {
    const user = userEvent.setup();
    renderScreen([first, second]);

    // The row shape: one operand, stated.
    await user.click((await openOverflow(user, 'a:1'))[3]!);
    expect(await screen.findByRole('heading', { name: 'Compare filesystems' })).toBeInTheDocument();
    expect(screen.getByLabelText('Second image')).toHaveValue('');
    await dismissView(user);

    // The bulk shape: both operands, and no "started from" line — the view was not started from a row.
    await user.click(within(tableRows()[0]!).getByRole('checkbox'));
    await user.click(within(tableRows()[1]!).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Compare filesystems…' }));

    expect(await screen.findByRole('heading', { name: 'Compare filesystems' })).toBeInTheDocument();
    expect(screen.getByLabelText('First image')).toHaveValue('image-a');
    expect(screen.getByLabelText('Second image')).toHaveValue('image-b');
    expect(screen.queryByText(/Started from/)).not.toBeInTheDocument();
    await dismissView(user);

    // The row shape again: the bulk shape's second operand did not survive into it.
    await user.click((await openOverflow(user, 'b:1'))[3]!);

    expect(await screen.findByRole('heading', { name: 'Compare filesystems' })).toBeInTheDocument();
    expect(screen.getByLabelText('First image')).toHaveValue('image-b');
    expect(screen.getByLabelText('Second image')).toHaveValue('');
    expect(screen.getByText(/Started from b:1/)).toBeInTheDocument();
  });
});

// images-screen.md — the selection never outlives its image, and an image merely hidden by the
// search has not left the list (REQ-28, REQ-29, REQ-30).
describe('ImagesScreen — the selection follows the image, not the search (REQ-28, REQ-29, REQ-30)', () => {
  const first = makeImage({ id: 'image-a', shortId: 'aaaaaaaaaaaa', tags: ['a:1'] });
  const second = makeImage({ id: 'image-b', shortId: 'bbbbbbbbbbbb', tags: ['b:1'] });

  function expandedRegion(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.ui-data-table__expanded');
  }

  function rowFor(reference: string): HTMLElement {
    const row = tableRows().find((candidate) => candidate.textContent?.includes(reference));
    if (!row) throw new Error(`no row for ${reference}`);
    return row;
  }

  it('marks the owning row as the selected one while its panel is open', async () => {
    const user = userEvent.setup();
    renderScreen([first, second]);

    await user.click(rowFor('a:1'));

    expect(rowFor('a:1').className).toContain('ui-data-table__row--selected');
    expect(rowFor('a:1').getAttribute('aria-selected')).toBe('true');
    expect(document.querySelectorAll('.ui-data-table__row--selected')).toHaveLength(1);
  });

  it('takes row, panel and selection away when the image leaves the list, and does not reopen the panel when the same id comes back', async () => {
    const user = userEvent.setup();
    const { withImages } = renderScreen([first, second]);

    await user.click(rowFor('a:1'));
    expect(expandedRegion()).not.toBeNull();

    // Removed from the daemon — by this row's own menu, by a prune, or from the
    // operator's own terminal: the live list re-reads without it.
    withImages([second]);

    await waitFor(() => expect(expandedRegion()).toBeNull());
    expect(screen.queryByText('a:1')).not.toBeInTheDocument();

    // An image id is a digest of its content, so the same content pulled or built
    // again reproduces the id. The panel must not spring open by itself.
    withImages([first, second]);

    await waitFor(() => expect(rowFor('a:1')).toBeInTheDocument());
    expect(expandedRegion()).toBeNull();
    expect(document.querySelectorAll('.ui-data-table__row--selected')).toHaveLength(0);
  });

  it('keeps the selection while the search excludes the image, and brings row and panel back unchanged', async () => {
    const user = userEvent.setup();
    renderScreen([first, second]);

    await user.click(rowFor('a:1'));
    expect(expandedRegion()).not.toBeNull();

    const search = screen.getByPlaceholderText('Search reference or digest…');
    await user.type(search, 'b:1');

    expect(screen.queryByText('a:1')).not.toBeInTheDocument();
    expect(expandedRegion()).toBeNull();

    await user.clear(search);

    expect(expandedRegion()).not.toBeNull();
    expect(expandedRegion()!.previousElementSibling?.textContent).toContain('a:1');
    expect(rowFor('a:1').getAttribute('aria-selected')).toBe('true');
  });
});

// images/specs/images-screen.md — the search field matches any tag, the digest
// or the id, case-insensitively.
describe('ImagesScreen — search (plan-docker_management_app/REQ-41)', () => {
  const images = [
    makeImage({ id: 'sha256:aaaa1111', shortId: 'aaaa1111', tags: ['nginx:1.27'], digest: 'sha256:d1d1d1d1' }),
    makeImage({ id: 'sha256:bbbb2222', shortId: 'bbbb2222', tags: ['redis:7', 'redis:latest'], digest: 'sha256:d2d2d2d2' }),
    makeImage({ id: 'sha256:cccc3333', shortId: 'cccc3333', tags: [], digest: undefined }),
  ];

  function searchField() {
    return screen.getByPlaceholderText('Search reference or digest…');
  }

  it('narrows the list to the images whose reference matches, case-insensitively', async () => {
    const user = userEvent.setup();
    renderScreen(images);

    await user.type(searchField(), 'REDIS');

    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0]!.textContent).toContain('redis:7');
  });

  it('matches a secondary tag of an image, not only its first reference', async () => {
    const user = userEvent.setup();
    renderScreen(images);

    await user.type(searchField(), 'redis:latest');

    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0]!.textContent).toContain('redis:7');
  });

  it('matches by digest', async () => {
    const user = userEvent.setup();
    renderScreen(images);

    await user.type(searchField(), 'd2d2d2d2');

    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0]!.textContent).toContain('redis:7');
  });

  it('matches by id, which is the only handle a dangling image has', async () => {
    const user = userEvent.setup();
    renderScreen(images);

    await user.type(searchField(), 'cccc3333');

    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0]!.textContent).toContain('<none>');
  });

  it('shows the empty state inside the table area when nothing matches', async () => {
    const user = userEvent.setup();
    renderScreen(images);

    await user.type(searchField(), 'no-such-image');

    expect(tableRows()).toHaveLength(0);
    expect(document.querySelector('.ui-data-table__empty')).not.toBeNull();
    expect(screen.getByText('No images match')).toBeInTheDocument();
  });
});

// images/specs/images-screen.md — "Prune dangling" is disabled when no image is
// currently dangling.
describe('ImagesScreen — prune dangling (plan-docker_management_app/REQ-37)', () => {
  it('disables "Prune dangling" when no image is dangling', () => {
    renderScreen([makeImage({ tags: ['nginx:1.27'] })]);

    expect(screen.getByRole('button', { name: 'Prune dangling' })).toBeDisabled();
  });

  it('enables "Prune dangling" when at least one image is dangling', () => {
    renderScreen([makeImage({ id: 'a', tags: ['nginx:1.27'] }), makeImage({ id: 'b', tags: [] })]);

    expect(screen.getByRole('button', { name: 'Prune dangling' })).toBeEnabled();
  });
});

// Stands in for the browser's XMLHttpRequest: useFileUpload's only channel
// for the load/import upload, so the load/import tests below drive it by
// emitting the same events a real upload would (REQ-42, REQ-43).
class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];
  method?: string;
  url?: string;
  status = 0;
  responseText = '';
  sentBody?: unknown;
  aborted = false;
  private listeners = new Map<string, Array<(event: unknown) => void>>();
  upload = {
    listeners: new Map<string, Array<(event: unknown) => void>>(),
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      const existing = this.upload.listeners.get(type) ?? [];
      existing.push(listener);
      this.upload.listeners.set(type, existing);
    },
    emit: (type: string, event: unknown) => {
      for (const listener of this.upload.listeners.get(type) ?? []) listener(event);
    },
  };

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader() {
    // header values are not asserted on here
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  send(body: unknown) {
    this.sentBody = body;
  }

  abort() {
    this.aborted = true;
    this.emit('abort', {});
  }

  emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  respond(status: number, responseText: string) {
    this.status = status;
    this.responseText = responseText;
    this.emit('load', {});
  }
}

function latestUpload(): FakeXMLHttpRequest {
  return FakeXMLHttpRequest.instances[FakeXMLHttpRequest.instances.length - 1]!;
}

function makeTarballFile(name = 'images.tar', sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: 'application/x-tar' });
}

// images-screen.md — a row's `Save` entry, and the BulkActionBar's "Save to
// tarball…" action, immediately trigger a browser download: the browser owns
// the transfer, so no dialog collects a target (REQ-42).
describe('ImagesScreen — save to tarball (plan-docker_management_app/REQ-42)', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let downloadedHrefs: string[];

  beforeEach(() => {
    downloadedHrefs = [];
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadedHrefs.push(this.href);
    });
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  it('downloads a single image\'s tarball from its menu entry, with no dialog opened first', async () => {
    const user = userEvent.setup();
    renderScreen([makeImage({ tags: ['nginx:1.27'] })]);

    const entries = await openOverflow(user);
    await user.click(entries[8]!);

    expect(downloadedHrefs).toHaveLength(1);
    expect(downloadedHrefs[0]).toContain('/api/images/save');
    expect(downloadedHrefs[0]).toContain('references=nginx%3A1.27');
    expect(downloadedHrefs[0]).toContain('filename=nginx%3A1.27.tar');
    expect(screen.getByText('Download started')).toBeInTheDocument();
    expect(screen.getByText('nginx:1.27.tar')).toBeInTheDocument();
    // No form dialog collects a target: the browser owns the download.
    expect(document.querySelector('.ui-modal')).toBeNull();
  });

  it('downloads a combined tarball for every selected image via the bulk action, then clears the selection', async () => {
    const user = userEvent.setup();
    renderScreen([makeImage({ id: 'image-a', tags: ['a:1'] }), makeImage({ id: 'image-b', tags: ['b:1'] })]);

    await user.click(within(tableRows()[0]!).getByRole('checkbox'));
    await user.click(within(tableRows()[1]!).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save to tarball…' }));

    expect(downloadedHrefs[0]).toContain('references=a%3A1');
    expect(downloadedHrefs[0]).toContain('references=b%3A1');
    expect(downloadedHrefs[0]).toContain('filename=2-images.tar');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save to tarball…' })).not.toBeInTheDocument());
  });
});

// images-screen.md — the BulkActionBar's "Compare filesystems…" action is enabled only when exactly
// two images are selected, and opens the diff view with both pre-picked (REQ-63).
describe('ImagesScreen — compare filesystems (plan-docker_management_app/REQ-63)', () => {
  it('keeps "Compare filesystems…" disabled with only one image selected', async () => {
    const user = userEvent.setup();
    renderScreen([makeImage({ id: 'image-a', tags: ['a:1'] }), makeImage({ id: 'image-b', tags: ['b:1'] })]);

    await user.click(within(tableRows()[0]!).getByRole('checkbox'));

    expect(screen.getByRole('button', { name: 'Compare filesystems…' })).toBeDisabled();
  });

  it('enables "Compare filesystems…" with exactly two images selected, opening the diff view pre-picked with both and clearing the selection', async () => {
    const user = userEvent.setup();
    renderScreen([makeImage({ id: 'image-a', tags: ['a:1'] }), makeImage({ id: 'image-b', tags: ['b:1'] })]);

    await user.click(within(tableRows()[0]!).getByRole('checkbox'));
    await user.click(within(tableRows()[1]!).getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Compare filesystems…' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Compare filesystems…' }));

    expect(screen.getByRole('heading', { name: 'Compare filesystems' })).toBeInTheDocument();
    expect(screen.getByLabelText('First image')).toHaveValue('image-a');
    expect(screen.getByLabelText('Second image')).toHaveValue('image-b');
    // The bulk selection is cleared once the diff view takes over.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Compare filesystems…' })).not.toBeInTheDocument());
  });

  it('disables "Compare filesystems…" again once a third image is also selected', async () => {
    const user = userEvent.setup();
    renderScreen([
      makeImage({ id: 'image-a', tags: ['a:1'] }),
      makeImage({ id: 'image-b', tags: ['b:1'] }),
      makeImage({ id: 'image-c', tags: ['c:1'] }),
    ]);

    await user.click(within(tableRows()[0]!).getByRole('checkbox'));
    await user.click(within(tableRows()[1]!).getByRole('checkbox'));
    await user.click(within(tableRows()[2]!).getByRole('checkbox'));

    expect(screen.getByRole('button', { name: 'Compare filesystems…' })).toBeDisabled();
  });
});

// images-screen.md — "Load tarball…" opens a FormDialog with a FilePicker
// (no path field: the operator picks a file from their own machine), then a
// TransferProgressDialog driven by useFileUpload shows byte progress with a
// genuine cancel (REQ-42).
describe('ImagesScreen — load tarball (plan-docker_management_app/REQ-42)', () => {
  beforeEach(() => {
    FakeXMLHttpRequest.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a dialog with a file picker and no path/location field, disabled until a file is chosen', async () => {
    const user = userEvent.setup();
    renderScreen([]);

    await user.click(screen.getByRole('button', { name: 'Load tarball…' }));

    expect(screen.getByRole('heading', { name: 'Load tarball' })).toBeInTheDocument();
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    expect(within(dialog).getByLabelText('Tarball to load')).toBeInTheDocument();
    expect(dialog.querySelector('.ui-path-input')).toBeNull();
    // The operator picks a file from their own machine: no text field for a server-side location.
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Load' })).toBeDisabled();
  });

  it('uploads the chosen file with byte progress, a working cancel, and reports the loaded references once done', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([]);
    const file = makeTarballFile('images.tar', 1000);

    await user.click(screen.getByRole('button', { name: 'Load tarball…' }));
    await user.upload(screen.getByLabelText('Tarball to load'), file);
    await user.click(screen.getByRole('button', { name: 'Load' }));

    expect(latestUpload().method).toBe('POST');
    expect(latestUpload().url).toContain('/api/images/load');
    expect(latestUpload().sentBody).toBe(file);
    // The dialog collecting the file closes once the upload starts.
    expect(screen.queryByRole('heading', { name: 'Load tarball' })).not.toBeInTheDocument();

    act(() => latestUpload().upload.emit('progress', { lengthComputable: true, loaded: 400, total: 1000 }));
    expect(screen.getByText('400B / 1000B')).toBeInTheDocument();
    expect(document.querySelector<HTMLElement>('.ui-progress-bar__fill')?.style.width).toBe('40%');

    // A genuine cancel while the upload runs.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(latestUpload().aborted).toBe(true);
    expect(screen.queryByText(/transferred|%/)).not.toBeInTheDocument();

    // Restart and let it complete.
    await user.click(screen.getByRole('button', { name: 'Load tarball…' }));
    await user.upload(screen.getByLabelText('Tarball to load'), file);
    await user.click(screen.getByRole('button', { name: 'Load' }));
    act(() => latestUpload().respond(200, JSON.stringify({ references: ['myrepo/app:1.0'] })));

    expect(screen.getByText('myrepo/app:1.0')).toBeInTheDocument();
    // The completed state, stated in words by the library on this surface too — and then the dialog
    // stays: it is the only place the loaded references are shown, so it is deliberately not opted
    // into the self-dismissal, and this `Close` is what dismisses it
    // (progress_completion_autoclose/REQ-5, REQ-12).
    expect(document.querySelector('.ui-transfer-progress-dialog__caption')).toHaveTextContent('Completed');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('shows the daemon\'s own failure message when the load is refused', async () => {
    const user = userEvent.setup();
    renderScreen([]);

    await user.click(screen.getByRole('button', { name: 'Load tarball…' }));
    await user.upload(screen.getByLabelText('Tarball to load'), makeTarballFile());
    await user.click(screen.getByRole('button', { name: 'Load' }));
    await act(async () => latestUpload().respond(400, JSON.stringify({ error: 'invalid tar header' })));

    expect(screen.getByText('invalid tar header')).toBeInTheDocument();
  });
});

// images-screen.md — "Import filesystem…" opens a dialog with a FilePicker
// and an optional target reference (a reference, not a host path), then the
// same kind of TransferProgressDialog over the container transfer client's
// import upload (REQ-43).
describe('ImagesScreen — import filesystem (plan-docker_management_app/REQ-43)', () => {
  beforeEach(() => {
    FakeXMLHttpRequest.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a dialog with a file picker, an optional target-reference field and no path field', async () => {
    const user = userEvent.setup();
    renderScreen([]);

    await user.click(screen.getByRole('button', { name: 'Import filesystem…' }));

    expect(screen.getByRole('heading', { name: 'Import filesystem tarball' })).toBeInTheDocument();
    expect(screen.getByLabelText('Filesystem tarball to import')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Target reference (optional)' })).toBeInTheDocument();
    expect(document.querySelector('.ui-path-input')).toBeNull();
  });

  it('uploads the chosen filesystem tarball to the container import endpoint with the target reference, and reports the result', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([]);

    await user.click(screen.getByRole('button', { name: 'Import filesystem…' }));
    await user.upload(screen.getByLabelText('Filesystem tarball to import'), makeTarballFile('rootfs.tar'));
    await user.type(screen.getByRole('textbox', { name: 'Target reference (optional)' }), 'myrepo/imported:v1');
    await user.click(screen.getByRole('button', { name: 'Import' }));

    expect(latestUpload().url).toContain('/api/containers/import');
    expect(latestUpload().url).toContain('targetReference=myrepo%2Fimported%3Av1');

    act(() => latestUpload().respond(200, JSON.stringify({ reference: 'myrepo/imported:v1' })));

    expect(screen.getByText('myrepo/imported:v1')).toBeInTheDocument();
    // Same completed state, and the same deliberate exclusion from the self-dismissal as the load
    // flow above (progress_completion_autoclose/REQ-5, REQ-12).
    expect(document.querySelector('.ui-transfer-progress-dialog__caption')).toHaveTextContent('Completed');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });
});
