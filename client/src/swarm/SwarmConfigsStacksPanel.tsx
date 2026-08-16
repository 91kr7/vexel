import { useState } from 'react';
import {
  ActionButtonGroup,
  BadgeListCell,
  Button,
  Card,
  CodeEditor,
  DataTable,
  DetailPanel,
  EmptyState,
  FormDialog,
  FormField,
  KeyValueEditor,
  MetaCell,
  ScreenToolbar,
  SectionHeader,
  Stack,
  TextField,
  TwoLineCell,
  useToast,
  type DataTableColumn,
  type KeyValuePair,
} from '../ui';
import type { CreateSwarmDataInput, StackRemovalResult, SwarmDataItem, SwarmListing, SwarmStack, SwarmStackService } from '../data/swarm-client';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';
import { formatAge, formatReplicas, toLabels } from './swarm-formatting';

/** What it takes for a config to appear here, for a cluster that holds none. */
const NO_CONFIGS = 'A config is a file the cluster holds for the services that mount it, created here and replaced rather than edited.';

/** What puts a stack there — and it is never this application (departure Three). */
const NO_STACKS = 'A stack deployed from a terminal appears here with its services, and can be removed; nothing deploys one from this application.';

/** Stated on every config, as a property of it: the contract, not an absence. */
const CONTENT_NEVER_SHOWN = 'never displayed — a config can only be replaced, not read';

export interface SwarmConfigsStacksPanelProps {
  configs: SwarmListing<SwarmDataItem>;
  stacks: SwarmListing<SwarmStack>;
  onCreateConfig: (input: CreateSwarmDataInput) => Promise<SwarmDataItem>;
  onRemoveConfig: (id: string) => Promise<void>;
  onRemoveStack: (name: string) => Promise<StackRemovalResult>;
}

/**
 * The configs and the stacks of the Swarm screen (REQ-83, REQ-84): the configs
 * with their age, created, inspected and removed, and the stacks listed with
 * their services and removable.
 *
 * There is deliberately no deploy affordance, no compose-file path input and
 * no compose editor here: stack deployment was withdrawn on 2026-08-07
 * (departure Three). Stacks are observed and removed.
 *
 * **The two inventories are two sections, where they were two labelled groups
 * inside one card** (plan-ui-coherence-optimisation/REQ-54). That card was the
 * only one on the screen whose content started below its own header — it had to
 * label its first group inside its own body — which is precisely what set its
 * content 25.4px lower than its neighbour's, measured on the delivered build at
 * 1440×1000 and 1280×800. One section per inventory removes the cause: each
 * carries one section header and starts its content directly under it.
 *
 * **And both lists are the containers table** (`.../classic-table/REQ-20`,
 * REQ-39, REQ-40): one header over a continuous run of ruled rows, rows of the
 * reference's own height and alignment stating no modifier of their own, each
 * table edge to edge in an unpadded card holding it and nothing else, its
 * section header and toolbar above that card. A stack's services stay legible as
 * that stack's by the indentation the library draws for a nested list — never by
 * a surface, which is the presentation this plan retires.
 */
