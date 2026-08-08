import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayerExplorer } from '../../src/images/LayerExplorer';
import type { ImageSummary } from '../../src/data/images-client';
import type { LayerMetadata } from '../../src/data/image-layers-client';

// Stands in for the browser's EventSource: the changeset analysis stream's
// only channel (REQ-49, REQ-51), so the tests drive it by emitting events on
// the instance LayerExplorer opened.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  private listeners = new Map<string, Array<(event: unknown) => void>>();
  closed = false;

  constructor(public url: string) {
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

/** The outer layer-stack table's own rows, excluding a selected layer's nested changeset-paths
 * table (rendered inside its expanded region, which also uses `.ui-data-table__row`): the outer
 * table's `.ui-data-table__body` is the first in document order, and its rows are its direct
 * children, unlike a nested table's rows (several levels further down). */
function outerLayerRows(): HTMLElement[] {
  const outerBody = document.querySelector<HTMLElement>('.ui-data-table__body');
  if (!outerBody) return [];
  return Array.from(outerBody.querySelectorAll<HTMLElement>(':scope > .ui-data-table__row'));
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

function makeLayer(overrides: Partial<LayerMetadata & { sharedWith: { id: string; tags: string[] }[] }> = {}) {
  return {
    index: 0,
    diffId: 'sha256:layer-diff',
    uncompressedSizeBytes: 1000,
    compressedSizeUnavailableReason: 'The local daemon reports only the uncompressed layer content size.',
    emptyLayer: false,
    instruction: 'RUN',
    command: 'apt-get install -y curl',
    sharedWith: [],
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let layers: ReturnType<typeof makeLayer>[];

beforeEach(() => {
  layers = [makeLayer()];
  fetchMock = vi.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ imageId: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef', layers }),
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Renders the explorer, waits for the layer stack to load, then selects the first row — the
 * changeset view (and its "Analyze changesets…" action) only appears for a selected layer. */
async function renderExplorer(overrides: Partial<ImageSummary> = {}) {
  const image = makeImage(overrides);
  const onClose = vi.fn();
  render(<LayerExplorer image={image} open onClose={onClose} />);
  await waitFor(() => expect(document.querySelector('.ui-data-table__row')).not.toBeNull());
  await userEvent.click(document.querySelector('.ui-data-table__row .ui-data-table__cell')!);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Analyze changesets…' })).toBeInTheDocument());
  return { image, onClose };
}

// layer-explorer.md — a large Modal holding a DataTable of layers, expanding below the selected
// row into the changeset view for that layer
describe('LayerExplorer — layer stack (plan-docker_management_app/REQ-47, plan-docker_management_app/REQ-48, plan-docker_management_app/REQ-50)', () => {
  it('performs no fetch while closed', () => {
    const image = makeImage();
    render(<LayerExplorer image={image} open={false} onClose={vi.fn()} />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows one row per layer, in the order the server returned them', async () => {
    layers = [makeLayer({ index: 0, command: 'first step' }), makeLayer({ index: 1, command: 'second step' })];
    await renderExplorer();

    const rows = document.querySelectorAll('.ui-data-table__row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('first step');
    expect(rows[1]!.textContent).toContain('second step');
  });

  it('marks an empty layer with an "empty" badge', async () => {
    layers = [makeLayer({ emptyLayer: true, diffId: undefined, uncompressedSizeBytes: 0 })];
    await renderExplorer();

    expect(document.querySelector('.ui-data-table__row')!.textContent).toContain('empty');
  });

  it('marks a layer shared with another image', async () => {
    layers = [makeLayer({ sharedWith: [{ id: 'sha256:other', tags: ['other:latest'] }] })];
    await renderExplorer();

    expect(document.querySelector('.ui-data-table__row')!.textContent).toContain('shared');
  });

  it('shows the compressed size column as unavailable, with the daemon-limitation reason', async () => {
    await renderExplorer();

    const unavailable = document.querySelector('.ui-table-meta-cell--unavailable');
    expect(unavailable).not.toBeNull();
    expect(unavailable!.textContent).toBe('unavailable');
    expect(unavailable!.getAttribute('title')).toBe(layers[0]!.compressedSizeUnavailableReason);
  });
});

// layer-explorer.md — "Analyze changesets…" opens a ConfirmDialog naming the image and stating the
// estimated time and temporary disk cost; confirming starts the analysis stream (REQ-51)
describe('LayerExplorer — cost warning, progress and cancel (plan-docker_management_app/REQ-51)', () => {
  // layer-explorer.md — before analysis, the same "not analyzed yet" prompt is shown regardless of
  // which layer is selected
  it('shows the "not analyzed yet" prompt before any analysis has run, whichever layer is selected', async () => {
    layers = [makeLayer({ index: 0 }), makeLayer({ index: 1 })];
    await renderExplorer();
    expect(screen.getByText('Changesets not analyzed yet')).toBeInTheDocument();

    const rows = document.querySelectorAll('.ui-data-table__row');
    await userEvent.click(rows[1]!.querySelector('.ui-data-table__cell')!);

    expect(screen.getByText('Changesets not analyzed yet')).toBeInTheDocument();
  });

  it('opens a cost-warning dialog naming the image before starting analysis, and starts nothing on cancel', async () => {
    const { image } = await renderExplorer({ tags: ['nginx:1.27'] });

    await userEvent.click(screen.getByRole('button', { name: 'Analyze changesets…' }));

    const dialogHeading = screen.getByRole('heading', { name: `Confirm: ${image.tags[0]}` });
    expect(dialogHeading).toBeInTheDocument();
    const dialog = dialogHeading.closest('.ui-modal')!;
    expect(within(dialog).getByText(/temporary disk/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('heading', { name: `Confirm: ${image.tags[0]}` })).not.toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('starts the analysis stream on confirm and shows a cancellable progress dialog', async () => {
    await renderExplorer();

    await userEvent.click(screen.getByRole('button', { name: 'Analyze changesets…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    expect(screen.getByRole('heading', { name: 'Analyzing layer changesets' })).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  // layer-explorer.md — Cancel stops the analysis server-side and discards it: the dialog closes
  // with no result, and the "not analyzed yet" prompt is shown again
  it('cancelling the progress dialog while active stops the analysis stream and discards it, back to "not analyzed yet"', async () => {
    await renderExplorer();
    await userEvent.click(screen.getByRole('button', { name: 'Analyze changesets…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    const source = latestSource();
    // A partial result arriving just before cancel must not survive it either.
    act(() => latestSource().emit('progress', { phase: 'analyzing', completedLayers: 1, totalLayers: 2 }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(source.closed).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Analyzing layer changesets' })).not.toBeInTheDocument();
    expect(screen.getByText('Changesets not analyzed yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze changesets…' })).toBeInTheDocument();
  });
});

// layer-explorer.md — after analysis, the selected layer's added/modified/deleted paths are shown
// (status marker, full path, size — unavailable with a reason for a deleted path's size)
describe('LayerExplorer — changeset view (plan-docker_management_app/REQ-49)', () => {
  it("shows the selected layer's added/modified/deleted paths once analysis completes", async () => {
    layers = [makeLayer({ index: 0 })];
    await renderExplorer();
    await userEvent.click(screen.getByRole('button', { name: 'Analyze changesets…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    act(() =>
      latestSource().emit('result', {
        imageId: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef',
        layers: [
          {
            layerIndex: 0,
            diffId: 'sha256:layer-diff',
            paths: [
              { path: 'app/config.yml', status: 'added', sizeBytes: 128 },
              { path: 'app/old.txt', status: 'deleted', sizeUnavailableReason: 'the layer deletes this path' },
            ],
          },
        ],
      }),
    );
    act(() => latestSource().emit('end'));

    await waitFor(() => expect(screen.getByText('app/config.yml')).toBeInTheDocument());
    expect(screen.getByText('app/old.txt')).toBeInTheDocument();
    const deletedRow = screen.getByText('app/old.txt').closest('.ui-data-table__row')!;
    expect(within(deletedRow).getByText('unavailable')).toBeInTheDocument();
  });

  // layer-explorer.md — Close, once the analysis finished, is only an acknowledgement: the computed
  // changeset stays and is what the layer selection below browses; selecting a layer row shows that
  // layer's changeset once the dialog has been dismissed too
  it('keeps the changeset browsable after closing the dialog on success, and layer selection still works', async () => {
    layers = [makeLayer({ index: 0 }), makeLayer({ index: 1 })];
    await renderExplorer();
    await userEvent.click(screen.getByRole('button', { name: 'Analyze changesets…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    act(() =>
      latestSource().emit('result', {
        imageId: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef',
        layers: [
          { layerIndex: 0, diffId: 'sha256:layer-diff', paths: [{ path: 'app/config.yml', status: 'added', sizeBytes: 128 }] },
          { layerIndex: 1, diffId: 'sha256:layer-diff', paths: [{ path: 'app/other.yml', status: 'added', sizeBytes: 64 }] },
        ],
      }),
    );
    act(() => latestSource().emit('end'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('heading', { name: 'Analyzing layer changesets' })).not.toBeInTheDocument();
    expect(screen.queryByText('Changesets not analyzed yet')).not.toBeInTheDocument();
    expect(screen.getByText('app/config.yml')).toBeInTheDocument();

    // Selecting the other layer still switches the browsed changeset — the dismissed dialog did
    // not disable the selection or the underlying result.
    const rows = outerLayerRows();
    await userEvent.click(rows[1]!.querySelector('.ui-data-table__cell')!);

    expect(screen.getByText('app/other.yml')).toBeInTheDocument();
    expect(screen.queryByText('app/config.yml')).not.toBeInTheDocument();
  });

  // layer-explorer.md — Close, once the analysis failed, dismisses the dialog and clears it, so
  // "Analyze changesets…" is offered again
  it('re-offers the analysis after closing the dialog on failure', async () => {
    await renderExplorer();
    await userEvent.click(screen.getByRole('button', { name: 'Analyze changesets…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    act(() => latestSource().emit('error', { message: 'export failed' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('heading', { name: 'Analyzing layer changesets' })).not.toBeInTheDocument();
    expect(screen.getByText('Changesets not analyzed yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze changesets…' })).toBeInTheDocument();
  });
});
