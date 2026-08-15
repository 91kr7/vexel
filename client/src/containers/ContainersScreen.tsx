import { useEffect, useState } from 'react';
import {
  ActionButtonGroup,
  Card,
  DataTable,
  EmptyState,
  ErrorBanner,
  FilterChips,
  IconButton,
  MetaCell,
  Row,
  ScreenToolbar,
  SearchField,
  Stack,
  StatusDotCell,
  TextField,
  triggerDownload,
  TwoLineCell,
  useToast,
  type DataTableColumn,
  type MenuEntry,
  type RowAction,
  type StatusTone,
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
  type ContainerPort,
  type ContainerState,
  type ContainerSummary,
} from '../data/containers-client';
import { exportContainerUrl } from '../data/container-transfer-client';
import type { ImageSummary } from '../data/images-client';
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

function formatMemory(container: ContainerSummary): string | undefined {
  if (container.memoryUsageBytes === undefined || container.memoryLimitBytes === undefined) return undefined;
  return `${formatBytes(container.memoryUsageBytes)} / ${formatBytes(container.memoryLimitBytes)}`;
}

function formatPorts(ports: ContainerPort[]): string | undefined {
  if (ports.length === 0) return undefined;
  return ports.map((port) => (port.publicPort ? `${port.publicPort}→${port.privatePort}` : `${port.privatePort}`)).join(', ');
}

function stateTone(state: ContainerState): StatusTone {
  if (state === 'running') return 'success';
  if (state === 'paused' || state === 'restarting') return 'warning';
  return 'neutral';
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
 * filters and a bulk "Prune stopped" action, and a dense virtualised table whose
 * every row ends in the same four controls — three fixed lifecycle slots
 * (run/halt, pause, restart), each present in every state and disabled with its
 * reason where the state does not allow it, and one overflow control opening the
 * row's secondary actions (rename, export filesystem, kill, remove). Selecting a
 * row (outside that action area) opens its detail panel inline below it;
 * exec/attach live there as panel tabs. Destructive actions (kill, remove,
 * prune) go through the shell's confirmation service, the menu being a step in
 * front of that confirmation rather than a substitute for it.
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
    const make = (id: string, label: string, task: () => Promise<void>, unavailable?: string): RowAction => ({
      id,
      label,
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

    const runHalt = restarting
      ? make('stop', 'Stop', () => stopContainer(container.id), RESTARTING_REASON)
      : running
        ? make('stop', 'Stop', () => stopContainer(container.id))
        : paused
          ? make('unpause', 'Resume', () => unpauseContainer(container.id))
          : make('start', 'Start', () => startContainer(container.id));

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
   * The row is the panel's only pointer route now that the panel has no close
   * control: selecting the selected row closes it, selecting another one leaves
   * it open on that container. A container filtered or searched out of view
   * deliberately keeps its selection — the panel is the table's expansion of its
   * own row, so neither is rendered while the row is out of the list and both
   * come back together when it re-enters.
   */
  function toggleSelection(container: ContainerSummary) {
    setSelectedId((current) => (current === container.id ? undefined : container.id));
  }

  function renderNameCell(container: ContainerSummary) {
    if (renamingId === container.id) {
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
    // No action on the name cell: renaming is started from the row's overflow
    // menu, which is the row's only action-bearing area.
    return <TwoLineCell title={container.name} subtitle={`${container.shortId} · ${container.state}`} />;
  }

  const columns: DataTableColumn<ContainerSummary>[] = [
    { id: 'status', header: '', width: '20px', render: (container) => <StatusDotCell tone={stateTone(container.state)} /> },
    { id: 'name', header: 'NAME', width: '1.8fr', render: renderNameCell },
    { id: 'image', header: 'IMAGE', render: (container) => <MetaCell>{container.image}</MetaCell> },
    {
      id: 'cpu',
      header: 'CPU',
      align: 'end',
      width: '0.6fr',
      render: (container) => <MetaCell>{container.cpuPercent === undefined ? undefined : `${container.cpuPercent.toFixed(0)}%`}</MetaCell>,
    },
    { id: 'memory', header: 'MEMORY', width: '1.2fr', render: (container) => <MetaCell>{formatMemory(container)}</MetaCell> },
    { id: 'ports', header: 'PORTS', width: '1fr', render: (container) => <MetaCell>{formatPorts(container.ports)}</MetaCell> },
    { id: 'uptime', header: 'UPTIME', width: '1fr', render: (container) => <MetaCell>{container.status}</MetaCell> },
    {
      id: 'lifecycle',
      header: 'LIFECYCLE',
      width: 'var(--data-table-action-column-width)',
      render: (container) => (
        <ActionButtonGroup
          actions={lifecycleActionsFor(container)}
          overflow={{ label: `More actions for ${container.name}`, entries: overflowEntriesFor(container) }}
        />
      ),
    },
  ];

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
      <Card padding="none">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(container) => container.id}
          maxHeight="60vh"
          selectedRowKey={selectedId}
          onRowSelect={toggleSelection}
          expandedRowKey={selectedId}
          renderExpanded={(container) => (
            <ContainerDetailPanel
              container={container}
              onClose={() => setSelectedId(undefined)}
              onContainerReplaced={(newId) => {
                setSelectedId(newId);
                onRefresh();
              }}
            />
          )}
          emptyState={
            <EmptyState
              title={loaded ? 'No containers match' : 'Loading containers…'}
              description={loaded ? 'Try a different search or filter.' : null}
             action={null} />
          }
        />
      </Card>

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
