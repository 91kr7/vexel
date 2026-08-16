import { useState } from 'react';
import {
  ActionButtonGroup,
  Button,
  Card,
  DataTable,
  DetailPanel,
  EmptyState,
  FormDialog,
  FormField,
  KeyValueEditor,
  MetaCell,
  ScreenToolbar,
  SecretField,
  SectionHeader,
  Stack,
  TextField,
  TwoLineCell,
  useToast,
  type DataTableColumn,
  type KeyValuePair,
} from '../ui';
import type { CreateSwarmDataInput, SwarmDataItem, SwarmListing } from '../data/swarm-client';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';
import { formatAge, toLabels } from './swarm-formatting';

/** What it takes for a secret to appear here, for a cluster that holds none. */
const NO_SECRETS = 'A secret is a value the cluster holds for the services that mount it; it is written here once and can never be read back.';

/** Stated on every secret, as a property of it: the contract, not an absence. */
const VALUE_NEVER_SHOWN = 'never displayed — a secret can only be replaced, not read';

export interface SwarmSecretsPanelProps {
  secrets: SwarmListing<SwarmDataItem>;
  onCreate: (input: CreateSwarmDataInput) => Promise<SwarmDataItem>;
  onRemove: (id: string) => Promise<void>;
}

/**
 * The Secrets panel of the Swarm screen (REQ-84). A secret's value is written
 * once and never read: it is typed into a masked field with no reveal control,
 * sent, and dropped from the form the moment it closes. Nothing in this panel
 * can show it back — no reveal, no copy, no request that returns it, and no
 * column and no property carries one.
 *
 * **It is drawn only where there is a cluster to read**: the screen states the
 * swarm's condition once and renders this panel on a manager alone
 * (plan-ui-coherence-optimisation/REQ-52).
 */
export function SwarmSecretsPanel({ secrets, onCreate, onRemove }: SwarmSecretsPanelProps) {
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

  /**
   * A secret's row. The stack a secret may belong to was a subtitle line whose
   * presence depended on the secret; it is a column here, where its absence is
   * the column's own '–' and costs the row no height.
   */
  const columns: DataTableColumn<SwarmDataItem>[] = [
    {
      id: 'secret',
      header: 'SECRET',
      width: '1.6fr',
      render: (secret) => <TwoLineCell title={secret.name} />,
    },
    {
      id: 'stack',
      header: 'STACK',
      width: '1fr',
      render: (secret) => <MetaCell>{secret.stack}</MetaCell>,
    },
    {
      id: 'created',
      header: 'CREATED',
      width: '132px',
      render: (secret) => <MetaCell>{formatAge(secret.createdAt)}</MetaCell>,
    },
    {
      id: 'updated',
      header: 'UPDATED',
      width: '132px',
      render: (secret) => <MetaCell>{formatAge(secret.updatedAt)}</MetaCell>,
    },
    {
      id: 'actions',
      header: 'ACTIONS',
      // The cluster's own width and no more, stated as a length
      // (plan-ui-coherence-optimisation/REQ-9).
      width: '132px',
      render: (secret) => (
        <ActionButtonGroup actions={[{ id: 'remove', label: 'Remove', weight: 'destructive' as const, onClick: () => void handleRemove(secret) }]} />
      ),
    },
  ];

  /** The opened secret: metadata, and only metadata, at the content column's full width. */
  function secretDetail(secret: SwarmDataItem) {
    return (
      <DetailPanel
        dismissal="opening-gesture"
        onClose={() => setOpenId(undefined)}
        properties={[
          { label: 'Secret id', value: secret.id },
          { label: 'Name', value: secret.name },
          { label: 'Created', value: formatAge(secret.createdAt) },
          { label: 'Updated', value: formatAge(secret.updatedAt) },
          { label: 'Stack', value: secret.stack ?? 'none' },
          {
            label: 'Labels',
            value:
              Object.keys(secret.labels).length === 0
                ? 'none'
                : Object.entries(secret.labels)
                    .map(([key, entry]) => `${key}=${entry}`)
                    .join(', '),
          },
          { label: 'Value', value: VALUE_NEVER_SHOWN },
        ]}
        // A secret's bands hold an id, a name and a label line: single-line
        // values that are long rather than free text.
        propertiesContentClass="long-single-line"
      />
    );
  }

  return (
    <Card>
      <SectionHeader title="Secrets" description="In name order; a value is never read back" />
      {/* The page-level action, in the toolbar under the header rather than in
          the card's header. */}
      <ScreenToolbar primaryAction={{ label: 'New secret', onClick: openCreate }} />
      <DataTable
        variant="comfortable"
        columns={columns}
        rows={secrets.items}
        rowKey={(secret) => secret.id}
        selectedRowKey={openId}
        onRowSelect={(secret) => setOpenId((current) => (current === secret.id ? undefined : secret.id))}
        expandedRowKey={openId}
        renderExpanded={secretDetail}
        emptyState={
          <EmptyState
            title="No secrets"
            description={secrets.unavailableReason ?? NO_SECRETS}
            // Where the reading itself states a reason, creating a secret is not
            // what resolves it, so no action is offered for it.
            //
            // Its label is the invitation, never the toolbar's own word: two
            // controls on one surface whose names contain one another are one
            // control to anything that finds a control by name — the defect
            // `swarm-secrets-panel.md` records under DEF-2.
            action={secrets.unavailableReason ? null : <Button onClick={openCreate}>Create the first secret</Button>}
          />
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
