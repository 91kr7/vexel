import { useMemo } from 'react';
import { EmptyState, ErrorBanner, Grid, MetricTile, Meter, Sparkline, Stack, type MetricTone } from '../ui';
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
 * Five tiles in five tracks (plan-ui-coherence-optimisation/REQ-63) — the
 * delivered grid fitted four and left `PIDS` alone on a second row — and all
 * five built the same way, meter included (REQ-64): the three metrics with no
 * ceiling get the meter's no-measurable-maximum state rather than no meter,
 * which is what made a fact about the metric look like a bar that failed.
 */
export function ContainerStatsView({ container }: ContainerStatsViewProps) {
  const streamable = STREAMING_STATES.has(container.state);
  const { latest, samples, error, restart } = useContainerStats(container.id, { enabled: streamable });

  const cpuHistory = useMemo(() => samples.map((sample) => sample.cpuPercent), [samples]);
  const memoryHistory = useMemo(() => samples.map((sample) => sample.memoryUsageBytes), [samples]);
  const networkHistory = useMemo(() => samples.map((sample) => sample.networkRxBytes + sample.networkTxBytes), [samples]);
  const blockHistory = useMemo(() => samples.map((sample) => sample.blockReadBytes + sample.blockWriteBytes), [samples]);
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

          <MetricTile
            label="Net I/O"
            value={`${formatBytes(latest.networkRxBytes)} / ${formatBytes(latest.networkTxBytes)}`}
            subLabel="received / sent since start"
          >
            <Stack gap="var(--space-2)">
              <Meter value={latest.networkRxBytes + latest.networkTxBytes} tone="neutral" ariaLabel="Network I/O" />
              <Sparkline values={networkHistory} tone="neutral" ariaLabel="Recent network I/O" />
            </Stack>
          </MetricTile>

          <MetricTile
            label="Block I/O"
            value={`${formatBytes(latest.blockReadBytes)} / ${formatBytes(latest.blockWriteBytes)}`}
            subLabel="read / written since start"
          >
            <Stack gap="var(--space-2)">
              <Meter value={latest.blockReadBytes + latest.blockWriteBytes} tone="neutral" ariaLabel="Block I/O" />
              <Sparkline values={blockHistory} tone="neutral" ariaLabel="Recent block I/O" />
            </Stack>
          </MetricTile>

          <MetricTile label="PIDs" value={String(latest.pids)} subLabel="processes and threads">
            <Stack gap="var(--space-2)">
              <Meter value={latest.pids} tone="neutral" ariaLabel="PIDs" />
              <Sparkline values={pidsHistory} tone="neutral" ariaLabel="Recent PID count" />
            </Stack>
          </MetricTile>
        </Grid>
      )}
    </Stack>
  );
}
