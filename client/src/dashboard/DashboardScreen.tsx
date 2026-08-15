import {
  Card,
  DashboardLayout,
  DataTable,
  EmptyState,
  ErrorBanner,
  EventStream,
  MetaCell,
  MetricTile,
  SectionHeader,
  Stack,
  StatusDotCell,
  UsageBreakdown,
  type DataTableColumn,
  type StatusTone,
  type UsageBreakdownItem,
} from '../ui';
import type { ContainerState, ContainerSummary } from '../data/containers-client';
import type { DiskUsageTotalCategoryId } from '../data/system-client';
import { useSystemOverview } from '../data/use-system-overview';
import { useDaemonEventStream } from '../shell/services/EventStreamService';
import { useCrossNavigation } from '../shell/services/CrossNavigationService';

export interface DashboardScreenProps {
  /** The live container list, shared with the rest of the shell rather than read a second time here. */
  containers: ContainerSummary[];
  containersLoaded: boolean;
  containersError?: string;
  onRefreshContainers: () => void;
}

/** The screen that owns each kind of object a dashboard row or tile can lead to (REQ-18). */
const OWNER_SCREEN: Record<DiskUsageTotalCategoryId, string> = {
  images: 'images-layers',
  containers: 'containers',
  volumes: 'volumes-networks',
  'build-cache': 'builders-cache',
};

const DISK_USAGE_LABELS: Record<DiskUsageTotalCategoryId, string> = {
  images: 'Images',
  containers: 'Containers',
  volumes: 'Volumes',
  'build-cache': 'Build cache',
};

/** Running containers first: they are what an operator looks at a dashboard for. */
const STATE_ORDER: ContainerState[] = ['running', 'paused', 'restarting', 'created', 'removing', 'exited', 'dead'];

const STATE_TONE: Record<ContainerState, StatusTone> = {
  running: 'success',
  paused: 'warning',
  restarting: 'warning',
  created: 'neutral',
  removing: 'neutral',
  exited: 'neutral',
  dead: 'danger',
};

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

/**
 * The daemon's own uptime text, which it reports as "Up 3 days"; only a
 * running container has one, and nothing is invented for the others.
 */
function uptimeLabel(container: ContainerSummary): string {
  if (container.state !== 'running') return '';
  const match = container.status.match(/^Up\s+(.*)$/);
  return match ? match[1] : container.status;
}

function cpuLabel(container: ContainerSummary): string {
  return container.cpuPercent === undefined ? '' : `${container.cpuPercent.toFixed(0)}% cpu`;
}

/**
 * The Dashboard (REQ-14, REQ-15, REQ-16, REQ-17, REQ-18): five summary tiles
 * over the live container activity, the disk-usage breakdown and the daemon
 * event stream — every tile and every row leading to the screen that owns
 * what it names.
 *
 * The counts and sizes come from one server-side reading, so no two tiles can
 * disagree; the activity list and the event feed come from the live sources
 * the rest of the application already follows.
 */
