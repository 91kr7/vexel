import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../src/ui';
import { FilesystemBrowser } from '../../src/images/FilesystemBrowser';
import type { ImageSummary } from '../../src/data/images-client';
import type { FilesystemEntry } from '../../src/data/image-filesystem-client';

// Stands in for the browser's EventSource: the filesystem extraction stream's
// only channel (REQ-52, REQ-55, REQ-113), so the tests drive it by emitting
// events on the instance FilesystemBrowser opened.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  private listeners = new Map<string, Array<(event: unknown) => void>>();
  closed = false;

  url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: data !== undefined ? JSON.stringify(data) : undefined });
  }
}

function latestSource(): FakeEventSource {
  return FakeEventSource.instances[FakeEventSource.instances.length - 1]!;
}

function makeImage(overrides: Partial<ImageSummary> = {}): ImageSummary {
  return {
    id: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef',
    shortId: '0123456789ab',
    tags: ['nginx:1.27'],
    digest: 'sha256:fedcba9876543210fedcba9876543210fedcba98',
    platforms: ['linux/amd64'],
    sizeBytes: 2048,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let entriesByPath: Record<string, FilesystemEntry[]>;

beforeEach(() => {
  entriesByPath = {
    '': [
      { path: 'bin', name: 'bin', kind: 'directory' },
      { path: 'app.txt', name: 'app.txt', kind: 'file', sizeBytes: 128 },
    ],
    bin: [{ path: 'bin/sh', name: 'sh', kind: 'file', sizeBytes: 64 }],
  };
  // The browser reads its tree from /filesystem/entries and, for a selected entry, its metadata
  // from /filesystem/metadata and — for a file — its preview from /filesystem/content. Each
  // endpoint answers under its own key, so the stub routes on the pathname rather than on `path`.
  fetchMock = vi.fn().mockImplementation((input: string) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.searchParams.get('path') ?? '';
    const body = (): unknown => {
      if (url.pathname.endsWith('/filesystem/metadata')) {
        const entry = Object.values(entriesByPath)
          .flat()
          .find((candidate) => candidate.path === path);
        return { metadata: entry ? { ...entry, permissions: '-rw-r--r--', uid: 0, gid: 0 } : undefined };
      }
      if (url.pathname.endsWith('/filesystem/content')) {
        return {
          result: { path, mode: 'text', autoMode: 'text', content: 'preview', totalSizeBytes: 7, truncated: false },
        };
      }
      return { path, entries: entriesByPath[path] ?? [] };
    };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body()) });
  });
  vi.stubGlobal('fetch', fetchMock);
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * FilesystemBrowser pushes toasts (archive-export failures), so it reads the toast context the way
 * it does in the application, where Shell mounts every screen under a ToastProvider.
 */
