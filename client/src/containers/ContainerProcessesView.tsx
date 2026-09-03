import { useMemo } from 'react';
import {
  BandStack,
  Button,
  DataTable,
  EmptyState,
  ErrorBanner,
  LOAD_ATTENTION_PERCENT,
  MetaCell,
  Row,
  Spacer,
  type DataTableColumn,
} from '../ui';
import { useContainerProcesses } from '../data/use-container-processes';
import type { ContainerProcess } from '../data/container-stats-client';
import type { ContainerSummary } from '../data/containers-client';

export interface ContainerProcessesViewProps {
  container: ContainerSummary;
}

/** The daemon's own running set, as the stats view streams for: a paused container still has processes. */
const RUNNING_STATES = new Set(['running', 'paused', 'restarting']);

function formatPercent(value: number | undefined): string {
  return value === undefined ? '–' : `${value}%`;
}

/**
 * The processes running inside a container (REQ-33): pid, user and command, followed on the
 * detail's own clock while this view is the tab on screen
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-27).
 */
export function ContainerProcessesView({ container }: ContainerProcessesViewProps) {
  const { processes, loaded, loading, error, refresh } = useContainerProcesses(container.id, { running: RUNNING_STATES.has(container.state) });

  const columns = useMemo<DataTableColumn<ContainerProcess>[]>(
    () => [
      { id: 'pid', header: 'PID', width: '80px', render: (process) => <MetaCell>{process.pid}</MetaCell> },
      { id: 'user', header: 'User', width: '140px', render: (process) => <MetaCell>{process.user || '–'}</MetaCell> },
      // The same track as the `minmax(240px, 3fr)` written here before, in the
      // two props the API states it with — the column contract builds the
      // `minmax()` itself, so a hand-written one is a second way to say it and
      // the only form that could smuggle an intrinsic bound past the type.
      { id: 'command', header: 'Command', width: '3fr', minWidth: '240px', render: (process) => <MetaCell>{process.command || '–'}</MetaCell> },
      {
        id: 'cpu',
        header: '%CPU',
        width: '90px',
        align: 'end',
        // The one column that is toned, and the threshold is the library's own
        // (tabs_composition_refactor/REQ-33): a reading at or above it is the
        // process worth looking at in a list of twenty-seven. Where the daemon
        // reports nothing there is no reading to distinguish, so the dash is
        // drawn exactly as every other missing value is.
        render: (process) => (
          <MetaCell tone={process.cpuPercent !== undefined && process.cpuPercent >= LOAD_ATTENTION_PERCENT ? 'attention' : undefined}>
            {formatPercent(process.cpuPercent)}
          </MetaCell>
        ),
      },
      { id: 'memory', header: '%MEM', width: '90px', align: 'end', render: (process) => <MetaCell>{formatPercent(process.memoryPercent)}</MetaCell> },
    ],
    [],
  );

  /*
    The count and the refresh are a band of their own height; the table is the region that takes
    what the tab has left, and scrolls and virtualises inside it
    (tabs_composition_refactor/REQ-32). Nothing here states a height: the 320px this view used to
    pin was a measure of the inline panel it was born in, and inside the dialog it left half the
    surface empty under a list scrolling through a third of it.
  */
  return (
    <BandStack
      bands={[
        <Row key="summary" align="center">
          <MetaCell>{loaded && !error ? `${processes.length} process${processes.length === 1 ? '' : 'es'}` : ' '}</MetaCell>
          <Spacer />
          <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </Row>,
        error ? <ErrorBanner key="error" title="Could not list the container processes" detail={error} onRetry={refresh} /> : null,
      ]}
      fill={
        error ? null : (
          <DataTable
            columns={columns}
            rows={processes}
            rowKey={(process) => String(process.pid)}
            rowHeight={40}
            fill
            emptyState={<EmptyState title={loaded ? 'No process is running in this container' : 'Reading the process list…'} description={null} action={null} />}
          />
        )
      }
    />
  );
}
