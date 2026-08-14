import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageDiffView } from '../../src/images/ImageDiffView';
import type { ImageSummary } from '../../src/data/images-client';

// Stands in for the browser's EventSource: the diff comparison stream's only
// channel (REQ-63, REQ-64), so the tests drive it by emitting events on the
// instance the view opened.
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

const IMAGE_A: ImageSummary = {
  id: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  shortId: 'aaaaaaaaaaaa',
  tags: ['app:v1'],
  digest: 'sha256:digest-a',
  platforms: ['linux/amd64'],
  sizeBytes: 1024,
  createdAt: new Date().toISOString(),
};
const IMAGE_B: ImageSummary = {
  id: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  shortId: 'bbbbbbbbbbbb',
  tags: ['app:v2'],
  digest: 'sha256:digest-b',
  platforms: ['linux/amd64'],
  sizeBytes: 2048,
  createdAt: new Date().toISOString(),
};

const DIFF_RESULT = { imageIdA: IMAGE_A.id, imageIdB: IMAGE_B.id, entries: [], addedCount: 1, removedCount: 2, changedCount: 3 };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation((url: string) => {
    const href = String(url);
    if (href.includes('/diff/entries') && !href.includes('path=')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            path: '',
            entries: [
              {
                path: 'changed.txt',
                name: 'changed.txt',
                kind: 'file',
                status: 'changed',
                natures: ['content'],
                a: { sizeBytes: 10, mode: 0o644, uid: 0, gid: 0 },
                b: { sizeBytes: 12, mode: 0o644, uid: 0, gid: 0 },
              },
            ],
          }),
      });
    }
    if (href.includes(`${encodeURIComponent(IMAGE_A.id)}/filesystem/content`)) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ result: { path: 'changed.txt', mode: 'text', autoMode: 'text', content: 'left body', totalSizeBytes: 10, truncated: false } }),
      });
    }
    if (href.includes(`${encodeURIComponent(IMAGE_B.id)}/filesystem/content`)) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ result: { path: 'changed.txt', mode: 'text', autoMode: 'text', content: 'right body', totalSizeBytes: 12, truncated: false } }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });
  vi.stubGlobal('fetch', fetchMock);
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Picks both sides through the two Selects, mirroring an operator choosing them by hand. */
async function pickBothImages() {
  await userEvent.selectOptions(screen.getByLabelText('First image'), IMAGE_A.id);
  await userEvent.selectOptions(screen.getByLabelText('Second image'), IMAGE_B.id);
}

/**
 * Confirms the cost-warning dialog. Its own confirm button carries the same
 * "Compare" label as the toolbar action that opened it, so the click is
 * scoped to the dialog itself rather than to `getByRole` across the whole
 * document (which would otherwise match both buttons ambiguously).
 */
async function confirmComparison() {
  const dialogHeading = screen.getByRole('heading', { name: 'Confirm: app:v1 vs app:v2' });
  const dialog = dialogHeading.closest<HTMLElement>('.ui-modal')!;
  await userEvent.click(within(dialog).getByRole('button', { name: 'Compare' }));
}

describe('ImageDiffView — picking images (plan-docker_management_app/REQ-63)', () => {
  // image-diff-view.md — "Compare" opens the cost-warning dialog only once both sides are picked and distinct
  it('keeps "Compare" disabled until two distinct images are picked', async () => {
    render(<ImageDiffView images={[IMAGE_A, IMAGE_B]} open onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText('First image'), IMAGE_A.id);
    expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled();

    await pickBothImages();
    expect(screen.getByRole('button', { name: 'Compare' })).toBeEnabled();
  });

  // image-diff-view.md — before any comparison, an EmptyState invites the operator to pick two images
  it('shows the "no comparison yet" empty state before any comparison has run', () => {
    render(<ImageDiffView images={[IMAGE_A, IMAGE_B]} open onClose={vi.fn()} />);

    expect(screen.getByText('No comparison yet')).toBeInTheDocument();
  });
});

describe('ImageDiffView — cost warning, progress and cancel (plan-docker_management_app/REQ-63)', () => {
  // image-diff-view.md — "Compare" opens a ConfirmDialog naming both images; cancelling starts no comparison
  it('opens a cost-warning dialog naming both images, and starts nothing on cancel', async () => {
    render(<ImageDiffView images={[IMAGE_A, IMAGE_B]} open onClose={vi.fn()} />);
    await pickBothImages();

    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));

    const dialogHeading = screen.getByRole('heading', { name: 'Confirm: app:v1 vs app:v2' });
    expect(dialogHeading).toBeInTheDocument();
    const dialog = dialogHeading.closest<HTMLElement>('.ui-modal')!;
    expect(within(dialog).getByText(/extracts either image not already browsed/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('heading', { name: 'Confirm: app:v1 vs app:v2' })).not.toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  // image-diff-view.md — confirming starts the comparison stream, showing a cancellable progress dialog
  it('starts the comparison stream on confirm and shows a cancellable progress dialog', async () => {
    render(<ImageDiffView images={[IMAGE_A, IMAGE_B]} open onClose={vi.fn()} />);
    await pickBothImages();
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));

    await confirmComparison();

    expect(screen.getByRole('heading', { name: 'Comparing filesystems' })).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  // image-diff-view.md — Cancel discards the run and returns to the picker, with no diff tree shown
  it('cancelling the progress dialog discards the run and returns to the picker', async () => {
    render(<ImageDiffView images={[IMAGE_A, IMAGE_B]} open onClose={vi.fn()} />);
    await pickBothImages();
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));
    await confirmComparison();
    const source = latestSource();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(source.closed).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Comparing filesystems' })).not.toBeInTheDocument();
    expect(screen.getByText('No comparison yet')).toBeInTheDocument();
  });
});

