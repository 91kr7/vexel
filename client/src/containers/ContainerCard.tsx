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
const PORTS_LABEL = 'PORTS';
/** What the PORTS row reads when the container reports no port at all: the row keeps its shape, and says so. */
const NO_PORTS_LABEL = 'none';
/** The glyph of the control that will open the container's detail in a modal. */
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

/**
 * How many port chips a card shows before the rest become a count. **Two, and
 * that is a measurement rather than a preference**: the row must be drawn on one
 * line at the delivered track width (379px at a 1480px viewport), and three
 * chips plus the `+n` overflowed onto a second one. A label-anchored row that
 * keeps its shape whatever the container publishes is the whole reason the ports
 * sit among the metrics, and a row that grows a line is that reason lost — and,
 * with a card as tall as the tallest of its row, a line every card beside it
 * pays for.
 */
const PORTS_SHOWN = 2;

/**
 * The ports the card draws, worded exactly as the delivered list worded them:
 * `publicPort→privatePort` where the port is published, the bare `privatePort`
 * where it is only exposed. Both kinds, because no value the row showed may
 * disappear from the card (plan-docker_management_app-containers_card_view/REQ-12).
 *
 * Past `PORTS_SHOWN` the remainder becomes one `+n` chip rather than more chips
 * wrapping the row onto further lines. The full set stays a click away in the
 * detail panel, so nothing is lost — only moved. Splitting at `PORTS_SHOWN + 1`
 * rather than at `PORTS_SHOWN` keeps the degenerate `+1` from ever being drawn:
 * one more chip costs exactly what the chip announcing it would, and three chips
 * still fit the line.
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
 * The ports as a row of the metric strip rather than a fact about provenance:
 * the image says what the container is made of, the ports say how it is
 * reached, which is operational and of a kind with the metrics beside it. The
 * label anchors the row, so a container with one port and one with four keep
 * the same shape.
 */
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

/**
 * One container as one card: identity, then state and how long it has held,
 * then the image, then the live metrics, then the actions in a footer of their
 * own — in that order, in every state.
 *
 * The card owns none of its own material: the box, its hover and selected
 * highlights, the state accent down its left edge and the footer's ground are
 * the library `Card`'s, which takes them from the object table's own tokens.
 * What this file decides is which container state maps to which tone, and how a
 * figure is worded.
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

  return (
    <Card
      /* The mock's inset, not the library's largest: a card at a third of the
         page reads as controls adrift in empty space at `lg` (32px, 8.4% of the
         card's own width against the mock's 4.9%). `md` is the nearest step of
         the library's own scale. */
      padding="md"
      accent={tone}
      selected={selected}
      onSelect={onSelect}
      footer={
        /* Read and act are two gestures: the actions close the card in a band
           of their own instead of interrupting the description. Primary
           lifecycle action at the left, the segmented cluster at the right.

           At the library's ordinary button size, not a list row's `sm`: these
           controls close a card rather than end a row, and the mock draws them
           at that weight. */
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
        {/* Name at the left, identifier anchored at the right: the name gives
            way with an ellipsis, the id never does. */}
        <Row truncating gap="var(--space-3)" align="center" justify="between">
          <Row gap="var(--space-3)" align="center">
            {/* `SectionHeader` is the library's only heading treatment and says so:
                the container's name is this card's title. */}
            <StatusDotCell tone={tone} />
            {renameControl ?? <SectionHeader title={container.name} truncate />}
          </Row>
          <Row gap="var(--space-3)" align="center">
            <IdentifierCell value={container.shortId} />
            {/* **This control does nothing when clicked, deliberately.** Chosen
                by the human on 2026-08-25: it is present and inert — not
                disabled — and the click arrives with the intervention that moves
                the container's detail into a modal and removes the inline
                panel. Wiring it to today's inline detail, and shipping it
                visibly disabled, were both offered and refused. It is not a
                defect, and "fixing" it here is how that decision gets undone.
                The row around it swallows the click so the card's own selection
                gesture is not triggered by a control that means something else. */}
            <Row onClick={(event) => event.stopPropagation()}>
              <IconButton size="sm" label={`Open ${container.name} details`}>
                {OPEN_DETAIL_GLYPH}
              </IconButton>
            </Row>
          </Row>
        </Row>

        {/* The state and how long it has held, as one sentence: the uptime
            belongs to the state, not among the provenance of the image. */}
        <Row gap="var(--space-3)" align="center" wrap>
          <Badge tone={tone}>{container.state.toUpperCase()}</Badge>
          {/* The library's one muted plain-text line. Named for form fields, but
              that is its treatment rather than its subject, and a near-duplicate of
              it would be the thing REQ-30 refuses. */}
          <FieldMessage tone="muted">{container.status}</FieldMessage>
        </Row>

        {/* A line of its own, truncating at the front: the registry host is the
            sacrificial half of a long reference, `name:tag` the half that says
            which image this is. Sharing its line with nothing, a reference of
            any length pushes nothing out of place. */}
        <Chip block prefix="image" label={container.image} truncate="start" />

        {/* Stacked, against the mock's row of three: the card stands in a grid
            three to a row, and three columns side by side in a third of the
            page leave no width to read a value in. */}
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
