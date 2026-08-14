import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayerEfficiencyView } from '../../src/images/LayerEfficiencyView';
import type { ImageSummary } from '../../src/data/images-client';
import type { LayerSignals } from '../../src/data/image-signals-client';

// Stands in for the browser's EventSource: the signals-analysis stream's only channel (REQ-65,
// REQ-66, REQ-67, sharing the changeset job's progress shape, REQ-51), so the tests drive it by
// emitting events on the instance LayerEfficiencyView opened.
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

/** A result naming one path in every findings category, each concerning a distinct, known layer. */
function makeSignals(overrides: Partial<LayerSignals> = {}): LayerSignals {
  const imageId = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef';
  return {
    imageId,
    waste: {
      imageId,
      wastedFiles: [{ path: 'app/waste.bin', layerIndex: 0, sizeBytes: 800, supersededByLayerIndex: 1, reason: 'overwritten' }],
      totalWastedBytes: 800,
      totalBytesWritten: 1000,
      efficiencyScore: 0.2,
    },
    duplicates: {
      imageId,
      duplicates: [{ contentHash: 'H1', sizeBytes: 400, paths: [{ path: 'a/one.bin', layerIndex: 2 }, { path: 'b/two.bin', layerIndex: 2 }], wastedBytes: 400 }],
      totalDuplicateWastedBytes: 400,
    },
    secrets: { imageId, findings: [{ path: 'root/.npmrc', patternName: 'npm auth token', introducedLayerIndex: 3, removedLayerIndex: 4 }] },
    ...overrides,
  };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Renders the view, starts and confirms an analysis, then delivers `result` on the fake stream. */
async function analyzeAndDeliver(
  result: LayerSignals,
  extraProps: Partial<{ onNavigateToLayer: (layerIndex: number) => void; onFindingsChange: (map: Map<number, number>) => void }> = {},
) {
  const image = makeImage();
  const onNavigateToLayer = extraProps.onNavigateToLayer ?? vi.fn();
  const onFindingsChange = extraProps.onFindingsChange ?? vi.fn();
  render(<LayerEfficiencyView image={image} open onClose={vi.fn()} onNavigateToLayer={onNavigateToLayer} onFindingsChange={onFindingsChange} />);

  await userEvent.click(screen.getByRole('button', { name: 'Analyze layer efficiency…' }));
  await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));
  act(() => latestSource().emit('result', result));
  act(() => latestSource().emit('end'));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Analyze layer efficiency…' })).not.toBeInTheDocument());

  return { image, onNavigateToLayer, onFindingsChange };
}