describe('ImageDiffView — diff tree and detail pane (plan-docker_management_app/REQ-63, plan-docker_management_app/REQ-64)', () => {
  async function runComparisonToResult() {
    render(<ImageDiffView images={[IMAGE_A, IMAGE_B]} open onClose={vi.fn()} />);
    await pickBothImages();
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));
    await confirmComparison();
    act(() => latestSource().emit('result', DIFF_RESULT));
    act(() => latestSource().emit('end'));
    await waitFor(() => expect(screen.getByText('changed.txt')).toBeInTheDocument());
  }

  // image-diff-view.md — once a comparison has run, a StatusPill summarises the added/removed/changed counts
  it('shows the added/removed/changed counts once the comparison ends', async () => {
    await runComparisonToResult();

    expect(screen.getByText('1 added · 2 removed · 3 changed')).toBeInTheDocument();
  });

  // image-diff-view.md — selecting a changed path shows its changed aspects, both sides' metadata, and a side-by-side content preview
  it("selecting a changed path shows its nature badge, both sides' metadata and a side-by-side preview", async () => {
    await runComparisonToResult();

    await userEvent.click(screen.getByText('changed.txt'));

    expect(await screen.findByText('Content')).toBeInTheDocument();
    // Both sides' own labels, distinct from the identically-named <option> in the picker's Selects.
    const headers = Array.from(document.querySelectorAll('.ui-side-by-side-viewer__header')).map((el) => el.textContent);
    expect(headers).toEqual(['app:v1', 'app:v2']);
    await waitFor(() => expect(screen.getByText('left body')).toBeInTheDocument());
    expect(screen.getByText('right body')).toBeInTheDocument();
  });

  // image-diff-view.md — once succeeded, the dialog states its completion and dismisses itself: the
  // diff tree behind it stays browsable (progress_completion_autoclose/REQ-1, REQ-6, REQ-13, REQ-24)
  it('states the completion, dismisses itself and leaves the diff tree browsable', async () => {
    await runComparisonToResult();

    await waitFor(() => expect(document.querySelector('.ui-transfer-progress-dialog__caption')).toHaveTextContent('Completed'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Comparing filesystems' })).not.toBeInTheDocument(), {
      timeout: 3000,
    });

    expect(screen.getByText('changed.txt')).toBeInTheDocument();
  });

  // image-diff-view.md — Close, once failed, clears the run so a fresh comparison can be started
  it('clears the run after closing the dialog on failure, offering "Compare" again', async () => {
    render(<ImageDiffView images={[IMAGE_A, IMAGE_B]} open onClose={vi.fn()} />);
    await pickBothImages();
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));
    await confirmComparison();

    act(() => latestSource().emit('error', { message: 'comparison failed' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('heading', { name: 'Comparing filesystems' })).not.toBeInTheDocument();
    expect(screen.getByText('No comparison yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare' })).toBeInTheDocument();
  });
});

describe('ImageDiffView — reopening (plan-docker_management_app/REQ-63)', () => {
  // image-diff-view.md — reopening the view (a fresh open) always resets the picked images and the tree, so a stale comparison from a previous pair is never shown
  it('resets the picked images and the tree state when reopened', async () => {
    const { rerender } = render(<ImageDiffView images={[IMAGE_A, IMAGE_B]} open onClose={vi.fn()} />);
    await pickBothImages();
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));
    await confirmComparison();
    act(() => latestSource().emit('result', DIFF_RESULT));
    act(() => latestSource().emit('end'));
    await waitFor(() => expect(screen.getByText('changed.txt')).toBeInTheDocument());

    rerender(<ImageDiffView images={[IMAGE_A, IMAGE_B]} open={false} onClose={vi.fn()} />);
    rerender(<ImageDiffView images={[IMAGE_A, IMAGE_B]} open onClose={vi.fn()} />);

    expect(screen.getByText('No comparison yet')).toBeInTheDocument();
    expect(screen.getByLabelText('First image')).toHaveValue('');
    expect(screen.getByLabelText('Second image')).toHaveValue('');
  });
});
