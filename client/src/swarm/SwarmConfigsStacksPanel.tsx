import { useState } from 'react';
import {
  ActionButtonGroup,
  Button,
  Card,
  CardList,
  CodeEditor,
  DefinitionList,
  EmptyState,
  FormDialog,
  FormField,
  KeyValueEditor,
  SectionHeader,
  Stack,
  TextField,
  useToast,
  type CardListRowContent,
  type KeyValuePair,
} from '../ui';
import type { CreateSwarmDataInput, StackRemovalResult, SwarmDataItem, SwarmListing, SwarmStack } from '../data/swarm-client';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';
import { formatAge, formatReplicas, toLabels } from './swarm-formatting';

export interface SwarmConfigsStacksPanelProps {
  configs: SwarmListing<SwarmDataItem>;
  stacks: SwarmListing<SwarmStack>;
  loaded: boolean;
  canManage: boolean;
  onCreateConfig: (input: CreateSwarmDataInput) => Promise<SwarmDataItem>;
  onRemoveConfig: (id: string) => Promise<void>;
  onRemoveStack: (name: string) => Promise<StackRemovalResult>;
}

/**
 * The Configs & stacks panel of the Swarm screen (REQ-83, REQ-84): the configs
 * with their age, created, inspected and removed, and the stacks listed with
 * their services and removable.
 *
 * There is deliberately no deploy affordance, no compose-file path input and
 * no compose editor here: stack deployment was withdrawn on 2026-08-07
 * (departure Three). Stacks are observed and removed.
 */
export function SwarmConfigsStacksPanel({
  configs,
  stacks,
  loaded,
  canManage,
  onCreateConfig,
  onRemoveConfig,
  onRemoveStack,
}: SwarmConfigsStacksPanelProps) {
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  const [openConfigId, setOpenConfigId] = useState<string | undefined>(undefined);
  const [openStack, setOpenStack] = useState<string | undefined>(undefined);
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
      setOpenStack(undefined);
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

  function configRow(config: SwarmDataItem): CardListRowContent {
    return {
      title: config.name,
      subtitle: config.stack ? `stack: ${config.stack}` : undefined,
      meta: formatAge(config.createdAt),
    };
  }

  function configDetail(config: SwarmDataItem) {
    return (
      <Stack gap="var(--space-3)">
        <DefinitionList
          items={[
            { label: 'Config id', value: config.id, copyValue: config.id },
            { label: 'Created', value: formatAge(config.createdAt) },
            { label: 'Updated', value: formatAge(config.updatedAt) },
            { label: 'Stack', value: config.stack ?? 'none' },
            {
              label: 'Labels',
              value: Object.keys(config.labels).length === 0 ? 'none' : Object.entries(config.labels).map(([key, entry]) => `${key}=${entry}`).join(', '),
            },
          ]}
        />
        {canManage ? <ActionButtonGroup actions={[{ id: 'remove', label: 'Remove', destructive: true, onClick: () => handleRemoveConfig(config) }]} /> : null}
      </Stack>
    );
  }

  function stackRow(stack: SwarmStack): CardListRowContent {
    return {
      title: stack.name,
      subtitle: `${stack.serviceCount} services · ${stack.secretCount} secrets · ${stack.configCount} configs · ${stack.networkCount} networks`,
    };
  }

  function stackDetail(stack: SwarmStack) {
    return (
      <Stack gap="var(--space-3)">
        <DefinitionList
          items={
            stack.services.length === 0
              ? [{ label: 'services', value: 'none left' }]
              : stack.services.map((service) => ({
                  label: service.name,
                  value: `${service.image} · ${service.mode} · ${formatReplicas(service.replicasRunning, service.replicasDesired)}`,
                }))
          }
        />
        {canManage ? <ActionButtonGroup actions={[{ id: 'remove', label: 'Remove stack', destructive: true, onClick: () => handleRemoveStack(stack) }]} /> : null}
      </Stack>
    );
  }

  return (
    <Card>
      <SectionHeader title="Configs & stacks" trailing={canManage ? <Button onClick={openCreate}>New config</Button> : undefined} />
      <Stack gap="var(--space-4)">
        <Stack gap="var(--space-2)">
          <SectionHeader variant="eyebrow" title="Configs" />
          <CardList
            items={configs.items}
            itemKey={(config) => config.id}
            renderRow={configRow}
            selectedKey={openConfigId}
            onSelect={(config) => setOpenConfigId((current) => (current === config.id ? undefined : config.id))}
            expandedKey={openConfigId}
            renderExpanded={configDetail}
            emptyState={
              <EmptyState
                title={configs.unavailableReason ? 'No cluster to read' : loaded ? 'No configs' : 'Reading configs…'}
                description={configs.unavailableReason}
              />
            }
          />
        </Stack>
        <Stack gap="var(--space-2)">
          <SectionHeader variant="eyebrow" title="Stacks" />
          <CardList
            items={stacks.items}
            itemKey={(stack) => stack.name}
            renderRow={stackRow}
            selectedKey={openStack}
            onSelect={(stack) => setOpenStack((current) => (current === stack.name ? undefined : stack.name))}
            expandedKey={openStack}
            renderExpanded={stackDetail}
            emptyState={
              <EmptyState
                title={stacks.unavailableReason ? 'No cluster to read' : loaded ? 'No stacks' : 'Reading stacks…'}
                description={
                  stacks.unavailableReason ??
                  (loaded ? 'A stack deployed from a terminal appears here with its services, and can be removed.' : undefined)
                }
              />
            }
          />
        </Stack>
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
    </Card>
  );
}
