import type { ReactNode } from 'react';
import {
  ActionButtonGroup,
  Badge,
  Card,
  Chip,
  FieldMessage,
  IconButton,
  IdentifierCell,
  MetricStrip,
  Row,
  SectionHeader,
  StatusDotCell,
  Stack,
  type MenuEntry,
  type MetricStripColumn,
  type MetricStripReadings,
  type MetricStripRow,
  type RowAction,
  type StatusTone,
} from '../ui';
import type { ContainerPort, ContainerState, ContainerSummary } from '../data/containers-client';

export interface ContainerCardProps {
  container: ContainerSummary;
  /** The first slot's action, then `Pause` and `Restart`, in that order. */
  lifecycleActions: RowAction[];
  /** The entries of the trailing overflow menu, in their order. */
  overflowEntries: MenuEntry[];
  selected: boolean;
  onSelect: () => void;
  /** Rendered in the name's place while this container is being renamed. */
  renameControl?: ReactNode;
}

// The one rule the dot, the pill, the accent edge and the metric fills all read.
const STATE_TONE: Record<ContainerState, StatusTone> = {
  created: 'neutral',
  running: 'success',
  paused: 'warning',
  restarting: 'warning',
  removing: 'neutral',
  exited: 'neutral',
  dead: 'danger',
};

const NET_IO_LABEL = 'NET I/O';
const PORTS_LABEL = 'PORTS';
const NO_PORTS_LABEL = 'none';
const OPEN_DETAIL_GLYPH = '↗';

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

// Two is measured, not preferred: a third chip wraps the row at the delivered
// track width. Splitting one later keeps a degenerate `+1` from being drawn.
const PORTS_SHOWN = 2;

function portEntries(ports: ContainerPort[]): { key: string; label: string }[] {
  const entries = ports.map((port) => ({
    key: `${port.type}-${port.publicPort ?? ''}-${port.privatePort}`,
    label: port.publicPort === undefined ? `${port.privatePort}` : `${port.publicPort}→${port.privatePort}`,
  }));
  if (entries.length <= PORTS_SHOWN + 1) return entries;
  return [...entries.slice(0, PORTS_SHOWN), { key: 'more', label: `+${entries.length - PORTS_SHOWN}` }];
}

function cpuColumn(container: ContainerSummary, tone: StatusTone): MetricStripColumn {
  const cores = container.onlineCpus;
  if (container.cpuPercent === undefined) return { id: 'cpu', label: 'CPU', value: 0, noSample: true, tone };
  return {
    id: 'cpu',
    label: 'CPU',
    valueText: `${container.cpuPercent.toFixed(1)}%`,
    // The daemon measures the percentage across every online CPU: full is `cores × 100`.
    value: container.cpuPercent,
    max: cores === undefined ? undefined : cores * 100,
    reading: cores === undefined ? undefined : `of ${cores} core${cores === 1 ? '' : 's'}`,
    tone,
  };
}

function memoryColumn(container: ContainerSummary, tone: StatusTone): MetricStripColumn {
  const limit = container.memoryLimitBytes;
  if (container.memoryUsageBytes === undefined) return { id: 'memory', label: 'MEMORY', value: 0, noSample: true, tone };
  return {
    id: 'memory',
    label: 'MEMORY',
    valueText: formatBytes(container.memoryUsageBytes),
    value: container.memoryUsageBytes,
    max: limit !== undefined && limit > 0 ? limit : undefined,
    reading: limit !== undefined && limit > 0 ? `of ${formatBytes(limit)}` : undefined,
    tone,
  };
}

function networkReadings(container: ContainerSummary): MetricStripReadings {
  const read = (bytes?: number) => (bytes === undefined ? '—' : formatBytes(bytes));
  return {
    label: NET_IO_LABEL,
    items: [
      { id: 'in', label: 'in', value: read(container.networkRxBytes) },
      { id: 'out', label: 'out', value: read(container.networkTxBytes) },
    ],
  };
}

function portsRow(ports: ContainerPort[]): MetricStripRow {
  const entries = portEntries(ports);
  return {
    id: 'ports',
    label: PORTS_LABEL,
    content:
      entries.length === 0 ? (
        <Chip label={NO_PORTS_LABEL} />
      ) : (
        entries.map((port) => <Chip key={port.key} label={port.label} tone="accent" />)
      ),
  };
}

/** One container as one card: identity, state, image, live metrics, then the actions in a footer. */
export function ContainerCard({
  container,
  lifecycleActions,
  overflowEntries,
  selected,
  onSelect,
  renameControl,
}: ContainerCardProps) {
  const tone = STATE_TONE[container.state];
  const [primaryAction, ...clusterActions] = lifecycleActions;

  return (
    <Card
      padding="md"
      accent={tone}
      selected={selected}
      onSelect={onSelect}
      footer={
        <Row gap="var(--space-4)" align="center" justify="between" wrap>
          {primaryAction ? <ActionButtonGroup size="md" actions={[primaryAction]} /> : null}
          <ActionButtonGroup
            segmented
            size="md"
            actions={clusterActions}
            overflow={{ label: `More actions for ${container.name}`, entries: overflowEntries }}
          />
        </Row>
      }
    >
      <Stack gap="var(--space-3)">
        <Row truncating gap="var(--space-3)" align="center" justify="between">
          <Row gap="var(--space-3)" align="center">
            <StatusDotCell tone={tone} />
            {renameControl ?? <SectionHeader title={container.name} truncate />}
          </Row>
          <Row gap="var(--space-3)" align="center">
            <IdentifierCell value={container.shortId} />
            {/* Inert by decision, not by omission: its click arrives with the modal
                detail (container-card.md). The row swallows it meanwhile. */}
            <Row onClick={(event) => event.stopPropagation()}>
              <IconButton size="sm" label={`Open ${container.name} details`}>
                {OPEN_DETAIL_GLYPH}
              </IconButton>
            </Row>
          </Row>
        </Row>

        <Row gap="var(--space-3)" align="center" wrap>
          <Badge tone={tone}>{container.state.toUpperCase()}</Badge>
          <FieldMessage tone="muted">{container.status}</FieldMessage>
        </Row>

        {/* Truncating at the front: the registry host gives way, `name:tag` stays. */}
        <Chip block prefix="image" label={container.image} truncate="start" />

        <MetricStrip
          stacked
          columns={[cpuColumn(container, tone), memoryColumn(container, tone)]}
          readings={networkReadings(container)}
          rows={[portsRow(container.ports)]}
        />
      </Stack>
    </Card>
  );
}
