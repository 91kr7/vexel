import { useState } from 'react';
import {
  ActionButtonGroup,
  Button,
  Card,
  CardList,
  DefinitionList,
  EmptyState,
  FormDialog,
  FormField,
  KeyValueEditor,
  SecretField,
  SectionHeader,
  Stack,
  TextField,
  useToast,
  type CardListRowContent,
  type KeyValuePair,
} from '../ui';
import type { CreateSwarmDataInput, SwarmDataItem, SwarmListing } from '../data/swarm-client';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';
import { formatAge, toLabels } from './swarm-formatting';

export interface SwarmSecretsPanelProps {
  secrets: SwarmListing<SwarmDataItem>;
  loaded: boolean;
  canManage: boolean;
  onCreate: (input: CreateSwarmDataInput) => Promise<SwarmDataItem>;
  onRemove: (id: string) => Promise<void>;
}

/**
 * The Secrets panel of the Swarm screen (REQ-84). A secret's value is written
 * once and never read: it is typed into a masked field with no reveal control,
 * sent, and dropped from the form the moment it closes. Nothing in this panel
 * can show it back — no reveal, no copy, no request that returns it.
 */
export function SwarmSecretsPanel({ secrets, loaded, canManage, onCreate, onRemove }: SwarmSecretsPanelProps) {
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [labels, setLabels] = useState<KeyValuePair[]>([]);
  const [creating, setCreating] = useState(false);

  function openCreate() {
    setName('');
    setValue('');
    setLabels([]);
    setCreateOpen(true);
  }

  function closeCreate() {
    // The value is dropped the moment the form closes, whichever way it did.
    setValue('');
    setName('');
    setLabels([]);
    setCreateOpen(false);
  }

  async function submitCreate() {
    setCreating(true);
    try {
      const created = await run(`Create secret ${name.trim()}`, () => onCreate({ name: name.trim(), value, labels: toLabels(labels) }));
      push({ title: 'Secret created', message: created.name, tone: 'success' });
      closeCreate();
    } catch (cause) {
      reportError('Could not create the secret', (cause as Error).message);
      setValue('');
    } finally {
      setCreating(false);
    }
  }

  async function handleRemove(secret: SwarmDataItem) {
    const confirmed = await confirm({
      targetName: secret.name,
      consequence: 'This removes the secret from the cluster. A service still using it keeps the daemon from removing it.',
      confirmLabel: 'Remove secret',
    });
    if (!confirmed) return;
    try {
      await run(`Remove secret ${secret.name}`, () => onRemove(secret.id));
      setOpenId(undefined);
      push({ title: 'Secret removed', message: secret.name, tone: 'success' });
    } catch (cause) {
      reportError(`Could not remove ${secret.name}`, (cause as Error).message);
    }
  }

  function secretRow(secret: SwarmDataItem): CardListRowContent {
    return {
      title: secret.name,
      subtitle: secret.stack ? `stack: ${secret.stack}` : undefined,
      meta: formatAge(secret.createdAt),
    };
  }

  function secretDetail(secret: SwarmDataItem) {
    return (
      <Stack gap="var(--space-3)">
        <DefinitionList
          items={[
            { label: 'Secret id', value: secret.id },
            { label: 'Created', value: formatAge(secret.createdAt) },
            { label: 'Updated', value: formatAge(secret.updatedAt) },
            { label: 'Stack', value: secret.stack ?? 'none' },
            {
              label: 'Labels',
              value: Object.keys(secret.labels).length === 0 ? 'none' : Object.entries(secret.labels).map(([key, entry]) => `${key}=${entry}`).join(', '),
            },
            { label: 'Value', value: 'never displayed — a secret can only be replaced, not read' },
          ]}
        />
        {canManage ? <ActionButtonGroup actions={[{ id: 'remove', label: 'Remove', destructive: true, onClick: () => handleRemove(secret) }]} /> : null}
      </Stack>
    );
  }

  return (
    <Card>
      <SectionHeader title="Secrets" trailing={canManage ? <Button onClick={openCreate}>New secret</Button> : undefined} />
      <CardList
        items={secrets.items}
        itemKey={(secret) => secret.id}
        renderRow={secretRow}
        selectedKey={openId}
        onSelect={(secret) => setOpenId((current) => (current === secret.id ? undefined : secret.id))}
        expandedKey={openId}
        renderExpanded={secretDetail}
        emptyState={
          <EmptyState
            title={secrets.unavailableReason ? 'No cluster to read' : loaded ? 'No secrets' : 'Reading secrets…'}
            description={secrets.unavailableReason ?? null}
           action={null} />
        }
      />

      <FormDialog
        open={createOpen}
        title="New secret"
        description="The value is sent once to the cluster's store. It is never displayed, never logged and cannot be read back — only replaced by a new secret."
        submitLabel="Create"
        submitting={creating}
        submitDisabled={name.trim() === '' || value === ''}
        onSubmit={submitCreate}
        onCancel={closeCreate}
      >
        <Stack gap="var(--space-3)">
          <FormField label="Name">
            <TextField ariaLabel="Secret name" placeholder="e.g. db_password" value={name} onChange={setName} autoFocus />
          </FormField>
          <FormField label="Value" hint="Masked as you type; it cannot be read back.">
            <SecretField ariaLabel="Secret value" value={value} onChange={setValue} onSubmit={submitCreate} />
          </FormField>
          <FormField label="Labels" hint="Set at creation; they are what lets a caller find this secret again later.">
            <KeyValueEditor pairs={labels} onChange={setLabels} name="Labels" addLabel="Add label" />
          </FormField>
        </Stack>
      </FormDialog>
    </Card>
  );
}
