import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayerEfficiencyView } from '../../src/images/LayerEfficiencyView';
import { DataTable } from '../../src/ui';
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

/**
 * What a list drawing its panel in the **wrong slot** would show, as a list of
 * offences rather than as a boolean: content below the cells of a row nobody
 * selected, or a panel drawn anywhere but directly under a row of its own table
 * (`layer-efficiency-view.md`, `.../classic-table/REQ-10`).
 *
 * A function rather than assertions written inline, so the thing protecting the
 * claim can be pointed at a false state as well as at the component — a check
 * that is green on both builds by design is worth exactly as much as its
 * behaviour when the claim is false.
 */
function slotOffences(root: ParentNode): string[] {
  const offences: string[] = [];
  for (const content of Array.from(root.querySelectorAll('.ui-data-table__row-content'))) {
    offences.push(`row content below "${(content.previousElementSibling?.textContent ?? '').trim().slice(0, 30)}"`);
  }
  for (const expansion of Array.from(root.querySelectorAll('.ui-data-table__expanded'))) {
    if (expansion.closest('.ui-data-table') === null) offences.push('a panel drawn outside the table its row belongs to');
    if (!(expansion.previousElementSibling?.classList.contains('ui-data-table__row') ?? false)) {
      offences.push('a panel not drawn directly under a row of the list');
    }
  }
  return offences;
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

  // layer-efficiency-view.md — "The three lists are the one object list, never a second list
  // component beside it" (plan-ui-coherence-optimisation/REQ-82): each fact a row used to carry in
  // a subtitle is a column here, named in the header.
  describe('the three lists are the object list, each fact in a named column (plan-ui-coherence-optimisation/REQ-82)', () => {
    function listHeaders(): string[][] {
      return Array.from(document.querySelectorAll('.ui-data-table')).map((table) =>
        Array.from(table.querySelectorAll('.ui-data-table__header-cell')).map((cell) => cell.textContent ?? ''),
      );
    }

    it('draws the three findings lists as object lists and no list component beside them', async () => {
      await analyzeAndDeliver(makeSignals());

      expect(document.querySelectorAll('.ui-data-table')).toHaveLength(3);
      expect(document.querySelectorAll('.ui-card-list'), 'a second list component is still drawn beside the object list').toHaveLength(0);
    });

    /**
     * layer-efficiency-view.md — "**The lists are the containers list**, not
     * merely table-like … the **same row**, of the reference's own fixed height
     * and vertical alignment, stating no row modifier of its own"
     * (`.../classic-table/REQ-2`, `REQ-3`, `REQ-21`, `REQ-39`).
     *
     * **Contract and state only** (`.../classic-table/REQ-31`): every box is zero
     * in jsdom, so a geometric assertion would pass on any build, the rejected one
     * included. What is asserted here is what the call site states — no
     * presentation, no row modifier — and the boxes are measured in a browser
     * (`e2e/classic-table-criteria-layer-efficiency.spec.ts`), against the
     * containers and images lists read in the same run.
     */
    it('asks for no presentation and states no row modifier on any of the three lists', async () => {
      await analyzeAndDeliver(makeSignals());

      // The count of `--comfortable` lists stood here until 2026-08-16 and went **with the class**
      // (`.../classic-table/REQ-22`, `REQ-28`): nothing emits it, so it could no longer fail. Its
      // claim — none of the three lists asks for a presentation — is the row-modifier assertion
      // below, which a row can still break, plus the guard that refuses the vocabulary outright
      // (`card-row-presentation-retired.test.ts`, `scripts/check-ui-conformance.mjs`).
      const rows = Array.from(document.querySelectorAll('.ui-data-table__row'));
      expect(rows.length, 'the three lists draw no row at all, so there is no modifier to read').toBeGreaterThan(0);
      for (const row of rows) {
        expect(
          Array.from(row.classList).filter((name) => name !== 'ui-data-table__row' && name !== 'ui-data-table__row--selected'),
          'a finding row states a modifier of its own',
        ).toEqual([]);
      }
    });

    /**
     * layer-efficiency-view.md — "**Each list is composed as containers and images
     * compose theirs**, inside the dialog: its section header above, and the list
     * alone in an **unpadded card it fills edge to edge**. The list's one enclosing
     * surface is that card; the section it belongs to draws none, and no card is
     * nested inside another. The dialog is the surface the three sections are read
     * on, not a surface any of them adds" (`.../classic-table/REQ-4`, `REQ-40`).
     *
     * State, not geometry: which surfaces exist, what each holds, and which of them
     * is the dialog's own.
     */
    it('draws each list in one unpadded card holding it alone, with its section header outside it', async () => {
      await analyzeAndDeliver(makeSignals());

      const tables = Array.from(document.querySelectorAll('.ui-data-table'));
      expect(tables, 'the dialog draws no list to place in a card').toHaveLength(3);
      for (const table of tables) {
        const card = table.closest('.ui-surface');
        expect(card, 'the list sits in no card at all').not.toBeNull();
        expect(card!.classList.contains('ui-surface--pad-none'), 'the list’s card is padded').toBe(true);
        expect(card!.children, 'the card holds something besides the list').toHaveLength(1);
        expect(card!.firstElementChild).toBe(table);
        expect(card!.querySelector('.ui-section-header'), 'the section header is inside the list’s card').toBeNull();
        expect(table.querySelectorAll('.ui-surface'), 'a row is drawn on a surface of its own').toHaveLength(0);

        // The one surface above the card is **the dialog's**, and nothing stands
        // between them: a card inside a card is two surfaces where REQ-4 admits
        // one, and the dialog's own is not one a list took.
        const above = card!.parentElement?.closest('.ui-surface') ?? null;
        expect(above, 'the list’s card sits inside no dialog at all').not.toBeNull();
        expect(above!.classList.contains('ui-overlay-glass'), 'a surface other than the dialog’s encloses the list’s card').toBe(true);
        expect(card!.closest('.ui-modal__body'), 'the list’s card is not inside the dialog’s body').not.toBeNull();
      }
      // Each list's section header is drawn above its card, inside the dialog.
      expect(document.querySelectorAll('.ui-section-header'), 'the three sections do not each state a header').toHaveLength(3);
    });

    /**
     * layer-efficiency-view.md — "**What a finding row carries below its cells is
     * an expansion, not row content.** The three lists state `renderExpanded` and
     * no `renderRowContent`: the panel is drawn for the selected row only, directly
     * under it, inside the same table surface — where row content would be drawn on
     * every row unconditionally" (`.../classic-table/REQ-10`).
     *
     * The slot is what this batch could most easily have got wrong, the two being
     * one prop apart, and losing it is silent: a list that swapped them would draw
     * a route out of *every* finding and error at nothing.
     */
    it('draws the panel in the expansion slot, for the selected finding alone and directly under it', async () => {
      await analyzeAndDeliver(makeSignals());

      expect(slotOffences(document), 'a finding row carries content below its cells before anything was selected').toEqual([]);
      expect(document.querySelectorAll('.ui-data-table__expanded'), 'a panel is open before any finding was selected').toHaveLength(0);

      await userEvent.click(screen.getByText('app/waste.bin'));

      expect(slotOffences(document), 'the panel is not drawn in the expansion slot of the row that was selected').toEqual([]);
      const expansions = Array.from(document.querySelectorAll('.ui-data-table__expanded'));
      expect(expansions, 'selecting a finding opened no panel, or opened one per list').toHaveLength(1);
      const opened = expansions[0]!;
      expect(opened.previousElementSibling?.textContent, 'the panel did not open under the row that was selected').toContain('app/waste.bin');
      expect(opened.querySelector('button')?.textContent, 'the panel offers no route to the finding’s layer').toContain('View layer');

      // …and selecting it again collapses it: at most one finding is expanded per list.
      await userEvent.click(screen.getByText('app/waste.bin'));
      expect(document.querySelectorAll('.ui-data-table__expanded'), 'selecting the finding again left its panel open').toHaveLength(0);
    });

    /**
     * **The same predicate, pointed at the state it exists to refuse** — a list
     * using the *row content* slot instead of the expansion.
     *
     * This guard is green on the build this plan started from as well as on this
     * one, because the slot is a property the conversion must **not** change; so
     * "it passed" says nothing on its own. What says something is that it goes red
     * when the claim is false, and the false state is drawn here from the library's
     * own table rather than argued about — the same treatment the F19 restatement
     * gives its own assertion (`e2e/dialog-one-form.spec.ts`, 2026-08-16).
     */
    it('and that check goes red on a list that uses the row-content slot instead', () => {
      const { container } = render(
        <DataTable
          columns={[{ id: 'path', header: 'PATH', render: (row: { path: string }) => row.path }]}
          rows={[{ path: 'app/waste.bin' }]}
          rowKey={(row) => row.path}
          renderRowContent={() => <button type="button">View layer 1</button>}
        />,
      );

      expect(
        slotOffences(container),
        'the slot check passes on a list drawing a route out of every row, which is what the expansion slot is not',
      ).not.toEqual([]);
    });

    it('names every fact of a wasted file, a duplicate group and a flagged path in a column of its own', async () => {
      await analyzeAndDeliver(makeSignals());

      expect(listHeaders()).toEqual([
        ['PATH', 'WRITTEN AT', 'REASON', 'SUPERSEDED AT', 'SIZE'],
        ['DUPLICATE', 'PATHS', 'WASTED'],
        ['PATH', 'PATTERN', 'INTRODUCED AT', 'REMOVED AT'],
      ]);
    });

    it('states the reason a file was superseded, and the pattern a path was flagged by', async () => {
      await analyzeAndDeliver(makeSignals());

      expect(screen.getByText('overwritten')).toBeInTheDocument();
      expect(screen.getByText('npm auth token')).toBeInTheDocument();
    });

    // layer-efficiency-view.md — `REMOVED AT` reads `still present` when the flagged path was never
    // removed, which is the fact the delivered subtitle stated by omission.
    it('reads "still present" for a flagged path no later layer removed', async () => {
      const signals = makeSignals();
      await analyzeAndDeliver({
        ...signals,
        secrets: { imageId: signals.imageId, findings: [{ path: 'root/.aws/credentials', patternName: 'aws credentials', introducedLayerIndex: 3 }] },
      });

      expect(screen.getByText('still present')).toBeInTheDocument();
    });
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
