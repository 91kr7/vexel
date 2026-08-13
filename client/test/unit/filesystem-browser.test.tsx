import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../src/ui';
import { FilesystemBrowser } from '../../src/images/FilesystemBrowser';
import type { ImageSummary } from '../../src/data/images-client';
import type { FilesystemEntry, FilesystemExtractionResult } from '../../src/data/image-filesystem-client';

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

const IMAGE_ID = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef';

function makeImage(overrides: Partial<ImageSummary> = {}): ImageSummary {
  return {
    id: IMAGE_ID,
    shortId: '0123456789ab',
    tags: ['nginx:1.27'],
    digest: 'sha256:fedcba9876543210fedcba9876543210fedcba98',
    platforms: ['linux/amd64'],
    sizeBytes: 2048,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** The "is a result kept for this image's content?" answer the browser decides its shape on. */
type KeptAnswer = { kept: false } | { kept: true; summary: FilesystemExtractionResult };

function keptSummary(overrides: Partial<FilesystemExtractionResult> = {}): KeptAnswer {
  return { kept: true, summary: { imageId: IMAGE_ID, entryCount: 2, fromCache: true, refusedCount: 0, ...overrides } };
}

let fetchMock: ReturnType<typeof vi.fn>;
let entriesByPath: Record<string, FilesystemEntry[]>;
let keptAnswer: KeptAnswer;
/** Set by the one test that needs the shape still undecided while it asserts. */
let deferKept: { promise: Promise<void>; resolve: () => void } | undefined;
/** Set by the REQ-14 test: the kept result is gone by the time the tree is read. */
let entriesFail: string | undefined;

beforeEach(() => {
  keptAnswer = { kept: false };
  deferKept = undefined;
  entriesFail = undefined;
  entriesByPath = {
    '': [
      { path: 'bin', name: 'bin', kind: 'directory' },
      { path: 'app.txt', name: 'app.txt', kind: 'file', sizeBytes: 128 },
    ],
    bin: [{ path: 'bin/sh', name: 'sh', kind: 'file', sizeBytes: 64 }],
  };
  // The browser asks first whether a result is kept for this image's content, then reads its tree
  // from /filesystem/entries and, for a selected entry, its metadata from /filesystem/metadata and
  // — for a file — its preview from /filesystem/content. Each endpoint answers under its own key,
  // so the stub routes on the pathname rather than on `path`.
  fetchMock = vi.fn().mockImplementation(async (input: string) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.searchParams.get('path') ?? '';
    if (url.pathname.endsWith('/filesystem/kept')) {
      if (deferKept) await deferKept.promise;
      return { ok: true, status: 200, json: () => Promise.resolve(keptAnswer) };
    }
    if (url.pathname.endsWith('/filesystem/entries') && entriesFail) {
      return { ok: false, status: 404, json: () => Promise.resolve({ error: entriesFail }) };
    }
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
    return { ok: true, status: 200, json: () => Promise.resolve(body()) };
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

/** The surface the browser itself is, as opposed to the dialogs it raises inside it. */
function browserSurface(): HTMLElement {
  return screen.getByRole('heading', { name: /^Filesystem — / }).closest<HTMLElement>('.ui-modal')!;
}

/** Completes a full extraction from shape A (the warning is already up) and waits for the root tree level. */
async function completeExtraction() {
  await userEvent.click(await screen.findByRole('button', { name: 'Extract' }));
  act(() => latestSource().emit('result', { imageId: IMAGE_ID, entryCount: 2, fromCache: false, refusedCount: 0 }));
  act(() => latestSource().emit('end'));
  await waitFor(() => expect(screen.getByText('bin')).toBeInTheDocument());
}

// filesystem-browser.md — the entry has two shapes, decided before anything is raised: with nothing
// kept for this image's content the cost warning is the first thing on screen, and the removed
// empty state exists nowhere at all
// (plan-docker_management_app-filesystem_browse_direct/REQ-1, REQ-2, REQ-6)
describe('FilesystemBrowser — shape A, nothing kept for this image content (REQ-1, REQ-2, REQ-6)', () => {
  it('performs no read at all while closed', () => {
    render(<FilesystemBrowser image={makeImage()} open={false} onClose={vi.fn()} />, { wrapper: withToast });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('raises the cost warning immediately, naming the image and stating both the size and the estimate', async () => {
    render(<FilesystemBrowser image={makeImage({ tags: ['nginx:1.27'] })} open onClose={vi.fn()} />, { wrapper: withToast });

    const dialogHeading = await screen.findByRole('heading', { name: 'Confirm: nginx:1.27' });
    const dialog = dialogHeading.closest<HTMLElement>('.ui-modal')!;
    // REQ-2 — the delivered wording, its numbers and its estimate, unchanged.
    expect(within(dialog).getByText(/taking roughly \d+s/)).toBeInTheDocument();
    expect(within(dialog).getByText(/copies out about/)).toBeInTheDocument();
    // Nothing was started to find that out (REQ-16).
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  // REQ-1 — asserted from the very first render onwards, never only at the end: the removed screen
  // is not hidden, not relabelled and not made conditional, so there is no moment of this flow at
  // which it is on screen.
  it('has removed the not-extracted empty state from the product entirely', async () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });

    expect(screen.queryByText('Filesystem not extracted yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Browse filesystem…' })).not.toBeInTheDocument();

    await screen.findByRole('heading', { name: 'Confirm: nginx:1.27' });

    expect(screen.queryByText('Filesystem not extracted yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Browse filesystem…' })).not.toBeInTheDocument();
  });

  // REQ-6 — while the shape is being decided the operator is asked for nothing: a plain loading
  // indication carrying the image's identity, and nothing actionable anywhere behind it.
  it('shows an actionless loading indication naming the image while the shape is still being decided', async () => {
    let release = () => {};
    deferKept = { promise: new Promise<void>((resolve) => (release = resolve)), resolve: () => release() };
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });

    const surface = browserSurface();
    expect(within(surface).getByRole('status', { name: /nginx:1\.27/ })).toBeInTheDocument();
    expect(within(surface).queryAllByRole('button')).toHaveLength(0);
    expect(within(surface).queryByRole('heading', { name: /not extracted/i })).not.toBeInTheDocument();

    deferKept.resolve();
    await screen.findByRole('heading', { name: 'Confirm: nginx:1.27' });
  });

  // REQ-21 — the removed screen held the control a keyboard operator landed on; the cost warning is
  // what receives them now, and it receives them properly.
  it('puts the keyboard on the cost warning itself', async () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });
    const dialogHeading = await screen.findByRole('heading', { name: 'Confirm: nginx:1.27' });
    const dialog = dialogHeading.closest<HTMLElement>('.ui-modal')!;

    await userEvent.tab();

    expect(document.activeElement).not.toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});

// filesystem-browser.md — confirming runs the extraction exactly as delivered, and the two ways out
// of shape A leave the operator on the images list rather than in a half-opened surface
// (filesystem_browse_direct/REQ-3, REQ-7, REQ-8, REQ-9; plan-docker_management_app/REQ-55)
describe('FilesystemBrowser — confirming, declining, cancelling and failing (REQ-3, REQ-7, REQ-8, REQ-9)', () => {
  it('starts the extraction stream on confirm and shows a cancellable progress dialog', async () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });

    await userEvent.click(await screen.findByRole('button', { name: 'Extract' }));

    expect(screen.getByRole('heading', { name: 'Extracting the filesystem' })).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  // filesystem-browser.md — the extraction dialog is one of the four opted into the shared surface's
  // self-dismissal: it states its completion and then goes on its own, leaving the extracted tree
  // as what the operator's next look lands on
  // (progress_completion_autoclose/REQ-1, REQ-6, REQ-13)
  it('states the completion and then dismisses the progress dialog by itself, leaving the tree browsable', async () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });
    await userEvent.click(await screen.findByRole('button', { name: 'Extract' }));

    act(() => latestSource().emit('result', { imageId: IMAGE_ID, entryCount: 2, fromCache: false, refusedCount: 0 }));
    act(() => latestSource().emit('end'));

    // Read by its class: the completion is also exposed as a status message, so the word is in the
    // dialog twice on purpose.
    await waitFor(() => expect(document.querySelector('.ui-transfer-progress-dialog__caption')).toHaveTextContent('Completed'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Extracting the filesystem' })).not.toBeInTheDocument(), {
      timeout: 3000,
    });
    await waitFor(() => expect(screen.getByText('bin')).toBeInTheDocument());
  });

  // REQ-7 — declining leaves nothing open and nothing extracted: the surface goes with the warning,
  // there is no half-opened filesystem left to dismiss, and no stream was ever opened.
  it('closes the whole surface when the cost warning is declined, having started nothing', async () => {
    const onClose = vi.fn();
    render(<FilesystemBrowser image={makeImage()} open onClose={onClose} />, { wrapper: withToast });
    await screen.findByRole('heading', { name: 'Confirm: nginx:1.27' });

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: 'Confirm: nginx:1.27' })).not.toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  // REQ-8 — cancelling a running extraction stops it and returns the operator to the images list,
  // never to a surface offering to start it again.
  it('closes the whole surface when a running extraction is cancelled, stopping the stream', async () => {
    const onClose = vi.fn();
    render(<FilesystemBrowser image={makeImage()} open onClose={onClose} />, { wrapper: withToast });
    await userEvent.click(await screen.findByRole('button', { name: 'Extract' }));
    const source = latestSource();
    act(() => latestSource().emit('progress', { phase: 'copying' }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(source.closed).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: 'Extracting the filesystem' })).not.toBeInTheDocument();
    expect(screen.queryByText('Filesystem not extracted yet')).not.toBeInTheDocument();
  });

  // REQ-9 — a failed extraction states its cause and waits: it is not auto-dismissed (bug-1's rule,
  // unchanged), it names what went wrong, and the retry is offered inside the failure report.
  it('reports a failed extraction with its cause, does not dismiss itself, and offers the retry inside the report', async () => {
    const onClose = vi.fn();
    render(<FilesystemBrowser image={makeImage()} open onClose={onClose} />, { wrapper: withToast });
    await userEvent.click(await screen.findByRole('button', { name: 'Extract' }));

    act(() => latestSource().emit('error', { message: 'no command specified' }));

    await waitFor(() => expect(screen.getByText('no command specified')).toBeInTheDocument());
    // Well past the second a completed dialog would have taken to leave: a failure waits.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(screen.getByRole('heading', { name: 'Extracting the filesystem' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    const report = screen.getByRole('heading', { name: 'Extracting the filesystem' }).closest<HTMLElement>('.ui-modal')!;
    await userEvent.click(within(report).getByRole('button', { name: 'Retry' }));

    // The retry re-offers the extraction with its cost, never starts one behind the operator's back
    // (REQ-18): the warning is back, and no second stream was opened by the press itself.
    expect(await screen.findByRole('heading', { name: 'Confirm: nginx:1.27' })).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  // REQ-9 — dismissing the failure report leaves the operator on the images list, not in an empty
  // surface.
  it('closes the whole surface when the failure report is dismissed', async () => {
    const onClose = vi.fn();
    render(<FilesystemBrowser image={makeImage()} open onClose={onClose} />, { wrapper: withToast });
    await userEvent.click(await screen.findByRole('button', { name: 'Extract' }));

    act(() => latestSource().emit('error', { message: 'no command specified' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Filesystem not extracted yet')).not.toBeInTheDocument();
  });
});

// filesystem-browser.md — shape B, an image whose extraction is still kept: the tree opens
// directly, with no warning about a cost that will not be paid and no progress dialog for an
// operation that never runs (filesystem_browse_direct/REQ-4, REQ-5, REQ-14, REQ-15, REQ-21)
describe('FilesystemBrowser — shape B, a kept result (REQ-4, REQ-5, REQ-14, REQ-15, REQ-21)', () => {
  it('opens straight into the tree, raising neither the cost warning nor a progress dialog, and starting nothing', async () => {
    keptAnswer = keptSummary({ entryCount: 2 });
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });

    await waitFor(() => expect(screen.getByText('app.txt')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Confirm: nginx:1.27' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Extracting the filesystem' })).not.toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  // REQ-4, REQ-20 — the reuse claim itself: the surface states it is showing a reused result, with
  // its entry count, which is why the read answers with a summary rather than a boolean.
  it('marks the tree as a reused result with its entry count', async () => {
    keptAnswer = keptSummary({ entryCount: 7 });
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });

    expect(await screen.findByText(/From cache/)).toBeInTheDocument();
    expect(screen.getByText(/7 entries/)).toBeInTheDocument();
    expect(screen.queryByText(/Freshly extracted/)).not.toBeInTheDocument();
  });

  it('reports the refused entries the kept result carries', async () => {
    keptAnswer = keptSummary({ refusedCount: 2 });
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });

    expect(await screen.findByText(/2 entries were refused because/)).toBeInTheDocument();
  });

  // REQ-21 — the direct-to-tree case leaves the point of interaction somewhere real inside the
  // surface, never on a control that no longer exists.
  it('leaves the keyboard on a real control inside the surface', async () => {
    keptAnswer = keptSummary();
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });
    await waitFor(() => expect(screen.getByText('app.txt')).toBeInTheDocument());

    await userEvent.tab();

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement!.isConnected).toBe(true);
    expect(browserSurface().contains(document.activeElement)).toBe(true);
  });

  // REQ-14 — kept results are operator-clearable, so "already extracted" can stop being true
  // between the moment it is decided and the moment the result is read. The flow then degrades to
  // the cost warning, never to a dead end.
  it('falls back to the cost warning when the kept result has vanished by the time the tree is read', async () => {
    keptAnswer = keptSummary();
    entriesFail = "This image's filesystem has not been extracted yet.";
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });

    expect(await screen.findByRole('heading', { name: 'Confirm: nginx:1.27' })).toBeInTheDocument();
    expect(screen.queryByText(/From cache/)).not.toBeInTheDocument();
    // Still an offer with its cost, and still nothing started behind it.
    expect(screen.getByText(/taking roughly \d+s/)).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});

