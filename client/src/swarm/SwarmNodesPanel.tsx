import { useState } from 'react';
import {
  ActionButtonGroup,
  BadgeListCell,
  Card,
  DataTable,
  DetailPanel,
  EmptyState,
  FormField,
  MetaCell,
  Row,
  SectionHeader,
  Select,
  StatusDotCell,
  TwoLineCell,
  useToast,
  type DataTableColumn,
} from '../ui';
import type { SwarmListing, SwarmNode, SwarmNodeAvailability, SwarmNodeRole } from '../data/swarm-client';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';
import { availabilityTone, nodeStatusTone } from './swarm-formatting';

const ROLE_OPTIONS = [
  { value: 'manager', label: 'manager' },
  { value: 'worker', label: 'worker' },
];

const AVAILABILITY_OPTIONS = [
  { value: 'active', label: 'active' },
  { value: 'pause', label: 'pause' },
  { value: 'drain', label: 'drain' },
];

/** What an empty node inventory means on a manager that answered the reading. */
const NO_NODES = 'The cluster reports no node at all, which a reachable manager cannot be: read it again once the daemon settles.';

export interface SwarmNodesPanelProps {
  nodes: SwarmListing<SwarmNode>;
  onUpdate: (id: string, input: { role?: SwarmNodeRole; availability?: SwarmNodeAvailability }) => Promise<SwarmNode>;
  onRemove: (id: string, force: boolean) => Promise<void>;
}

/**
 * The Nodes panel of the Swarm screen (REQ-81): every node with its hostname,
 * role, availability and status, the role and availability changeable and the
 * node removable.
 *
 * **It is drawn only where there is a cluster to read.** The screen states the
 * condition of the swarm once, on one surface, and renders this panel only on a
 * manager (plan-ui-coherence-optimisation/REQ-52), so nothing here repeats it:
 * the panel that used to carry its own copy of "this daemon is not part of a
 * swarm" carries none.
 */
