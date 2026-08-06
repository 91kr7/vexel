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
  TwoLineCell,
  useToast,
  type DataTableColumn,
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
import { ContainerDetailPanel } from './ContainerDetailPanel';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';

export interface ContainersScreenProps {
  containers: ContainerSummary[];
  loaded: boolean;
  error?: string;
  onRefresh: () => void;
}

const STATE_FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'stopped', label: 'Stopped' },
  { id: 'paused', label: 'Paused' },
];

const STOPPED_STATES: ContainerState[] = ['created', 'exited', 'dead'];

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
 * filters and a bulk "Prune stopped" action, a dense virtualised table with
 * per-row lifecycle actions restricted to what the container's state allows,
 * and inline rename. Selecting a row (outside its action buttons) opens its
 * detail panel inline below it. Destructive actions (kill, remove, prune) go
 * through the shell's confirmation service.
 */
export function ContainersScreen({ containers, loaded, error, onRefresh }: ContainersScreenProps) {
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

  function lifecycleActionsFor(container: ContainerSummary): RowAction[] {
    const disabled = busyIds.has(container.id);
    const rename: RowAction = { id: 'rename', label: 'rename', onClick: () => startRename(container), disabled };
    const make = (id: string, task: () => Promise<void>, destructive = false): RowAction => ({
      id,
      label: id,
      disabled,
      destructive,
      onClick: () => runAction(container, id, task, destructive),
    });

    switch (container.state) {
      case 'running':
        return [
          rename,
          make('stop', () => stopContainer(container.id)),
          make('pause', () => pauseContainer(container.id)),
          make('restart', () => restartContainer(container.id)),
          make('kill', () => killContainer(container.id), true),
          make('rm', () => removeContainer(container.id), true),
        ];
      case 'paused':
        return [
          rename,
          make('unpause', () => unpauseContainer(container.id)),
          make('restart', () => restartContainer(container.id)),
          make('kill', () => killContainer(container.id), true),
          make('rm', () => removeContainer(container.id), true),
        ];
      case 'restarting':
        return [rename, make('kill', () => killContainer(container.id), true), make('rm', () => removeContainer(container.id), true)];
      default:
        return [rename, make('start', () => startContainer(container.id)), make('rm', () => removeContainer(container.id), true)];
    }
  }

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
    { id: 'lifecycle', header: 'LIFECYCLE', width: '2.6fr', render: (container) => <ActionButtonGroup actions={lifecycleActionsFor(container)} /> },
  ];

  const filtered = containers.filter((container) => matchesStateFilter(container, stateFilter) && matchesSearch(container, search));
  const hasStoppedContainers = containers.some((container) => (STOPPED_STATES as string[]).includes(container.state));

  return (
    <Stack gap="var(--space-4)">
      <ScreenToolbar
        destructiveAction={{ label: 'Prune stopped', onClick: handlePruneStopped, disabled: !hasStoppedContainers }}
        filters={
          <>
            <SearchField value={search} onChange={setSearch} placeholder="Search name, image or state…" />
            <FilterChips options={STATE_FILTER_OPTIONS} activeId={stateFilter} onSelect={setStateFilter} />
          </>
        }
      />
      {error ? <ErrorBanner title="Could not load containers" detail={error} onRetry={onRefresh} /> : null}
      <Card>
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
              description={loaded ? 'Try a different search or filter.' : undefined}
            />
          }
        />
      </Card>
    </Stack>
  );
}
