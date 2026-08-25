import { Fragment, useEffect, useState } from 'react';
import {
  EmptyState,
  ErrorBanner,
  FilterChips,
  IconButton,
  Row,
  ScreenToolbar,
  SearchField,
  Grid,
  GridSpan,
  Stack,
  TextField,
  triggerDownload,
  useToast,
  type ActionWeight,
  type MenuEntry,
  type RowAction,
} from '../ui';
import {
  killContainer,
  pauseContainer,
  pruneStoppedContainers,
  removeContainer,
  renameContainer,
  restartContainer,
  startContainer,
  stopContainer,
  unpauseContainer,
  type ContainerState,
  type ContainerSummary,
} from '../data/containers-client';
import { exportContainerUrl } from '../data/container-transfer-client';
import type { ImageSummary } from '../data/images-client';
import { ContainerCard } from './ContainerCard';
import { ContainerCreateForm } from './ContainerCreateForm';
import { ContainerDetailPanel } from './ContainerDetailPanel';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';

export interface ContainersScreenProps {
  containers: ContainerSummary[];
  loaded: boolean;
  error?: string;
  onRefresh: () => void;
  /** Local images offered as suggestions by the create/run form. */
  images?: ImageSummary[];
  imagesLoaded?: boolean;
}

const STATE_FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'stopped', label: 'Stopped' },
  { id: 'paused', label: 'Paused' },
];

const STOPPED_STATES: ContainerState[] = ['created', 'exited', 'dead'];

/**
 * Why a control of a row is unavailable. Every disabled control carries one, so
 * a greyed button or a greyed menu entry reads as "not now, because…" rather
 * than as broken.
 */
const NOT_RUNNING_REASON = 'This container is not running.';
const RESTARTING_REASON = 'This container is restarting.';
const ALREADY_PAUSED_REASON = 'This container is already paused.';
const NOT_KILLABLE_REASON = 'Only a running, paused or restarting container can be killed.';
const BUSY_REASON = 'Another action on this container is still running.';