export function SwarmNodesPanel({ nodes, onUpdate, onRemove }: SwarmNodesPanelProps) {
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();
  const [openId, setOpenId] = useState<string | undefined>(undefined);

  async function applyChange(node: SwarmNode, input: { role?: SwarmNodeRole; availability?: SwarmNodeAvailability }) {
    const what = input.role ? `role ${input.role}` : `availability ${input.availability}`;
    try {
      await run(`Update ${node.hostname}`, () => onUpdate(node.id, input));
      push({ title: 'Node updated', message: `${node.hostname} · ${what}`, tone: 'success' });
    } catch (cause) {
      reportError(`Could not update ${node.hostname}`, (cause as Error).message);
    }
  }

  async function handleRemove(node: SwarmNode) {
    const confirmed = await confirm({
      targetName: node.hostname,
      consequence:
        'This removes the node from the cluster. A node that is still reachable is removed forcibly, and it must leave the swarm itself before it can rejoin.',
      confirmLabel: 'Remove node',
    });
    if (!confirmed) return;
    try {
      await run(`Remove ${node.hostname}`, () => onRemove(node.id, true));
      setOpenId((current) => (current === node.id ? undefined : current));
      push({ title: 'Node removed', message: node.hostname, tone: 'success' });
    } catch (cause) {
      reportError(`Could not remove ${node.hostname}`, (cause as Error).message);
    }
  }

  /**
   * A node's row. Every cell is a fixed number of lines whatever the node's
   * state: the daemon's message about a node that is down was part of a line
   * the status, the engine version and the address shared, and it is a column of
   * its own here, so a healthy node's row is exactly as tall as an unhealthy
   * one's. The engine version and the address left the row for the panel, where
   * a node that reports neither costs nothing at all — six columns and their
   * gaps already resolve to 808px of the 854px a 1280×800 card offers, and a
   * seventh would make every desktop width pan.
   */
  const columns: DataTableColumn<SwarmNode>[] = [
    {
      id: 'node',
      header: 'NODE',
      width: '1.4fr',
      render: (node) => <TwoLineCell title={node.self ? `${node.hostname} (this node)` : node.hostname} />,
    },
    {
      id: 'role',
      header: 'ROLE',
      // The widest of the three words plus its own header, and no wider.
      width: '116px',
      render: (node) => (
        <BadgeListCell labels={[node.leader ? 'leader' : node.role]} tone={node.role === 'manager' ? 'info' : 'neutral'} />
      ),
    },
    {
      id: 'availability',
      header: 'AVAILABILITY',
      width: '132px',
      render: (node) => <BadgeListCell labels={[node.availability]} tone={availabilityTone(node.availability)} />,
    },
    {
      id: 'status',
      header: 'STATUS',
      // What the node *is*, in a tone and in the daemon's own word.
      width: '140px',
      render: (node) => <StatusDotCell tone={nodeStatusTone(node.status)} label={node.status} />,
    },
    {
      id: 'reports',
      header: 'DAEMON REPORTS',
      // Only a node the cluster has something to say about explains itself, and
      // the column's own '–' is what every healthy node reads as.
      width: '1.6fr',
      render: (node) => <MetaCell>{node.statusMessage}</MetaCell>,
    },
    {
      id: 'actions',
      header: 'ACTIONS',
      // The cluster's own width and no more (plan-ui-coherence-optimisation/REQ-9),
      // stated as a length: an intrinsic track resolves separately in the header
      // and in every row.
      width: '132px',
      render: (node) => (
        <ActionButtonGroup actions={[{ id: 'remove', label: 'Remove', weight: 'destructive' as const, onClick: () => void handleRemove(node) }]} />
      ),
    },
  ];

  /**
   * The opened node, at the content column's full width: what the row states in
   * full — the id and the address it truncates or leaves out
   * (plan-ui-coherence-optimisation/REQ-21) — over the two controls that change
   * it. The controls are forms rather than actions, so they live here and not in
   * the row's cluster.
   */
  function nodeDetail(node: SwarmNode) {
    return (
      <DetailPanel
        dismissal="opening-gesture"
        onClose={() => setOpenId(undefined)}
        properties={[
          { label: 'Node id', value: node.id },
          { label: 'Hostname', value: node.hostname },
          { label: 'Address', value: node.address ?? 'not reported' },
          { label: 'Engine', value: node.engineVersion ?? 'not reported' },
          { label: 'Platform', value: node.platform ?? 'not reported' },
          { label: 'Reachability', value: node.reachability ?? (node.role === 'manager' ? 'unknown' : 'not a manager') },
          { label: 'Status', value: node.statusMessage ? `${node.status} · ${node.statusMessage}` : node.status },
          {
            label: 'Labels',
            value:
              Object.keys(node.labels).length === 0
                ? 'none'
                : Object.entries(node.labels)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(', '),
          },
        ]}
        // A node's bands hold an id, an address, a version and a platform:
        // single-line values that are long rather than free text.
        propertiesContentClass="long-single-line"
      >
        <Row gap="var(--space-3)" align="center" wrap>
          <FormField label="Role">
            <Select
              ariaLabel={`Role of ${node.hostname}`}
              value={node.role}
              options={ROLE_OPTIONS}
              onChange={(value) => void applyChange(node, { role: value as SwarmNodeRole })}
            />
          </FormField>
          <FormField label="Availability">
            <Select
              ariaLabel={`Availability of ${node.hostname}`}
              value={node.availability}
              options={AVAILABILITY_OPTIONS}
              onChange={(value) => void applyChange(node, { availability: value as SwarmNodeAvailability })}
            />
          </FormField>
        </Row>
      </DetailPanel>
    );
  }

  return (
    <Card>
      <SectionHeader title="Nodes" description="Managers first, then in hostname order" />
      <DataTable
        variant="comfortable"
        columns={columns}
        rows={nodes.items}
        rowKey={(node) => node.id}
        selectedRowKey={openId}
        onRowSelect={(node) => setOpenId((current) => (current === node.id ? undefined : node.id))}
        expandedRowKey={openId}
        renderExpanded={nodeDetail}
        emptyState={<EmptyState title="No nodes" description={nodes.unavailableReason ?? NO_NODES} action={null} />}
      />
    </Card>
  );
}