// filesystem-browser.md — after extraction, a SplitPane shows the tree lazily expanded and the
// selected entry's details; the cache-source header names the data's origin
describe('FilesystemBrowser — browsing the extracted tree (plan-docker_management_app/REQ-52, plan-docker_management_app/REQ-113)', () => {
  it('shows the cache-source header and the root tree once extraction completes', async () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });

    await completeExtraction();

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
  // selection before the new stream starts; it keeps its cost warning always, being the one path
  // that deliberately discards a kept result and pays the full cost (REQ-10).
  it('warns again and resets the tree and selection when re-extracting', async () => {
    render(<FilesystemBrowser image={makeImage()} open onClose={vi.fn()} />, { wrapper: withToast });
    await completeExtraction();
    await userEvent.click(screen.getByText('app.txt'));
    expect(screen.getByText('/app.txt')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Re-extract…' }));
    expect(screen.getByText(/taking roughly \d+s/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Extract' }));

    // The previous result must be gone until the new stream delivers its own.
    expect(screen.queryByText('app.txt')).not.toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(latestSource().url).toContain('force=true');
  });

  // REQ-10, REQ-11 — declining a re-extraction falls back to the tree it was asked from: what is
  // removed is the fall-back to a prompt with nothing behind it, and here there is something behind
  // it.
  it('keeps the reused tree on screen when a re-extraction is declined', async () => {
    keptAnswer = keptSummary();
    const onClose = vi.fn();
    render(<FilesystemBrowser image={makeImage()} open onClose={onClose} />, { wrapper: withToast });
    await waitFor(() => expect(screen.getByText('app.txt')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Re-extract…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/From cache/)).toBeInTheDocument();
    expect(screen.getByText('app.txt')).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