function withToast({ children }: { children?: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

/** Completes a full extraction (creating/copying/indexing, then a result) and waits for the root tree level to be loaded. */
async function completeExtraction(fromCache = false) {
  await userEvent.click(screen.getByRole('button', { name: 'Browse filesystem…' }));
  await userEvent.click(screen.getByRole('button', { name: 'Extract' }));
  act(() => latestSource().emit('result', { imageId: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef', entryCount: 2, fromCache }));
  act(() => latestSource().emit('end'));
  await waitFor(() => expect(screen.getByText('bin')).toBeInTheDocument());
}

describe('FilesystemBrowser — before extraction (plan-docker_management_app/REQ-52, plan-docker_management_app/REQ-53)', () => {
  it('shows the not-extracted-yet prompt and performs no fetch while closed', () => {
    render(<FilesystemBrowser image={makeImage()} open={false} onClose={vi.fn()} />, { wrapper: withToast });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('shows the explanatory prompt with a "Browse filesystem…" action', () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });

    expect(screen.getByText('Filesystem not extracted yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse filesystem…' })).toBeInTheDocument();
  });
});

// filesystem-browser.md — "Browse filesystem…" opens a ConfirmDialog naming the image and stating
// the estimated time and temporary disk cost, then starts the extraction stream on confirmation (REQ-55)
describe('FilesystemBrowser — cost warning, progress and cancel (plan-docker_management_app/REQ-55)', () => {
  it('opens a cost-warning dialog naming the image before starting extraction, and starts nothing on cancel', async () => {
    const image = makeImage({ tags: ['nginx:1.27'] });
    render(<FilesystemBrowser image={image} open onClose={vi.fn()} />, { wrapper: withToast });

    await userEvent.click(screen.getByRole('button', { name: 'Browse filesystem…' }));

    const dialogHeading = screen.getByRole('heading', { name: 'Confirm: nginx:1.27' });
    const dialog = dialogHeading.closest<HTMLElement>('.ui-modal')!;
    // REQ-55 — both the estimated time and the temporary disk cost are stated before starting.
    expect(within(dialog).getByText(/taking roughly \d+s/)).toBeInTheDocument();
    expect(within(dialog).getByText(/copies out about/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('heading', { name: 'Confirm: nginx:1.27' })).not.toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('starts the extraction stream on confirm and shows a cancellable progress dialog', async () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });

    await userEvent.click(screen.getByRole('button', { name: 'Browse filesystem…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Extract' }));

    expect(screen.getByRole('heading', { name: 'Extracting the filesystem' })).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  // filesystem-browser.md — Cancel discards the run (the container is still removed server-side)
  // and returns to the "not extracted yet" prompt
  it('cancelling the progress dialog while active stops the extraction stream and returns to "not extracted yet"', async () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });
    await userEvent.click(screen.getByRole('button', { name: 'Browse filesystem…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Extract' }));
    const source = latestSource();
    act(() => latestSource().emit('progress', { phase: 'copying' }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(source.closed).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Extracting the filesystem' })).not.toBeInTheDocument();
    expect(screen.getByText('Filesystem not extracted yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse filesystem…' })).toBeInTheDocument();
  });

  // filesystem-browser.md — Close, once failed, clears the run so extraction can be retried
  it('re-offers extraction after closing the dialog on failure', async () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });
    await userEvent.click(screen.getByRole('button', { name: 'Browse filesystem…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Extract' }));

    act(() => latestSource().emit('error', { message: 'no command specified' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('heading', { name: 'Extracting the filesystem' })).not.toBeInTheDocument();
    expect(screen.getByText('Filesystem not extracted yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse filesystem…' })).toBeInTheDocument();
  });
});

// filesystem-browser.md — after extraction, a SplitPane shows the tree lazily expanded and the
// selected entry's details; the cache-source header names the data's origin
describe('FilesystemBrowser — browsing the extracted tree (plan-docker_management_app/REQ-52, plan-docker_management_app/REQ-113)', () => {
  it('shows the cache-source header and the root tree once extraction completes', async () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });

    await completeExtraction(false);

    expect(screen.getByText(/Freshly extracted/)).toBeInTheDocument();
    expect(screen.getByText(/2 entries/)).toBeInTheDocument();
    expect(screen.getByText('app.txt')).toBeInTheDocument();
  });

  // filesystem-browser.md — once extraction completes, a disclosure names the daemon's own
  // container-creation scaffolding included in the tree, so it is not misread as image content.
  it('discloses that the tree includes Docker\'s own container-creation scaffolding', async () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });

    await completeExtraction();

    expect(screen.getByText(/container-creation scaffolding/)).toBeInTheDocument();
    expect(screen.getByText(/\.dockerenv/)).toBeInTheDocument();
  });

  it('names the data as coming from the cache when the result says so', async () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });

    await completeExtraction(true);

    expect(screen.getByText(/From cache/)).toBeInTheDocument();
  });

  it("loads a directory's children the first time it is expanded, and does not re-fetch on a second expansion", async () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });
    await completeExtraction();
    const fetchCountAfterExtraction = fetchMock.mock.calls.length;

    await userEvent.click(document.querySelector('.ui-tree-view__caret--expandable')!);
    await waitFor(() => expect(screen.getByText('sh')).toBeInTheDocument());
    const fetchCountAfterFirstExpand = fetchMock.mock.calls.length;
    expect(fetchCountAfterFirstExpand).toBeGreaterThan(fetchCountAfterExtraction);

    // Collapse, then re-expand: the cached level must not be fetched again.
    await userEvent.click(document.querySelector('.ui-tree-view__caret--expandable')!);
    expect(screen.queryByText('sh')).not.toBeInTheDocument();
    await userEvent.click(document.querySelector('.ui-tree-view__caret--expandable')!);
    expect(screen.getByText('sh')).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(fetchCountAfterFirstExpand);
  });

  it("shows a selected entry's path, type and size in the right-hand pane", async () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });
    await completeExtraction();

    await userEvent.click(screen.getByText('app.txt'));

    expect(screen.getByText('/app.txt')).toBeInTheDocument();
    expect(screen.getByText('file')).toBeInTheDocument();
  });

  // filesystem-browser.md — a re-extraction resets every loaded tree level, expansion state and
  // selection before the new stream starts
  it('resets the tree and selection when re-extracting', async () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });
    await completeExtraction();
    await userEvent.click(screen.getByText('app.txt'));
    expect(screen.getByText('/app.txt')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Re-extract…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Extract' }));

    // The previous result must be gone until the new stream delivers its own.
    expect(screen.queryByText('app.txt')).not.toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(latestSource().url).toContain('force=true');
  });
});
