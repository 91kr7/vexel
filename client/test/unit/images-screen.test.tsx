import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImagesScreen } from '../../src/images/ImagesScreen';
import type { ImageSummary } from '../../src/data/images-client';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
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

  constructor(public url: string) {}

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

function renderScreen(images: ImageSummary[], onRefresh = vi.fn()) {
  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <ImagesScreen images={images} loaded onRefresh={onRefresh} />
            <ReportedErrors />
          </ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );
  return { onRefresh };
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

// images/specs/images-screen.md — the six per-image actions on every row,
// always visible, without expanding it (REQ-42 added "save" as the fifth).
describe('ImagesScreen — per-row actions (plan-docker_management_app/REQ-37, plan-docker_management_app/REQ-42)', () => {
  function rowActionLabels(row: HTMLElement): string[] {
    return within(row)
      .getAllByRole('button')
      .map((button) => button.textContent?.trim() ?? '');
  }

  it('shows run, tag, untag, push, save and remove on the row without expanding it', () => {
    renderScreen([makeImage()]);

    expect(rowActionLabels(tableRows()[0]!)).toEqual(['run', 'tag', 'untag', 'push', 'save', 'remove']);
  });

  it('carries the same six actions in the same order on every row', () => {
    renderScreen([
      makeImage({ id: 'image-a', tags: ['a:1'] }),
      makeImage({ id: 'image-b', tags: [] }),
      makeImage({ id: 'image-c', tags: ['c:1', 'c:2', 'c:3'] }),
    ]);

    for (const row of tableRows()) {
      expect(rowActionLabels(row)).toEqual(['run', 'tag', 'untag', 'push', 'save', 'remove']);
    }
  });

  it('disables untag and push for a dangling image, leaving tag and remove available', () => {
    renderScreen([makeImage({ tags: [] })]);

    const row = tableRows()[0]!;
    expect(within(row).getByRole('button', { name: 'untag' })).toBeDisabled();
    expect(within(row).getByRole('button', { name: 'push' })).toBeDisabled();
    expect(within(row).getByRole('button', { name: 'tag' })).toBeEnabled();
    expect(within(row).getByRole('button', { name: 'remove' })).toBeEnabled();
  });

  it('untags a single-tag image straight away, without a dialog and without a confirmation, then re-reads the list', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeImage({ tags: ['solo:1'] })]);

    await user.click(within(tableRows()[0]!).getByRole('button', { name: 'untag' }));

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

    await user.click(within(tableRows()[0]!).getByRole('button', { name: 'untag' }));

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

    await user.click(within(tableRows()[0]!).getByRole('button', { name: 'remove' }));

    expect(screen.getByRole('heading', { name: 'Confirm: nginx:1.27' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('removes the image and re-reads the list once confirmed', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderScreen([makeImage({ id: 'image-1', tags: ['nginx:1.27'] })]);

    await user.click(within(tableRows()[0]!).getByRole('button', { name: 'remove' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/images/image-1');
    expect(init.method).toBe('DELETE');
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('opens the tag dialog from the row action and reports the daemon error when tagging fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({ error: 'reference already exists' }) });
    renderScreen([makeImage({ tags: ['nginx:1.27'] })]);

    await user.click(within(tableRows()[0]!).getByRole('button', { name: 'tag' }));
    const field = screen.getByRole('textbox', { name: 'New reference' });
    await user.clear(field);
    await user.type(field, 'nginx:copy');
    await user.click(screen.getByRole('button', { name: 'Tag' }));

    expect(await screen.findByText(/reference already exists/)).toBeInTheDocument();
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

  it('keeps the row actions out of the expanded region, which carries the detail panel alone', async () => {
    const user = userEvent.setup();
    renderScreen([makeImage({ tags: ['nginx:1.27'] })]);

    await user.click(tableRows()[0]!);

    const expanded = document.querySelector<HTMLElement>('.ui-data-table__expanded')!;
    for (const label of ['tag', 'untag', 'push', 'remove']) {
      expect(within(expanded).queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
    expect(expanded.querySelector('.ui-detail-panel')).not.toBeNull();
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

// images-screen.md — a row's "save" action, and the BulkActionBar's "Save to
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

  it('downloads a single image\'s tarball via the row action, with no dialog opened first', async () => {
    const user = userEvent.setup();
    renderScreen([makeImage({ tags: ['nginx:1.27'] })]);

    await user.click(within(tableRows()[0]!).getByRole('button', { name: 'save' }));

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
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });
});
