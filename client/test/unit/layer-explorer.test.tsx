import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayerExplorer } from '../../src/images/LayerExplorer';
import type { ImageSummary } from '../../src/data/images-client';
import type { LayerBuildCacheLink, LayerMetadata } from '../../src/data/image-layers-client';
// Following a layer's build-cache reference reaches the Builders & cache screen
// (images/specs/layer-explorer.md), so the explorer only stands inside a
// cross-navigation provider.
import { CrossNavigationProvider, useCrossNavigation, type CrossNavigationRequest } from '../../src/shell/services/CrossNavigationService';
import { forgetReportedFailures, reportedText } from '../support/error-reporting-mock';

// What a screen owes on a failure is the report itself; what becomes of it is the reporting
// service's own contract (app-shell/specs/error-reporting-service.md).
vi.mock('../../src/shell/services/ErrorReportingService', () => import('../support/error-reporting-mock'));

// Stands in for the browser's EventSource: the changeset analysis stream's
// only channel (REQ-49, REQ-51), so the tests drive it by emitting events on
// the instance LayerExplorer opened.
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

const IMAGE_ID = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef';

/** A layer-to-build-cache link as the server answers with it (images/specs/use-image-build-cache-trace.md). */
function makeCacheLink(overrides: Partial<LayerBuildCacheLink> = {}): LayerBuildCacheLink {
  return {
    layerIndex: 0,
    diffId: 'sha256:layer-diff',
    instruction: 'RUN',
    command: 'RUN /bin/sh -c apt-get install -y curl # buildkit',
    cacheRecord: { id: 'cache-record-1', type: 'regular', sizeBytes: 4096, usageState: 'reclaimable' },
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let layers: ReturnType<typeof makeLayer>[];
let cacheLinks: LayerBuildCacheLink[];
let cacheTraceFailure: string | undefined;
/** The cross-navigation request the explorer posted, if any — how "reaches that record on the Builders & cache screen" is observed. */
let lastNavigationRequest: CrossNavigationRequest | undefined;

function NavigationProbe() {
  lastNavigationRequest = useCrossNavigation().request;
  return null;
}

beforeEach(() => {
  forgetReportedFailures();
  layers = [makeLayer()];
  cacheLinks = [makeCacheLink()];
  cacheTraceFailure = undefined;
  lastNavigationRequest = undefined;
  fetchMock = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/layers/build-cache')) {
      if (cacheTraceFailure) return Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({ error: cacheTraceFailure }) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ imageId: IMAGE_ID, layers: cacheLinks }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ imageId: IMAGE_ID, layers }) });
  });
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
  render(
    <CrossNavigationProvider>
      <NavigationProbe />
      <LayerExplorer image={image} open onClose={onClose} />
    </CrossNavigationProvider>,
  );
  await waitFor(() => expect(document.querySelector('.ui-data-table__row')).not.toBeNull());
  await userEvent.click(document.querySelector('.ui-data-table__row .ui-data-table__cell')!);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Analyze changesets…' })).toBeInTheDocument());
  return { image, onClose };
}

// layer-explorer.md — a large Modal holding a DataTable of layers, expanding below the selected
// row into the changeset view for that layer
describe('LayerExplorer — layer stack (plan-docker_management_app/REQ-47, plan-docker_management_app/REQ-48, plan-docker_management_app/REQ-50)', () => {
  // layer-explorer.md — "The layer stack and the build-cache association both load only while the
  // explorer is open, so a closed explorer performs no fetch."
  it('performs no fetch while closed', () => {
    const image = makeImage();
    render(
      <CrossNavigationProvider>
        <LayerExplorer image={image} open={false} onClose={vi.fn()} />
      </CrossNavigationProvider>,
    );

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
    const dialog = dialogHeading.closest<HTMLElement>('.ui-modal')!;
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
    const deletedRow = screen.getByText('app/old.txt').closest<HTMLElement>('.ui-data-table__row')!;
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

    // The completion is stated while the dialog is still there, and the dialog then goes on its own
    // — nothing is pressed (progress_completion_autoclose/REQ-1, REQ-6, REQ-24).
    await waitFor(() => expect(document.querySelector('.ui-transfer-progress-dialog__caption')).toHaveTextContent('Completed'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Analyzing layer changesets' })).not.toBeInTheDocument(), {
      timeout: 3000,
    });

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
    // layer-explorer.md — the failure is reported as a toast carrying the daemon's own message,
    // the dialog states none and offers no retry of its own
    // (plan-docker_management_app-inline_error_panels/REQ-5, /REQ-7)
    await waitFor(() => expect(reportedText()).toMatch(/export failed/));
    // Scoped to the progress dialog: the screen's own body panels are another batch's subject.
    const progressDialog = document.querySelector('.ui-transfer-progress-dialog__caption')!.closest<HTMLElement>('.ui-modal')!;
    expect(progressDialog.querySelector('.ui-error-banner'), 'the dialog stated the cause itself').toBeNull();
    expect(within(progressDialog).queryByRole('button', { name: 'Retry' }), 'the dialog offered a retry of its own').not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('heading', { name: 'Analyzing layer changesets' })).not.toBeInTheDocument();
    expect(screen.getByText('Changesets not analyzed yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze changesets…' })).toBeInTheDocument();
  });
});