export function SwarmConfigsStacksPanel({ configs, stacks, onCreateConfig, onRemoveConfig, onRemoveStack }: SwarmConfigsStacksPanelProps) {
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  const [openConfigId, setOpenConfigId] = useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [labels, setLabels] = useState<KeyValuePair[]>([]);
  const [creating, setCreating] = useState(false);

  function openCreate() {
    setName('');
    setContent('');
    setLabels([]);
    setCreateOpen(true);
  }

  function closeCreate() {
    setName('');
    setContent('');
    setLabels([]);
    setCreateOpen(false);
  }

  async function submitCreate() {
    setCreating(true);
    try {
      const created = await run(`Create config ${name.trim()}`, () => onCreateConfig({ name: name.trim(), value: content, labels: toLabels(labels) }));
      push({ title: 'Config created', message: created.name, tone: 'success' });
      closeCreate();
    } catch (cause) {
      reportError('Could not create the config', (cause as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRemoveConfig(config: SwarmDataItem) {
    const confirmed = await confirm({
      targetName: config.name,
      consequence: 'This removes the config from the cluster. A service still using it keeps the daemon from removing it.',
      confirmLabel: 'Remove config',
    });
    if (!confirmed) return;
    try {
      await run(`Remove config ${config.name}`, () => onRemoveConfig(config.id));
      setOpenConfigId(undefined);
      push({ title: 'Config removed', message: config.name, tone: 'success' });
    } catch (cause) {
      reportError(`Could not remove ${config.name}`, (cause as Error).message);
    }
  }

  async function handleRemoveStack(stack: SwarmStack) {
    const confirmed = await confirm({
      targetName: stack.name,
      consequence: 'This removes every service, secret, config and network belonging to the stack. The application cannot deploy it back.',
      confirmLabel: 'Remove stack',
    });
    if (!confirmed) return;
    try {
      const result = await run(`Remove stack ${stack.name}`, () => onRemoveStack(stack.name));
      const counts = [
        `${result.removedServices.length} services`,
        `${result.removedSecrets.length} secrets`,
        `${result.removedConfigs.length} configs`,
        `${result.removedNetworks.length} networks`,
      ].join(' · ');
      push({ title: 'Stack removed', message: `${stack.name} — ${counts}`, tone: 'success' });
    } catch (cause) {
      reportError(`Could not remove ${stack.name}`, (cause as Error).message);
    }
  }

  /**
   * A config's row. The stack a config may belong to was a subtitle line whose
   * presence depended on the config; it is a column here, where its absence is
   * the column's own '–' and costs the row no height.
   */
  const configColumns: DataTableColumn<SwarmDataItem>[] = [
    {
      id: 'config',
      header: 'CONFIG',
      width: '1.6fr',
      render: (config) => <TwoLineCell title={config.name} />,
    },
    {
      id: 'stack',
      header: 'STACK',
      width: '1fr',
      render: (config) => <MetaCell>{config.stack}</MetaCell>,
    },
    {
      id: 'created',
      header: 'CREATED',
      width: '132px',
      render: (config) => <MetaCell>{formatAge(config.createdAt)}</MetaCell>,
    },
    {
      id: 'updated',
      header: 'UPDATED',
      width: '132px',
      render: (config) => <MetaCell>{formatAge(config.updatedAt)}</MetaCell>,
    },
    {
      id: 'actions',
      header: 'ACTIONS',
      width: '132px',
      render: (config) => (
        <ActionButtonGroup actions={[{ id: 'remove', label: 'Remove', weight: 'destructive' as const, onClick: () => void handleRemoveConfig(config) }]} />
      ),
    },
  ];

  /** The opened config: metadata, and only metadata, at the content column's full width. */
  function configDetail(config: SwarmDataItem) {
    return (
      <DetailPanel
        dismissal="opening-gesture"
        onClose={() => setOpenConfigId(undefined)}
        properties={[
          { label: 'Config id', value: config.id },
          { label: 'Name', value: config.name },
          { label: 'Created', value: formatAge(config.createdAt) },
          { label: 'Updated', value: formatAge(config.updatedAt) },
          { label: 'Stack', value: config.stack ?? 'none' },
          {
            label: 'Labels',
            value:
              Object.keys(config.labels).length === 0
                ? 'none'
                : Object.entries(config.labels)
                    .map(([key, entry]) => `${key}=${entry}`)
                    .join(', '),
          },
          { label: 'Content', value: CONTENT_NEVER_SHOWN },
        ]}
        propertiesContentClass="long-single-line"
      />
    );
  }

  /** A stack's service, in the nested list every stack row carries. */
  const stackServiceColumns: DataTableColumn<SwarmStackService>[] = [
    {
      id: 'service',
      header: 'SERVICE',
      width: '1.4fr',
      render: (service) => <TwoLineCell title={service.name} />,
    },
    {
      id: 'image',
      header: 'IMAGE',
      width: '2fr',
      render: (service) => <MetaCell>{service.image}</MetaCell>,
    },
    {
      id: 'mode',
      header: 'MODE',
      width: '124px',
      render: (service) => <BadgeListCell labels={[service.mode]} tone="info" />,
    },
    {
      id: 'replicas',
      header: 'REPLICAS',
      width: '116px',
      render: (service) => <MetaCell>{formatReplicas(service.replicasRunning, service.replicasDesired)}</MetaCell>,
    },
  ];

  /**
   * A stack's row. Its four counts were one subtitle line and are four columns,
   * and its services are carried in the row itself rather than behind a
   * selection: what a stack *is* is the services it holds.
   */
  const stackColumns: DataTableColumn<SwarmStack>[] = [
    {
      id: 'stack',
      header: 'STACK',
      width: '1.6fr',
      render: (stack) => <TwoLineCell title={stack.name} />,
    },
    {
      id: 'services',
      header: 'SERVICES',
      width: '116px',
      render: (stack) => <MetaCell>{String(stack.serviceCount)}</MetaCell>,
    },
    {
      id: 'secrets',
      header: 'SECRETS',
      width: '116px',
      render: (stack) => <MetaCell>{String(stack.secretCount)}</MetaCell>,
    },
    {
      id: 'configs',
      header: 'CONFIGS',
      width: '116px',
      render: (stack) => <MetaCell>{String(stack.configCount)}</MetaCell>,
    },
    {
      id: 'networks',
      header: 'NETWORKS',
      width: '116px',
      render: (stack) => <MetaCell>{String(stack.networkCount)}</MetaCell>,
    },
    {
      id: 'actions',
      header: 'ACTIONS',
      width: '132px',
      render: (stack) => (
        <ActionButtonGroup actions={[{ id: 'remove', label: 'Remove', weight: 'destructive' as const, onClick: () => void handleRemoveStack(stack) }]} />
      ),
    },
  ];

  return (
    <Stack gap="var(--space-5)">
      {/* The composition containers and images ship, once per inventory: the
          section header and the toolbar above, and the list alone in a card of
          its own that it fills edge to edge. Each list's one enclosing surface is
          that card, so the section around it has none — and neither does the
          nested service list a stack row carries. */}
      <Stack gap="var(--space-4)">
        <SectionHeader title="Configs" description="In name order; a content is never read back" />
        {/* The page-level action, in the toolbar under the section header rather
            than in the header itself. */}
        <ScreenToolbar primaryAction={{ label: 'New config', onClick: openCreate }} />
        <Card padding="none">
          <DataTable
            columns={configColumns}
            rows={configs.items}
            rowKey={(config) => config.id}
            selectedRowKey={openConfigId}
            onRowSelect={(config) => setOpenConfigId((current) => (current === config.id ? undefined : config.id))}
            expandedRowKey={openConfigId}
            renderExpanded={configDetail}
            emptyState={
              <EmptyState
                title="No configs"
                description={configs.unavailableReason ?? NO_CONFIGS}
                // Where the reading itself states a reason, creating a config is
                // not what resolves it, so no action is offered for it.
                // Its label is the invitation, never the toolbar's own word (DEF-2,
                // `swarm-configs-stacks-panel.md`): one surface, one control per name.
                action={configs.unavailableReason ? null : <Button onClick={openCreate}>Create the first config</Button>}
              />
            }
          />
        </Card>
      </Stack>

      <Stack gap="var(--space-4)">
        <SectionHeader title="Stacks" description="Read from the namespace label the stack's own objects carry" />
        <Card padding="none">
          <DataTable
            columns={stackColumns}
            rows={stacks.items}
            rowKey={(stack) => stack.name}
            // Every stack row carries its services, opened or not: the grouping is
            // the object's own shape, not a detail of a selection.
            renderRowContent={(stack) => (
              // The services take no surface of their own: they are drawn inside
              // the stacks list's own, indented under the row they belong to,
              // which is what the library's `nested` states
              // (`.../classic-table/REQ-7`).
              <DataTable
                nested
                hideHeader
                columns={stackServiceColumns}
                rows={stack.services}
                rowKey={(service) => service.id}
                emptyState={
                  <EmptyState title="No services left" description="Every service of this stack has gone from the cluster." action={null} compact />
                }
              />
            )}
            emptyState={
              <EmptyState
                title="No stacks"
                description={stacks.unavailableReason ?? NO_STACKS}
                // Nothing here deploys a stack, so nothing here resolves it
                // (departure Three).
                action={null}
              />
            }
          />
        </Card>
      </Stack>

      <FormDialog
        open={createOpen}
        title="New config"
        description="The content is sent once to the cluster's store. Like a secret's value, it is not read back by this application."
        submitLabel="Create"
        submitting={creating}
        submitDisabled={name.trim() === '' || content === ''}
        onSubmit={submitCreate}
        onCancel={closeCreate}
      >
        <Stack gap="var(--space-3)">
          <FormField label="Name">
            <TextField ariaLabel="Config name" placeholder="e.g. nginx_conf" value={name} onChange={setName} autoFocus />
          </FormField>
          <FormField label="Content">
            <CodeEditor ariaLabel="Config content" value={content} onChange={setContent} maxHeight="240px" />
          </FormField>
          <FormField label="Labels" hint="Set at creation; they are what lets a caller find this config again later.">
            <KeyValueEditor pairs={labels} onChange={setLabels} name="Labels" addLabel="Add label" />
          </FormField>
        </Stack>
      </FormDialog>
    </Stack>
  );
}
