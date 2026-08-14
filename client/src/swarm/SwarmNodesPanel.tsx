import { useState } from 'react';
import {
  ActionButtonGroup,
  Badge,
  Card,
  CardList,
  DefinitionList,
  EmptyState,
  FormField,
  Row,
  SectionHeader,
  Select,
  Stack,
  useToast,
  type CardListRowContent,
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

export interface SwarmNodesPanelProps {
  nodes: SwarmListing<SwarmNode>;
  loaded: boolean;
  canManage: boolean;
  onUpdate: (id: string, input: { role?: SwarmNodeRole; availability?: SwarmNodeAvailability }) => Promise<SwarmNode>;
  onRemove: (id: string, force: boolean) => Promise<void>;
}

/**
 * The Nodes panel of the Swarm screen (REQ-81): every node with its hostname,
 * role, availability and status, the role and availability changeable and the
 * node removable. When the daemon is not a manager the panel states the reason
 * rather than showing an empty list.
 */
export function SwarmNodesPanel({ nodes, loaded, canManage, onUpdate, onRemove }: SwarmNodesPanelProps) {
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
      push({ title: 'Node removed', message: node.hostname, tone: 'success' });
    } catch (cause) {
      reportError(`Could not remove ${node.hostname}`, (cause as Error).message);
    }
  }

  function nodeRow(node: SwarmNode): CardListRowContent {
    const details = [node.statusMessage ? `${node.status} · ${node.statusMessage}` : node.status, node.engineVersion ? `engine ${node.engineVersion}` : undefined, node.address]
      .filter((part): part is string => Boolean(part))
      .join(' · ');
    return {
      status: nodeStatusTone(node.status),
      title: node.self ? `${node.hostname} (this node)` : node.hostname,
      subtitle: details,
      badges: (
        <Row gap="var(--space-2)" align="center">
          <Badge tone={node.role === 'manager' ? 'info' : 'neutral'}>{node.leader ? 'leader' : node.role}</Badge>
          <Badge variant="quiet" tone={availabilityTone(node.availability)}>
            {node.availability}
          </Badge>
        </Row>
      ),
    };
  }

  function nodeControls(node: SwarmNode) {
    return (
      <Stack gap="var(--space-3)">
        <DefinitionList
          items={[
            { label: 'Node id', value: node.id, copyValue: node.id },
            { label: 'Platform', value: node.platform ?? '—' },
            { label: 'Reachability', value: node.reachability ?? (node.role === 'manager' ? 'unknown' : 'not a manager') },
            { label: 'Labels', value: Object.keys(node.labels).length === 0 ? 'none' : Object.entries(node.labels).map(([key, value]) => `${key}=${value}`).join(', ') },
          ]}
        />
        <Row gap="var(--space-3)" align="center" wrap>
          <FormField label="Role">
            <Select
              ariaLabel={`Role of ${node.hostname}`}
              value={node.role}
              options={ROLE_OPTIONS}
              onChange={(value) => applyChange(node, { role: value as SwarmNodeRole })}
            />
          </FormField>
          <FormField label="Availability">
            <Select
              ariaLabel={`Availability of ${node.hostname}`}
              value={node.availability}
              options={AVAILABILITY_OPTIONS}
              onChange={(value) => applyChange(node, { availability: value as SwarmNodeAvailability })}
            />
          </FormField>
          <ActionButtonGroup actions={[{ id: 'remove', label: 'Remove node', destructive: true, onClick: () => handleRemove(node) }]} />
        </Row>
      </Stack>
    );
  }

  return (
    <Card>
      <SectionHeader title="Nodes" />
      <CardList
        items={nodes.items}
        itemKey={(node) => node.id}
        renderRow={nodeRow}
        selectedKey={openId}
        onSelect={canManage ? (node) => setOpenId((current) => (current === node.id ? undefined : node.id)) : undefined}
        expandedKey={openId}
        renderExpanded={nodeControls}
        emptyState={
          <EmptyState
            title={nodes.unavailableReason ? 'No cluster to read' : loaded ? 'No nodes' : 'Reading nodes…'}
            description={nodes.unavailableReason}
          />
        }
      />
    </Card>
  );
}