// layer-efficiency-view.md — the Callout states plainly that findings are a heuristic path/size
// signal, not a security verdict; shown before analysis has run, alongside the invitation to analyze.
describe('LayerEfficiencyView — heuristic disclaimer and pre-analysis state (plan-docker_management_app/REQ-65, plan-docker_management_app/REQ-66, plan-docker_management_app/REQ-67)', () => {
  it('shows a heuristic, non-security-verdict disclaimer and an invitation to analyze before any run', () => {
    render(<LayerEfficiencyView image={makeImage()} open onClose={vi.fn()} onNavigateToLayer={vi.fn()} />);

    expect(screen.getByText(/heuristic/i)).toBeInTheDocument();
    expect(screen.getByText(/security/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze layer efficiency…' })).toBeInTheDocument();
  });

  // layer-efficiency-view.md — "Analyze layer efficiency…" opens a ConfirmDialog stating the
  // estimated cost before the analysis stream starts.
  it('opens a cost-warning dialog naming the image before starting analysis, and starts nothing on cancel', async () => {
    const image = makeImage({ tags: ['nginx:1.27'] });
    render(<LayerEfficiencyView image={image} open onClose={vi.fn()} onNavigateToLayer={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Analyze layer efficiency…' }));
    const dialogHeading = screen.getByRole('heading', { name: `Confirm: ${image.tags[0]}` });
    expect(dialogHeading).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('heading', { name: `Confirm: ${image.tags[0]}` })).not.toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  // layer-efficiency-view.md — the analysis dialog is one of the four opted into the shared
  // surface's self-dismissal: it states its completion and then goes on its own, leaving the
  // signals readable behind it (progress_completion_autoclose/REQ-1, REQ-6, REQ-13)
  it('states the completion and then dismisses the progress dialog by itself, leaving the findings readable', async () => {
    render(<LayerEfficiencyView image={makeImage()} open onClose={vi.fn()} onNavigateToLayer={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Analyze layer efficiency…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    act(() => latestSource().emit('result', makeSignals()));
    act(() => latestSource().emit('end'));

    // Read by its class: the completion is also exposed as a status message, so the word is in the
    // dialog twice on purpose.
    await waitFor(() => expect(document.querySelector('.ui-transfer-progress-dialog__caption')).toHaveTextContent('Completed'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Analyzing layer efficiency' })).not.toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(screen.getByText('app/waste.bin')).toBeInTheDocument();
  });
});

// layer-efficiency-view.md — once analysed: efficiency score gauge and reading, wasted files,
// duplicated content and flagged paths, each navigating to the layer it concerns.
describe('LayerEfficiencyView — findings (plan-docker_management_app/REQ-65, plan-docker_management_app/REQ-66, plan-docker_management_app/REQ-67)', () => {
  // layer-waste-analysis.md — efficiencyScore = 1 - totalWastedBytes / totalBytesWritten (here
  // 1 - 800/1000 = 0.2), shown as a reading alongside the gauge.
  it('shows the efficiency score reading derived from the waste analysis result', async () => {
    await analyzeAndDeliver(makeSignals());

    expect(screen.getByText('20%')).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-65 — a wasted file names the path; selecting it and choosing
  // "View layer" navigates to the layer that wrote the now-dead bytes.
  it('lists a wasted file and navigates to its layer on "View layer"', async () => {
    const { onNavigateToLayer } = await analyzeAndDeliver(makeSignals());

    expect(screen.getByText('app/waste.bin')).toBeInTheDocument();
    await userEvent.click(screen.getByText('app/waste.bin'));
    await userEvent.click(screen.getByRole('button', { name: /View layer/i }));

    expect(onNavigateToLayer).toHaveBeenCalledWith(0);
  });

  // plan-docker_management_app/REQ-66 — a duplicate-content group names every path sharing the
  // content; navigating from one of them reaches that path's own layer.
  it('lists a duplicate-content group naming every path sharing the content, navigating to a chosen path\'s layer', async () => {
    const { onNavigateToLayer } = await analyzeAndDeliver(makeSignals());

    // Both paths are named together, before the row is expanded (afterwards, the drill-down
    // buttons below repeat each path's name too, so the check is scoped to this single moment).
    expect(screen.getByText('a/one.bin', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('b/two.bin', { exact: false })).toBeInTheDocument();

    await userEvent.click(screen.getByText('a/one.bin', { exact: false }));
    const drillDownButtons = screen.getAllByRole('button', { name: /view layer/i });
    await userEvent.click(drillDownButtons[drillDownButtons.length - 1]!);

    expect(onNavigateToLayer).toHaveBeenCalledWith(2);
  });

  // plan-docker_management_app/REQ-67 — a secret finding names the path and, when removed, both
  // the introducing and the removing layer; navigating reaches the introducing layer.
  it('lists a secret-pattern finding naming the path, navigating to the introducing layer', async () => {
    const { onNavigateToLayer } = await analyzeAndDeliver(makeSignals());

    expect(screen.getByText('root/.npmrc')).toBeInTheDocument();
    await userEvent.click(screen.getByText('root/.npmrc'));
    await userEvent.click(screen.getByRole('button', { name: /View introducing layer/i }));

    expect(onNavigateToLayer).toHaveBeenCalledWith(3);
  });

  // layer-efficiency-view.md — onFindingsChange fires only once a result exists, carrying the layer
  // indices the findings concern, feeding LayerExplorer's layersWithFindings markers.
  it('calls onFindingsChange with the findings\' layer indices once a result exists, not before', async () => {
    const onFindingsChange = vi.fn();
    render(<LayerEfficiencyView image={makeImage()} open onClose={vi.fn()} onNavigateToLayer={vi.fn()} onFindingsChange={onFindingsChange} />);
    expect(onFindingsChange).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Analyze layer efficiency…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    expect(onFindingsChange).not.toHaveBeenCalled();

    act(() => latestSource().emit('result', makeSignals()));
    act(() => latestSource().emit('end'));

    await waitFor(() => expect(onFindingsChange).toHaveBeenCalled());
    const map = onFindingsChange.mock.calls[onFindingsChange.mock.calls.length - 1]![0] as Map<number, number>;
    expect(map.has(0)).toBe(true); // the wasted file's layer
    expect(map.has(2)).toBe(true); // the duplicate content's layer
    expect(map.has(3)).toBe(true); // the secret finding's introducing layer
  });
});
