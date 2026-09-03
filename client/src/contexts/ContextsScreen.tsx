import { useState } from 'react';
import {
  ActionButtonGroup,
  BadgeListCell,
  Button,
  Card,
  DataTable,
  DetailPanel,
  EmptyState,
  EndpointField,
  FormDialog,
  FormField,
  MetaCell,
  ScreenToolbar,
  SectionHeader,
  Stack,
  StatusPill,
  TextField,
  TwoLineCell,
  useToast,
  type DataTableColumn,
  type EndpointKindOption,
} from '../ui';
import type { ContextSummary, CreatableContextKind } from '../data/contexts-client';
import { useContexts } from '../data/use-contexts';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';
import { FailedReadEmptyState } from '../shell/FailedReadEmptyState';

/**
 * The two endpoint kinds this application creates. A TCP+TLS context needs
 * three certificate files on the server's own filesystem, which the operator
 * cannot see, so its creation is console-only (departure Three, 2026-08-07) —
 * one created there is listed, selectable and usable here like any other.
 */
const ENDPOINT_KINDS: EndpointKindOption[] = [
  {
    value: 'local',
    label: 'Local socket',
    fixedHost: 'The Docker socket of the machine running Vexel; no path to type.',
  },
  {
    value: 'ssh',
    label: 'SSH',
    hostLabel: 'SSH destination',
    hostPlaceholder: 'user@host',
    hostHint: 'Authenticated with the SSH keys of the machine running Vexel.',
  },
];

function endpointOf(context: ContextSummary): string | undefined {
  return context.endpoint === '' ? undefined : context.endpoint;
}

/**
 * The context revealed by the library's detail panel in the row's expansion:
 * the endpoint **in full**, wrapped and selectable, which is the route out of
 * the truncation the row applies to it
 * (plan-ui-coherence-optimisation/REQ-21) — the row painted 43.8px of a 388.9px
 * value at 375×812 with the whole of it available nowhere on this screen. Every
 * other fact the row states in a column is stated here in its own words, so a
 * marker column's absence is never the only reading of a state.
 */
function ContextDetail({ context, onClose }: { context: ContextSummary; onClose: () => void }) {
  return (
    // The row that opened the panel closes it, so it presents no close control
    // of its own and `Escape` closes it from the keyboard.
    <DetailPanel
      dismissal="opening-gesture"
      onClose={onClose}
      properties={[
        { label: 'Name', value: context.name },
        { label: 'Kind', value: context.kind },
        { label: 'Endpoint', value: endpointOf(context) ?? 'no endpoint recorded' },
        { label: 'TLS', value: context.tls ? 'yes' : 'no' },
        { label: 'Description', value: context.description || '–' },
        { label: 'In use', value: context.active ? 'yes' : 'no' },
        // Docker's own message, and only where Docker gave one: a property band
        // holding a value that belongs to no context is worse than an absent
        // band (plan-ui-coherence-optimisation/REQ-58's rule, observed here).
        ...(context.error ? [{ label: 'Docker reports', value: context.error }] : []),
      ]}
      propertiesContentClass="long-single-line"
    />
  );
}

/**
 * The Contexts screen (REQ-92, REQ-93, REQ-94): every Docker context with its
 * endpoint and which one is active — whatever the endpoint kind, a TCP+TLS one
 * included — creating a local-socket or SSH context, switching the active one
 * and removing one.
 *
 * **The daemon of the active context is no longer described here**
 * (plan-ui-coherence-optimisation/REQ-45): the eight properties this screen
 * listed beside the list — Docker version, Engine API, BuildKit, storage driver,
 * cgroup driver, OS/arch, root directory, containers running — describe *the
 * daemon*, not *a context*. They do not change as the operator looks down this
 * list, only when the active context changes, which makes them system
 * information; System & prune states them, and states them alone. Restoring
 * them here would be reinstating the duplication, not repairing an omission.
 */
