import { useEffect, useState } from 'react';
import {
  Button,
  EmptyState,
  ErrorBanner,
  FilterChips,
  IconButton,
  Modal,
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
import { useStatsSubscription } from '../data/use-stats-subscription';
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

/** Why a control is unavailable: every disabled control carries one, so none reads as broken. */
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

/** The container the dialog is bound to, carried by the screen rather than looked up each time. */
interface DetailTarget {
  /** The last summary the dialog was drawn from; its id is the container the dialog belongs to. */
  container: ContainerSummary;
  /** A recreate has re-pointed the dialog and the new container has not reached the list yet. */
  awaitingList: boolean;
}

/**
 * Containers screen: search and state filters over one card per container, each with its lifecycle
 * slots, its overflow menu and the control that opens its detail as a large-format dialog.
 */
export function ContainersScreen({ containers, loaded, error, onRefresh, images = [], imagesLoaded = true }: ContainersScreenProps) {
  // This screen consumes the sampled figures, so it is what keeps the server
  // sampling; mounted only while the section is open
  // (plan-docker_management_app-containers_card_view/REQ-42, REQ-45).
  useStatsSubscription();
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [createMode, setCreateMode] = useState<'run' | 'create' | null>(null);

  // The carried summary follows the list — which is also how a re-pointed dialog learns
  // its recreated container has arrived. A re-read that changes neither bails out.
  useEffect(() => {
    setDetailTarget((current) => {
      if (!current) return current;
      const live = containers.find((container) => container.id === current.container.id);
      if (!live) return current;
      if (!current.awaitingList && live.name === current.container.name) return current;
      return { container: live, awaitingList: false };
    });
  }, [containers]);

  /** The dialog's one dismissal: the panel it held unmounts with it, so nothing outlives it. */
  function closeDetail() {
    setDetailTarget(null);
  }

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

  /** The browser owns the transfer; the app only announces it. */
  function startExport(container: ContainerSummary) {
    const filename = `${container.name}.tar`;
    triggerDownload(exportContainerUrl(container.id, filename));
    push({ title: 'Download started', message: filename, tone: 'success' });
  }

  /** Three slots, fixed in number, order and position; an illegal one keeps its slot, disabled. */
  function lifecycleActionsFor(container: ContainerSummary): RowAction[] {
    const busy = busyIds.has(container.id);
    const make = (id: string, label: string, task: () => Promise<void>, unavailable?: string, weight?: ActionWeight): RowAction => ({
      id,
      label,
      weight,
      disabled: busy || unavailable !== undefined,
      disabledReason: busy ? BUSY_REASON : unavailable,
      // The operation's own name, not the button's label, is what the messages read.
      onClick: () => runAction(container, id, task),
    });

    const state = container.state;
    const running = state === 'running';
    const paused = state === 'paused';
    const restarting = state === 'restarting';
    const stateReason = restarting ? RESTARTING_REASON : NOT_RUNNING_REASON;

    // Affirmative only where the container is not running: halting one is not the
    // card's suggestion. A weight, not a change of action or of legality.
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

  /** The same four entries in the same order in every state, each bound to this container. */
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

  function renameControlFor(container: ContainerSummary) {
    if (renamingId !== container.id) return undefined;
    return (
      <Row gap="var(--space-1)" align="center">
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
  // Read from the whole list, not from the filtered one: the dialog belongs to its
  // container, and a filter narrowing the cards behind it is not a dismissal. Absent
  // from that list, the container has ceased to exist — unless a recreate has just
  // re-pointed the dialog, in which case the carried summary stands in until the
  // re-read arrives, so a recreate never reads as a disappearance.
  const liveDetail = detailTarget ? containers.find((container) => container.id === detailTarget.container.id) : undefined;
  const detailContainer = liveDetail ?? (detailTarget?.awaitingList ? detailTarget.container : undefined);
  const detailName = liveDetail?.name ?? detailTarget?.container.name;

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
      {/* Three cards to a row; the detail stands over the grid as a dialog, so nothing
          opens beneath a card (containers-screen.md). */}
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
          <ContainerCard
            key={container.id}
            container={container}
            lifecycleActions={lifecycleActionsFor(container)}
            overflowEntries={overflowEntriesFor(container)}
            onOpenDetail={() => setDetailTarget({ container, awaitingList: false })}
            renameControl={renameControlFor(container)}
          />
        ))}
      </Grid>

      {/* The dialog keeps its chrome once its container has gone, so both of its ways out
          still work and nothing strands the operator in the end state; the point of
          interaction returns to the list region, the card that opened it having left with
          the container (containers-screen.md). */}
      <Modal
        open={detailTarget !== null}
        title={detailName ? `Container — ${detailName}` : ''}
        size="large"
        fluidWidth
        closeControl
        restoreFocus
        onClose={closeDetail}
      >
        {detailContainer ? (
          <ContainerDetailPanel
            container={detailContainer}
            onContainerReplaced={(newId) => {
              // A recreate is not a disappearance: the dialog follows the container onto
              // its new id, standing on the summary it already holds until the re-read
              // list carries the new one.
              setDetailTarget((current) => (current ? { container: { ...current.container, id: newId }, awaitingList: true } : current));
              onRefresh();
            }}
          />
        ) : (
          // The end state of a dialog whose container has ceased to exist: stated in
          // place, on the surface the operator is looking at, rather than by a silent
          // close or by a toast. Its resolving action is the dialog's own dismissal.
          <EmptyState
            title="This container no longer exists"
            description="It was removed while its detail was open, so there is nothing left here to show."
            action={<Button variant="primary" onClick={closeDetail}>Close</Button>}
          />
        )}
      </Modal>

      <ContainerCreateForm
        open={createMode !== null}
        images={images}
        imagesLoaded={imagesLoaded}
        defaultStart={createMode !== 'create'}
        onCancel={() => setCreateMode(null)}
        onCreated={() => {
          setCreateMode(null);
          onRefresh();
        }}
      />
    </Stack>
  );
}