/** The states in which the daemon accepts a kill — today's legality, unchanged. */
function isKillable(state: ContainerState): boolean {
  return state === 'running' || state === 'paused' || state === 'restarting';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)}${units[unitIndex]}`;
}

function matchesSearch(container: ContainerSummary, term: string): boolean {
  if (!term.trim()) return true;
  const needle = term.trim().toLowerCase();
  return (
    container.name.toLowerCase().includes(needle) ||
    container.image.toLowerCase().includes(needle) ||
    container.state.toLowerCase().includes(needle)
  );
}

function matchesStateFilter(container: ContainerSummary, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'running') return container.state === 'running';
  if (filter === 'paused') return container.state === 'paused' || container.state === 'restarting';
  if (filter === 'stopped') return (STOPPED_STATES as string[]).includes(container.state);
  return true;
}

/**
 * Containers screen (REQ-19–23, REQ-24–26, REQ-109): toolbar with search/state
 * filters and a bulk "Prune stopped" action, over one card per container — the
 * one list in the product drawn as a surface per object, admitted by name in
 * `check-ui-conformance.mjs`. Every card carries the same four controls — three
 * fixed lifecycle slots (run/halt, pause, restart), each present in every state
 * and disabled with its reason where the state does not allow it, and one
 * overflow control opening the container's secondary actions (rename, export
 * filesystem, kill, remove). Selecting a card (outside that action area) opens
 * its detail panel directly beneath it; exec/attach live there as panel tabs.
 * Destructive actions (kill, remove, prune) go through the shell's confirmation
 * service, the menu being a step in front of that confirmation rather than a
 * substitute for it.
 *
 * The cards mount all at once, where the table mounted only the rows near the
 * viewport: a card's height follows its content (the ports chip wraps), which is
 * the one case `DataTable` itself declines to virtualise. Accepted deliberately
 * and recorded in the plan's `batches.md`.
 */
export function ContainersScreen({ containers, loaded, error, onRefresh, images = [], imagesLoaded = true }: ContainersScreenProps) {
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [createMode, setCreateMode] = useState<'run' | 'create' | null>(null);

  useEffect(() => {
    if (selectedId && !containers.some((container) => container.id === selectedId)) setSelectedId(undefined);
  }, [containers, selectedId]);

  function setBusy(id: string, busy: boolean) {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function runAction(container: ContainerSummary, label: string, task: () => Promise<void>, destructive = false) {
    if (destructive) {
      const confirmed = await confirm({
        targetName: container.name,
        consequence: `This will ${label} the container.`,
        confirmLabel: label,
      });
      if (!confirmed) return;
    }
    setBusy(container.id, true);
    try {
      await run(`${label} ${container.name}`, task);
      onRefresh();
    } catch (cause) {
      reportError(`Could not ${label} ${container.name}`, (cause as Error).message);
    } finally {
      setBusy(container.id, false);
    }
  }

  function startRename(container: ContainerSummary) {
    setRenamingId(container.id);
    setRenameValue(container.name);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue('');
  }

  async function submitRename(container: ContainerSummary) {
    const nextName = renameValue.trim();
    if (!nextName || nextName === container.name) {
      cancelRename();
      return;
    }
    try {
      await run(`Rename ${container.name}`, () => renameContainer(container.id, nextName));
      cancelRename();
      onRefresh();
    } catch (cause) {
      reportError(`Could not rename ${container.name}`, (cause as Error).message);
    }
  }

  async function handlePruneStopped() {
    const confirmed = await confirm({
      targetName: 'stopped containers',
      consequence: 'This will permanently remove every stopped container.',
      confirmLabel: 'Prune stopped',
    });
    if (!confirmed) return;
    try {
      const result = await run('Prune stopped containers', () => pruneStoppedContainers());
      push({
        title: `${result.removedCount} container${result.removedCount === 1 ? '' : 's'} removed`,
        message: `${formatBytes(result.reclaimedBytes)} reclaimed`,
        tone: 'success',
      });
      onRefresh();
    } catch (cause) {
      reportError('Could not prune stopped containers', (cause as Error).message);
    }
  }

  /** Downloads the container's current filesystem straight to the operator's own machine: the browser owns the transfer, so the app only announces it. */
  function startExport(container: ContainerSummary) {
    const filename = `${container.name}.tar`;
    triggerDownload(exportContainerUrl(container.id, filename));
    push({ title: 'Download started', message: filename, tone: 'success' });
  }

  /**
   * The row's three lifecycle slots: fixed in number, order and position on
   * every row and in every state — the state-appropriate run/halt action, then
   * pause, then restart. An action the container's state does not allow keeps
   * its slot, disabled and stating why, so a position means the same action on
   * every row. The legality is exactly the one the row offered before: nothing
   * became legal here that the product did not already allow.
   */
  function lifecycleActionsFor(container: ContainerSummary): RowAction[] {
    const busy = busyIds.has(container.id);
    const make = (id: string, label: string, task: () => Promise<void>, unavailable?: string, weight?: ActionWeight): RowAction => ({
      id,
      label,
      weight,
      disabled: busy || unavailable !== undefined,
      disabledReason: busy ? BUSY_REASON : unavailable,
      // The operation's own name, not the button's label, is what the
      // confirmation, the progress line and the failure message read — they are
      // the ones this change leaves untouched.
      onClick: () => runAction(container, id, task),
    });

    const state = container.state;
    const running = state === 'running';
    const paused = state === 'paused';
    const restarting = state === 'restarting';
    const stateReason = restarting ? RESTARTING_REASON : NOT_RUNNING_REASON;

    // The first slot is the affirmative one where the container is not running —
    // starting or resuming it is what the operator came for — and merely one
    // control among the others where it is: halting a running container is not
    // the card's suggestion. Weight only; the action, its position and its
    // legality are unchanged.
    const runHalt = restarting
      ? make('stop', 'Stop', () => stopContainer(container.id), RESTARTING_REASON)
      : running
        ? make('stop', 'Stop', () => stopContainer(container.id))
        : paused
          ? make('unpause', 'Resume', () => unpauseContainer(container.id), undefined, 'primary')
          : make('start', 'Start', () => startContainer(container.id), undefined, 'primary');

    return [
      runHalt,
      make('pause', 'Pause', () => pauseContainer(container.id), running ? undefined : paused ? ALREADY_PAUSED_REASON : stateReason),
      make('restart', 'Restart', () => restartContainer(container.id), running || paused ? undefined : stateReason),
    ];
  }

  /**
   * The secondary actions of a row, behind its overflow control: the same four
   * entries in the same order whatever the state, an inapplicable one disabled
   * with its reason. `Kill` and `Remove` are destructive and set apart from the
   * two above them. The handlers are bound to this container, so a list that
   * re-sorts or re-reads under an open menu can never redirect an entry at
   * another one.
   */
  function overflowEntriesFor(container: ContainerSummary): MenuEntry[] {
    const busy = busyIds.has(container.id);
    const reason = (unavailable?: string) => (busy ? BUSY_REASON : unavailable);
    const killReason = reason(isKillable(container.state) ? undefined : NOT_KILLABLE_REASON);
    return [
      { id: 'rename', label: 'Rename…', disabled: busy, disabledReason: reason(), onSelect: () => startRename(container) },
      { id: 'export', label: 'Export filesystem…', disabled: busy, disabledReason: reason(), onSelect: () => startExport(container) },
      {
        id: 'kill',
        label: 'Kill',
        hint: 'SIGKILL',
        destructive: true,
        separated: true,
        disabled: killReason !== undefined,
        disabledReason: killReason,
        onSelect: () => runAction(container, 'kill', () => killContainer(container.id), true),
      },
      {
        id: 'rm',
        label: 'Remove',
        hint: 'rm',
        destructive: true,
        disabled: busy,
        disabledReason: reason(),
        onSelect: () => runAction(container, 'rm', () => removeContainer(container.id), true),
      },
    ];
  }

  /**
   * The card is the panel's only pointer route now that the panel has no close
   * control: selecting the selected card closes it, selecting another one leaves
   * it open on that container. A container filtered or searched out of view
   * deliberately keeps its selection — the panel is the card's own expansion, so
   * neither is rendered while the card is out of the list and both come back
   * together when it re-enters.
   */
  function toggleSelection(container: ContainerSummary) {
    setSelectedId((current) => (current === container.id ? undefined : container.id));
  }

  /**
   * The name's place while this container is being renamed. It is the card's
   * only editable area: renaming is started from the overflow menu, which is
   * where it was started from before.
   */
  function renameControlFor(container: ContainerSummary) {
    if (renamingId !== container.id) return undefined;
    return (
      <Row gap="var(--space-1)" align="center" onClick={(event) => event.stopPropagation()}>
        <TextField
          value={renameValue}
          onChange={setRenameValue}
          ariaLabel={`New name for ${container.name}`}
          autoFocus
          onSubmit={() => submitRename(container)}
        />
        <IconButton label="Save name" onClick={() => submitRename(container)}>
          ✓
        </IconButton>
        <IconButton label="Cancel rename" onClick={cancelRename}>
          ✕
        </IconButton>
      </Row>
    );
  }

  const filtered = containers.filter((container) => matchesStateFilter(container, stateFilter) && matchesSearch(container, search));
  const hasStoppedContainers = containers.some((container) => (STOPPED_STATES as string[]).includes(container.state));

  return (
    <Stack gap="var(--space-4)">
      <ScreenToolbar
        primaryAction={{ label: 'Run container…', onClick: () => setCreateMode('run') }}
        secondaryActions={[{ label: 'Create from image…', onClick: () => setCreateMode('create') }]}
        destructiveAction={{ label: 'Prune stopped', onClick: handlePruneStopped, disabled: !hasStoppedContainers }}
        filters={
          <>
            <SearchField value={search} onChange={setSearch} placeholder="Search name, image or state…" />
            <FilterChips options={STATE_FILTER_OPTIONS} activeId={stateFilter} onSelect={setStateFilter} />
          </>
        }
      />
      {error ? <ErrorBanner title="Could not load containers" detail={error} onRetry={onRefresh} /> : null}
      {/* One card per container, three to a row, separated by one gap and by
          nothing else: no header row, no rules between them, no surface around
          the list. Three to a row against the mock's one card at full width —
          decided by the human on the running product, where the metric columns
          spread across the page read as a void with `NET I/O` pushed to the
          far right. The panel of the selected container spans the whole row, so
          it opens under the card that owns it and the cards below move down.
          The grid is where the point of interaction returns when `Escape`
          closes that panel. */}
      <Grid arrangement="cards" dismissalFocusTarget>
        {filtered.length === 0 ? (
          <GridSpan>
            <EmptyState
              title={loaded ? 'No containers match' : 'Loading containers…'}
              description={loaded ? 'Try a different search or filter.' : null}
              action={null}
            />
          </GridSpan>
        ) : null}
        {filtered.map((container) => (
          <Fragment key={container.id}>
            <ContainerCard
              container={container}
              lifecycleActions={lifecycleActionsFor(container)}
              overflowEntries={overflowEntriesFor(container)}
              selected={container.id === selectedId}
              onSelect={() => toggleSelection(container)}
              renameControl={renameControlFor(container)}
            />
            {container.id === selectedId ? (
              <GridSpan>
                <ContainerDetailPanel
                  container={container}
                  onClose={() => setSelectedId(undefined)}
                  onContainerReplaced={(newId) => {
                    setSelectedId(newId);
                    onRefresh();
                  }}
                />
              </GridSpan>
            ) : null}
          </Fragment>
        ))}
      </Grid>

      <ContainerCreateForm
        open={createMode !== null}
        images={images}
        imagesLoaded={imagesLoaded}
        defaultStart={createMode !== 'create'}
        onCancel={() => setCreateMode(null)}
        onCreated={(result) => {
          setCreateMode(null);
          setSelectedId(result.id);
          onRefresh();
        }}
      />
    </Stack>
  );
}
