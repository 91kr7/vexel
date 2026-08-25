import type { ReactNode } from 'react';
import {
  ActionButtonGroup,
  Badge,
  Card,
  Chip,
  FieldMessage,
  IdentifierCell,
  MetricStrip,
  Row,
  SectionHeader,
  StatusDotCell,
  Stack,
  type MenuEntry,
  type MetricStripColumn,
  type MetricStripReadings,
  type RowAction,
  type StatusTone,
} from '../ui';
import type { ContainerPort, ContainerState, ContainerSummary } from '../data/containers-client';

export interface ContainerCardProps {
  container: ContainerSummary;
  /** The first slot's action, then `Pause` and `Restart`, in that order — the card's three lifecycle slots. */
  lifecycleActions: RowAction[];
  /** The entries of the trailing overflow menu, in their order. */
  overflowEntries: MenuEntry[];
  selected: boolean;
  onSelect: () => void;
  /** Rendered in the name's place while this container is being renamed. */
  renameControl?: ReactNode;
}

/**
 * The one rule that maps a container's state to a colour, so the dot, the pill,
 * the accent edge and the metric fills cannot disagree — and so a state the mock
 * never drew still gets all four: `created`, `restarting`, `removing` and `dead`
 * are read here by the same rule as the three it did draw. The tone is the
 * library's `StatusTone`, which every one of those four consumers accepts as it
 * stands.
 */
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
 * How many port chips a card shows before the rest become a count. The card
 * stands in a grid three to a row, and every card of a row is as tall as the
 * tallest: one container publishing a dozen ports would otherwise set the
 * height of every card beside it.
 */
const PORTS_SHOWN = 3;

/**
 * The ports the card draws, worded exactly as the delivered list worded them:
 * `publicPort→privatePort` where the port is published, the bare `privatePort`
 * where it is only exposed. Both kinds, because no value the row showed may
 * disappear from the card (plan-docker_management_app-containers_card_view/REQ-12).
 *
 * Past `PORTS_SHOWN` the remainder becomes one `+n` chip rather than more lines.
 * The full set stays a click away in the detail panel, so nothing is lost —
 * only moved. Splitting at `PORTS_SHOWN + 1` rather than at `PORTS_SHOWN` keeps
 * the degenerate `+1` from ever being drawn: a fourth chip costs exactly what
 * the chip announcing it would.
 */
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
    // The percentage the daemon reports is measured across every online CPU, so
    // full is `cores × 100%` — which is what the note beside it states.
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

/**
 * One container as one card: identity and actions, then provenance, then
 * metrics — three bands in that order, in every state.
 *
 * The card owns none of its own material: the box, its hover and selected
 * highlights and the state accent down its left edge are the library `Card`'s,
 * which takes them from the object table's own tokens. What this file decides is
 * which container state maps to which tone, and how a figure is worded.
 */
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
  const ports = portEntries(container.ports);

  return (
    <Card accent={tone} selected={selected} onSelect={onSelect}>
      <Stack gap="var(--space-3)">
        <Row gap="var(--space-4)" align="center" justify="between" wrap>
          <Row gap="var(--space-3)" align="center" wrap>
            {/* `SectionHeader` is the library's only heading treatment and says so:
                the container's name is this card's title. */}
            <StatusDotCell tone={tone} />
            {renameControl ?? <SectionHeader title={container.name} />}
            <Badge tone={tone}>{container.state.toUpperCase()}</Badge>
            <IdentifierCell value={container.shortId} />
          </Row>
          <Row gap="var(--space-4)" align="center">
            {primaryAction ? <ActionButtonGroup actions={[primaryAction]} /> : null}
            <ActionButtonGroup
              segmented
              actions={clusterActions}
              overflow={{ label: `More actions for ${container.name}`, entries: overflowEntries }}
            />
          </Row>
        </Row>

        <Row gap="var(--space-3)" align="center" wrap>
          <Chip prefix="image" label={container.image} />
          {ports.map((port) => (
            <Chip key={port.key} label={port.label} tone="accent" />
          ))}
          {/* The library's one muted plain-text line. Named for form fields, but
              that is its treatment rather than its subject, and a near-duplicate of
              it would be the thing REQ-30 refuses. */}
          <FieldMessage tone="muted">{container.status}</FieldMessage>
        </Row>

        {/* Stacked, against the mock's row of three: the card stands in a grid
            three to a row, and three columns side by side in a third of the
            page leave no width to read a value in. */}
        <MetricStrip
          stacked
          columns={[cpuColumn(container, tone), memoryColumn(container, tone)]}
          readings={networkReadings(container)}
        />
      </Stack>
    </Card>
  );
}
