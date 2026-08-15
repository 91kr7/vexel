import { useMemo } from 'react';
import { Button, DataTable, EmptyState, ErrorBanner, MetaCell, Row, Spacer, Stack, type DataTableColumn } from '../ui';
import { useContainerProcesses } from '../data/use-container-processes';
import type { ContainerProcess } from '../data/container-stats-client';
import type { ContainerSummary } from '../data/containers-client';

export interface ContainerProcessesViewProps {
  container: ContainerSummary;
}

const MAX_TABLE_HEIGHT = '320px';

function formatPercent(value: number | undefined): string {
  return value === undefined ? '–' : `${value}%`;
}

/**
 * The processes running inside a container (REQ-33): pid, user and command,
 * read once when the view opens and re-read only on demand.
 */
export function ContainerProcessesView({ container }: ContainerProcessesViewProps) {
  const { processes, loaded, loading, error, refresh } = useContainerProcesses(container.id);

  const columns = useMemo<DataTableColumn<ContainerProcess>[]>(
    () => [
      { id: 'pid', header: 'PID', width: '80px', render: (process) => <MetaCell>{process.pid}</MetaCell> },
      { id: 'user', header: 'User', width: '140px', render: (process) => <MetaCell>{process.user || '–'}</MetaCell> },
      { id: 'command', header: 'Command', width: 'minmax(240px, 3fr)', render: (process) => <MetaCell>{process.command || '–'}</MetaCell> },
      { id: 'cpu', header: '%CPU', width: '90px', align: 'end', render: (process) => <MetaCell>{formatPercent(process.cpuPercent)}</MetaCell> },
      { id: 'memory', header: '%MEM', width: '90px', align: 'end', render: (process) => <MetaCell>{formatPercent(process.memoryPercent)}</MetaCell> },
    ],
    [],
  );

  return (
    <Stack gap="var(--space-3)">
      <Row align="center">
        <MetaCell>{loaded && !error ? `${processes.length} process${processes.length === 1 ? '' : 'es'}` : ' '}</MetaCell>
        <Spacer />
        <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </Row>
      {error ? <ErrorBanner title="Could not list the container processes" detail={error} onRetry={refresh} /> : null}
      {!error ? (
        <DataTable
          columns={columns}
          rows={processes}
          rowKey={(process) => String(process.pid)}
          rowHeight={40}
          maxHeight={MAX_TABLE_HEIGHT}
          emptyState={<EmptyState title={loaded ? 'No process is running in this container' : 'Reading the process list…'}  description={null} action={null} />}
        />
      ) : null}
    </Stack>
  );
}