export function DashboardScreen({ containers, containersLoaded, containersError, onRefreshContainers }: DashboardScreenProps) {
  const { overview, loaded, error, refresh } = useSystemOverview();
  const { events } = useDaemonEventStream();
  const { navigateTo } = useCrossNavigation();

  const activity = [...containers].sort((left, right) => {
    const byState = STATE_ORDER.indexOf(left.state) - STATE_ORDER.indexOf(right.state);
    return byState !== 0 ? byState : left.name.localeCompare(right.name);
  });

  const activityColumns: DataTableColumn<ContainerSummary>[] = [
    {
      id: 'name',
      header: 'Container',
      render: (container) => <StatusDotCell tone={STATE_TONE[container.state]} label={container.name} />,
    },
    {
      id: 'state',
      header: 'State',
      width: '110px',
      align: 'end',
      render: (container) => <MetaCell>{container.state}</MetaCell>,
    },
    {
      id: 'cpu',
      header: 'CPU',
      width: '110px',
      align: 'end',
      render: (container) => <MetaCell>{cpuLabel(container)}</MetaCell>,
    },
    {
      id: 'uptime',
      header: 'Uptime',
      width: '140px',
      align: 'end',
      render: (container) => <MetaCell>{uptimeLabel(container)}</MetaCell>,
    },
  ];

  const diskUsageItems: UsageBreakdownItem[] = (overview?.diskUsage.categories ?? []).map((entry) => ({
    id: entry.id,
    label: DISK_USAGE_LABELS[entry.id],
    value: entry.sizeBytes,
    valueLabel: entry.unavailableDetail ? 'unavailable' : formatBytes(entry.sizeBytes),
    onActivate: () => navigateTo({ screenId: OWNER_SCREEN[entry.id] }),
    ariaLabel: `${DISK_USAGE_LABELS[entry.id]} — open the screen that owns it`,
  }));

  const eventEntries = events.map((event) => ({
    id: event.id,
    timestamp: new Date(event.timestamp).toLocaleTimeString([], { hour12: false }),
    type: event.type,
    action: event.action,
    summary: event.actor,
  }));

  const stacks = overview?.stacks;
  const buildCache = overview?.buildCache;

  return (
    <Stack gap="var(--space-5)">
      {error ? <ErrorBanner title="Could not read the daemon overview" detail={error} onRetry={refresh} /> : null}
      {containersError ? (
        <ErrorBanner title="Could not read the container list" detail={containersError} onRetry={onRefreshContainers} />
      ) : null}

      <DashboardLayout
        tiles={
          <>
            <MetricTile
              surface
              label="Running"
              value={overview ? String(overview.containers.running) : '—'}
              subLabel={overview ? `${overview.containers.stopped + overview.containers.paused} stopped / paused` : 'reading…'}
              tone="success"
              onActivate={() => navigateTo({ screenId: 'containers' })}
              ariaLabel="Running containers — open the Containers screen"
            />
            <MetricTile
              surface
              label="Images"
              value={overview ? String(overview.images.count) : '—'}
              subLabel={overview ? `${formatBytes(overview.images.sizeBytes)} on disk` : 'reading…'}
              onActivate={() => navigateTo({ screenId: 'images-layers' })}
              ariaLabel="Images — open the Images & layers screen"
            />
            <MetricTile
              surface
              label="Volumes"
              value={overview ? String(overview.volumes.count) : '—'}
              subLabel={overview ? `${formatBytes(overview.volumes.sizeBytes)} on disk` : 'reading…'}
              onActivate={() => navigateTo({ screenId: 'volumes-networks' })}
              ariaLabel="Volumes — open the Volumes & networks screen"
            />
            <MetricTile
              surface
              label="Stacks"
              value={stacks ? String(stacks.total) : '—'}
              subLabel={
                stacks
                  ? stacks.swarmUnavailableDetail
                    ? `${stacks.compose} compose · no swarm`
                    : `${stacks.compose} compose · ${stacks.swarm} swarm`
                  : 'reading…'
              }
              onActivate={() => navigateTo({ screenId: 'compose' })}
              ariaLabel="Stacks — open the Compose screen"
            />
            <MetricTile
              surface
              label="Build cache"
              value={buildCache && !buildCache.unavailableDetail ? formatBytes(buildCache.sizeBytes) : '—'}
              subLabel={
                buildCache
                  ? buildCache.unavailableDetail
                    ? 'buildx unavailable'
                    : `buildx: ${buildCache.activeBuilder ?? 'no active builder'}`
                  : 'reading…'
              }
              onActivate={() => navigateTo({ screenId: 'builders-cache' })}
              ariaLabel="Build cache — open the Builders & cache screen"
            />
          </>
        }
        primary={
          <Card padding="md">
            <Stack gap="var(--space-3)">
              <SectionHeader title="Container activity" description="State, CPU and uptime, refreshed live" />
              <DataTable
                columns={activityColumns}
                rows={activity}
                rowKey={(container) => container.id}
                rowHeight={44}
                maxHeight="320px"
                hideHeader
                onRowSelect={() => navigateTo({ screenId: 'containers' })}
                emptyState={<EmptyState title={containersLoaded ? 'No container on this daemon' : 'Reading the containers…'}  description={null} action={null} />}
              />
            </Stack>
          </Card>
        }
        secondary={
          <Card padding="md">
            <Stack gap="var(--space-4)">
              <SectionHeader
                title="Disk usage"
                description={overview ? `${formatBytes(overview.diskUsage.totalBytes)} in total` : undefined}
              />
              <UsageBreakdown
                items={diskUsageItems}
                total={overview?.diskUsage.totalBytes}
                emptyState={<EmptyState title={loaded ? 'The daemon reported no disk usage' : 'Reading the disk usage…'}  description={null} action={null} />}
              />
            </Stack>
          </Card>
        }
        footer={
          <Card padding="md">
            <Stack gap="var(--space-3)">
              <SectionHeader title="Daemon event stream" description="The most recent events the daemon reported" />
              <EventStream entries={eventEntries} emptyLabel="No daemon events yet." maxHeight="220px" />
            </Stack>
          </Card>
        }
      />
    </Stack>
  );
}