// layer-explorer.md — per layer, the build-cache record behind it is named and reachable in one
// move, or the reason no such record exists is stated; a registry-pulled image therefore shows an
// explanation, never an empty panel.
describe('LayerExplorer — build step & build cache (plan-docker_management_app/REQ-68)', () => {
  // layer-explorer.md — "Per layer, in the cache column: a followable CrossReference to the
  // build-cache record behind it when the association exists"
  it('shows a followable cache reference in the layer row when the association exists', async () => {
    await renderExplorer();

    const row = outerLayerRows()[0]!;
    const reference = row.querySelector('.ui-cross-reference--navigable');
    expect(reference).not.toBeNull();
    // Never blank: a followable reference always names the object it leads to.
    expect(reference!.textContent!.trim().length).toBeGreaterThan(0);
    expect(row.querySelector('.ui-cross-reference--unavailable')).toBeNull();
  });

  // layer-explorer.md — "otherwise `unavailable` with the reason as its tooltip"; a layer with no
  // cache record is never shown blank.
  it('shows the cache column as unavailable, carrying the reason as its tooltip, when there is no record', async () => {
    cacheLinks = [
      makeCacheLink({
        cacheRecord: undefined,
        unavailableReason: 'NoMatchingCacheRecord',
        unavailableDetail: 'No local build-cache record matches this step: the image was not built on this host.',
      }),
    ];
    await renderExplorer();

    const row = outerLayerRows()[0]!;
    // The compressed-size column is unavailable on every row too, so the cache column is
    // identified by the reason it carries rather than by position.
    const unavailable = Array.from(row.querySelectorAll<HTMLElement>('[title]')).filter(
      (element) => element.getAttribute('title') === 'No local build-cache record matches this step: the image was not built on this host.',
    );
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0]!.textContent).toContain('unavailable');
    expect(row.querySelector('.ui-cross-reference--navigable')).toBeNull();
  });

  // layer-explorer.md — above the changeset view, a "Build step & build cache" section with the
  // layer's full recorded command and its cache reference, carrying the record's type, usage state
  // and size next to it.
  it('shows the selected layer\'s full recorded command and its cache record in the expanded section', async () => {
    await renderExplorer();

    const section = screen.getByText('Build step & build cache').closest('.ui-data-table__expanded, .ui-stack, .ui-surface') ?? document.body;
    expect(section.textContent).toContain('RUN /bin/sh -c apt-get install -y curl # buildkit');
    expect(section.textContent).toContain('regular');
    expect(section.textContent).toContain('reclaimable');
  });

  // plan-docker_management_app/REQ-68 — "when it is not, the reason is stated rather than left
  // blank": the registry-pulled case shows the full sentence, not an empty panel.
  it('states the full reason sentence in the expanded section when the association does not exist', async () => {
    const detail = 'No local build-cache record matches this step: the image was not built on this host — a registry-pulled image leaves no build cache behind — or its record has been pruned since.';
    cacheLinks = [makeCacheLink({ cacheRecord: undefined, unavailableReason: 'NoMatchingCacheRecord', unavailableDetail: detail })];
    await renderExplorer();

    expect(screen.getByText('Build step & build cache')).toBeInTheDocument();
    expect(screen.getByText(detail)).toBeInTheDocument();
  });

  // layer-explorer.md — "Following a layer's build-cache reference (in the column or in the
  // expanded section) closes the explorer and reaches that record on the Builders & cache screen."
  it('following the cache reference closes the explorer and asks to reach that record on another screen', async () => {
    const { onClose } = await renderExplorer();

    await userEvent.click(document.querySelector('.ui-cross-reference--navigable')!);

    expect(onClose).toHaveBeenCalled();
    expect(lastNavigationRequest).toBeDefined();
    expect(lastNavigationRequest!.objectId).toBe('cache-record-1');
  });

  // layer-explorer.md — an unavailable reference is never followable.
  it('never makes an unavailable cache reference followable', async () => {
    cacheLinks = [
      makeCacheLink({ cacheRecord: undefined, unavailableReason: 'MetadataOnlyStep', unavailableDetail: 'This step only changed image metadata.' }),
    ];
    const { onClose } = await renderExplorer();

    expect(document.querySelector('.ui-cross-reference--navigable')).toBeNull();
    await userEvent.click(document.querySelector('.ui-cross-reference--unavailable')!);

    expect(onClose).not.toHaveBeenCalled();
    expect(lastNavigationRequest).toBeUndefined();
  });

  // layer-explorer.md — "a failed read: an ErrorBanner with retry, leaving the rest of the explorer
  // usable."
  it('reports a failed association read with a retry, leaving the layer stack usable', async () => {
    cacheTraceFailure = 'buildx du: failed to connect to the builder';
    await renderExplorer();

    await waitFor(() => expect(screen.getByText(/failed to connect to the builder/)).toBeInTheDocument());
    expect(outerLayerRows()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Analyze changesets…' })).toBeInTheDocument();
  });
});
