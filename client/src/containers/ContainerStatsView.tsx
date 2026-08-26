import { useMemo } from 'react';
import { EmptyState, ErrorBanner, Grid, MetricReadingPair, MetricTile, Meter, Sparkline, Stack, type MetricTone } from '../ui';
import { useContainerStats } from '../data/use-container-stats';
import type { ContainerSummary } from '../data/containers-client';

export interface ContainerStatsViewProps {
  container: ContainerSummary;
}

const STREAMING_STATES = new Set(['running', 'paused', 'restarting']);

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
  if (bytes < 1024) return `${Math.round(bytes)}B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)}${units[unitIndex]}`;
}

function formatPercent(percent: number): string {
  return `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`;
}

function loadTone(percent: number): MetricTone {
  if (percent >= 90) return 'danger';
  if (percent >= 70) return 'warning';
  return 'neutral';
}

/**
 * A container's live resource usage (REQ-32): CPU, memory, network and block
 * I/O readings that keep updating while the view is open, each with the recent
 * history of the metric.
 *
 * Two groups rather than one row of five (REQ-13): CPU and Memory have a
 * ceiling and keep their meter (REQ-14); Net I/O, Block I/O and PIDs are
 * cumulative counters with no maximum in principle, so they carry no bar at
 * all — not even the meter's no-measurable-maximum state — and tell their story
 * with their history instead (REQ-15). Each of those three plots the one series
 * it is named for, not the two summed, and shows its two directions as two
 * labelled readings (REQ-17). This supersedes
 * plan-ui-coherence-optimisation/REQ-63 and REQ-64.
 */
export function ContainerStatsView({ container }: ContainerStatsViewProps) {
  const streamable = STREAMING_STATES.has(container.state);
  const { latest, samples, error, restart } = useContainerStats(container.id, { enabled: streamable });

  const cpuHistory = useMemo(() => samples.map((sample) => sample.cpuPercent), [samples]);
  const memoryHistory = useMemo(() => samples.map((sample) => sample.memoryUsageBytes), [samples]);
  const networkInHistory = useMemo(() => samples.map((sample) => sample.networkRxBytes), [samples]);
  const blockReadHistory = useMemo(() => samples.map((sample) => sample.blockReadBytes), [samples]);
  const pidsHistory = useMemo(() => samples.map((sample) => sample.pids), [samples]);

  if (!streamable) {
    return <EmptyState title="No live statistics" description={`${container.name} is ${container.state}: the daemon reports resource usage only while a container is up.`}  action={null} />;
  }

  return (
    <Stack gap="var(--space-4)">
      {error ? <ErrorBanner title="Could not stream the container statistics" detail={error} onRetry={restart} /> : null}
      {!latest ? (
        <EmptyState title="Waiting for the first sample…"  description={null} action={null} />
      ) : (
        <Stack gap="var(--space-4)">
          <Grid arrangement="even-row">
            <MetricTile label="CPU" value={formatPercent(latest.cpuPercent)} subLabel="of all available cores" tone={loadTone(latest.cpuPercent)}>
              <Stack gap="var(--space-2)">
                <Meter value={latest.cpuPercent} max={100} tone={loadTone(latest.cpuPercent)} ariaLabel="CPU usage" />
                <Sparkline values={cpuHistory} max={100} tone={loadTone(latest.cpuPercent)} ariaLabel="Recent CPU usage" />
              </Stack>
            </MetricTile>

            <MetricTile
              label="Memory"
              value={formatBytes(latest.memoryUsageBytes)}
              subLabel={latest.memoryLimitBytes > 0 ? `of ${formatBytes(latest.memoryLimitBytes)} · ${formatPercent(latest.memoryPercent)}` : 'no limit set'}
              tone={latest.memoryLimitBytes > 0 ? loadTone(latest.memoryPercent) : 'neutral'}
            >
              <Stack gap="var(--space-2)">
                <Meter
                  value={latest.memoryUsageBytes}
                  max={latest.memoryLimitBytes > 0 ? latest.memoryLimitBytes : undefined}
                  tone={latest.memoryLimitBytes > 0 ? loadTone(latest.memoryPercent) : 'neutral'}
                  ariaLabel="Memory usage"
                />
                <Sparkline
                  values={memoryHistory}
                  max={latest.memoryLimitBytes > 0 ? latest.memoryLimitBytes : undefined}
                  tone={latest.memoryLimitBytes > 0 ? loadTone(latest.memoryPercent) : 'neutral'}
                  ariaLabel="Recent memory usage"
                />
              </Stack>
            </MetricTile>
          </Grid>

          <Grid arrangement="even-row">
            <MetricTile
              label="Net I/O"
              value={
                <MetricReadingPair
                  readings={[
                    { value: formatBytes(latest.networkRxBytes), label: 'in' },
                    { value: formatBytes(latest.networkTxBytes), label: 'out' },
                  ]}
                />
              }
              subLabel="since start"
            >
              <Sparkline values={networkInHistory} tone="neutral" ariaLabel="Recent inbound network traffic" />
            </MetricTile>

            <MetricTile
              label="Block I/O"
              value={
                <MetricReadingPair
                  readings={[
                    { value: formatBytes(latest.blockReadBytes), label: 'read' },
                    { value: formatBytes(latest.blockWriteBytes), label: 'written' },
                  ]}
                />
              }
              subLabel="since start"
            >
              <Sparkline values={blockReadHistory} tone="neutral" ariaLabel="Recent block reads" />
            </MetricTile>

            <MetricTile label="PIDs" value={String(latest.pids)} subLabel="processes and threads">
              <Sparkline values={pidsHistory} tone="neutral" ariaLabel="Recent PID count" />
            </MetricTile>
          </Grid>
        </Stack>
      )}
    </Stack>
  );
}