export function ContextsScreen() {
  const contexts = useContexts();
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  const [selectedName, setSelectedName] = useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CreatableContextKind>('local');
  const [host, setHost] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  function openCreate() {
    setName('');
    setKind('local');
    setHost('');
    setDescription('');
    setCreateOpen(true);
  }

  async function submitCreate() {
    setCreating(true);
    try {
      await run('Create context', () =>
        contexts.create({
          name: name.trim(),
          kind,
          host: kind === 'ssh' ? host.trim() : undefined,
          description: description.trim() === '' ? undefined : description.trim(),
        }),
      );
      setCreateOpen(false);
    } catch (cause) {
      reportError('Could not create the context', (cause as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleUse(context: ContextSummary) {
    try {
      await run(`Use ${context.name}`, () => contexts.use(context.name));
      push({ title: 'Active context switched', message: `Every screen now follows ${context.name}.`, tone: 'success' });
    } catch (cause) {
      reportError(`Could not switch to ${context.name}`, (cause as Error).message);
    }
  }

  async function handleRemove(context: ContextSummary) {
    const confirmed = await confirm({
      targetName: context.name,
      consequence: 'This will permanently remove the context from the local Docker configuration. The daemon it points at is left untouched.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    try {
      await run(`Remove ${context.name}`, () => contexts.remove(context.name));
      setSelectedName((current) => (current === context.name ? undefined : current));
    } catch (cause) {
      reportError(`Could not remove ${context.name}`, (cause as Error).message);
    }
  }

  /**
   * A context's row. Every value the delivered card carried is here, each in a
   * column of its own, and every cell is the same number of lines whatever the
   * context's state: the description and the error Docker reports are the two
   * whose presence depends on it, and as lines of a card they alternated the row
   * height down the column — 95.1px with a description against 73.7px without,
   * measured on the delivered build at 1440×1000 and 1280×800.
   */
  const columns: DataTableColumn<ContextSummary>[] = [
    {
      id: 'active',
      header: '',
      // The marker for the one context in use, and nothing on the others. Wide
      // enough for the pill it carries and no wider; the switch itself is an
      // action of the cluster, never a badge that only a hover tells from this
      // one (plan-ui-coherence-optimisation/REQ-43).
      width: '88px',
      render: (context) => (context.active ? <StatusPill tone="success">active</StatusPill> : null),
    },
    {
      id: 'context',
      header: 'CONTEXT',
      width: '1.2fr',
      render: (context) => <TwoLineCell title={context.name} subtitle={context.kind} />,
    },
    {
      id: 'endpoint',
      header: 'ENDPOINT',
      // The widest flexible track on the screen, deliberately: the endpoint is
      // the longest value a context carries and the one this screen exists to
      // state. It still truncates at every viewport — 421.3px of intrinsic
      // width against 302.2px of track at 1440×1000 — which is why the panel
      // below the row holds it in full (REQ-21).
      width: '2.6fr',
      render: (context) => <MetaCell>{endpointOf(context)}</MetaCell>,
    },
    {
      id: 'tls',
      header: 'TLS',
      // Delivered as a `(tls)` suffix on the endpoint, where the truncation that
      // reaches the endpoint reaches it first: a column of its own is the value
      // kept, at a width that never truncates.
      width: '64px',
      render: (context) => <MetaCell>{context.tls ? 'tls' : undefined}</MetaCell>,
    },
    {
      id: 'description',
      header: 'DESCRIPTION',
      width: '1fr',
      render: (context) => <MetaCell>{context.description}</MetaCell>,
    },
    {
      id: 'state',
      header: 'STATE',
      // Docker's own refusal to read a context, kept as the badge the delivered
      // row carried; where there is none the column's own '–' costs the row no
      // height, and the message itself is in the panel.
      width: '110px',
      render: (context) => <BadgeListCell labels={context.error ? ['unreadable'] : []} tone="danger" />,
    },
    {
      id: 'actions',
      header: 'ACTIONS',
      // The cluster's own width and no more (REQ-9), stated as a length: an
      // intrinsic track resolves separately in the header and in every row. The
      // two controls a context row ever carries ink 106px of it — the same pair,
      // at the same width, as a builder's row.
      width: '120px',
      render: (context) => (
        <ActionButtonGroup
          actions={[
            // The most consequential click on this screen — it re-points the
            // whole application at another daemon — weighs `primary` and looks
            // like the control it is.
            ...(context.active ? [] : [{ id: 'use', label: 'Use', weight: 'primary' as const, onClick: () => handleUse(context) }]),
            { id: 'remove', label: 'Remove', weight: 'destructive' as const, onClick: () => handleRemove(context) },
          ]}
        />
      ),
    },
  ];

  return (
    <Stack gap="var(--space-5)">
      {/* The composition containers and images ship: the header and the toolbar
          above, and the list alone in a card of its own that it fills edge to
          edge. The list's one enclosing surface is that card, so the screen has
          none. */}
      <Stack gap="var(--space-4)">
        <SectionHeader title="Docker contexts" />
        <ScreenToolbar primaryAction={{ label: 'Create context', onClick: openCreate }} />
        <Card padding="none">
          <DataTable
            columns={columns}
            rows={contexts.contexts}
            rowKey={(context) => context.name}
            selectedRowKey={selectedName}
            onRowSelect={(context) => setSelectedName((current) => (current === context.name ? undefined : context.name))}
            expandedRowKey={selectedName}
            renderExpanded={(context) => <ContextDetail context={context} onClose={() => setSelectedName(undefined)} />}
            emptyState={
              contexts.error && contexts.contexts.length === 0 ? (
                <FailedReadEmptyState />
              ) : contexts.loaded ? (
                <EmptyState
                  title="No Docker contexts"
                  description="A context is how Docker records which daemon to talk to; creating one points Vexel at another."
                  // Its label is the invitation, never the toolbar's own word
                  // (DEF-2, `contexts-screen.md`): one surface, one control per name.
                  action={<Button onClick={openCreate}>Create the first context</Button>}
                />
              ) : (
                <EmptyState title="Loading contexts…" description={null} action={null} />
              )
            }
          />
        </Card>
      </Stack>

      <FormDialog
        open={createOpen}
        title="Create context"
        description="Creates a Docker context for a local socket or an SSH endpoint. A TCP+TLS context is created from the console; once created it is listed and usable here like any other."
        submitLabel="Create"
        submitting={creating}
        submitDisabled={name.trim() === '' || (kind === 'ssh' && host.trim() === '')}
        onSubmit={submitCreate}
        onCancel={() => setCreateOpen(false)}
      >
        <Stack gap="var(--space-3)">
          <FormField label="Name">
            <TextField ariaLabel="Context name" placeholder="e.g. remote-prod" value={name} onChange={setName} autoFocus />
          </FormField>
          <EndpointField
            kinds={ENDPOINT_KINDS}
            kind={kind}
            onKindChange={(next) => setKind(next as CreatableContextKind)}
            host={host}
            onHostChange={setHost}
          />
          <FormField label="Description" hint="Optional; shown next to the context in the list.">
            <TextField ariaLabel="Description" placeholder="e.g. Production host" value={description} onChange={setDescription} />
          </FormField>
        </Stack>
      </FormDialog>
    </Stack>
  );
}
