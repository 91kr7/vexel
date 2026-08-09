import { useState } from 'react';
import {
  ActionButtonGroup,
  Badge,
  Button,
  Card,
  CardList,
  DefinitionList,
  EmptyState,
  EndpointField,
  ErrorBanner,
  FormDialog,
  FormField,
  Grid,
  SectionHeader,
  Stack,
  TextField,
  useToast,
  type CardListRowContent,
  type DefinitionItem,
  type EndpointKindOption,
} from '../ui';
import type { ContextSummary, CreatableContextKind, DaemonInfo } from '../data/contexts-client';
import { useContexts } from '../data/use-contexts';
import { useDaemonInfo } from '../data/use-daemon-info';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';

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

function contextTitle(context: ContextSummary): string {
  return `${context.name} (${context.kind})`;
}

function endpointLine(context: ContextSummary): string {
  const endpoint = context.endpoint === '' ? 'no endpoint recorded' : context.endpoint;
  return context.tls ? `${endpoint} (tls)` : endpoint;
}

function daemonItems(info: DaemonInfo): DefinitionItem[] {
  return [
    { label: 'Docker version', value: info.version },
    { label: 'Engine API', value: info.apiVersion },
    { label: 'BuildKit', value: info.buildkitVersion ?? 'not reported' },
    { label: 'Storage driver', value: info.storageDriver },
    { label: 'Cgroup driver', value: info.cgroupVersion ? `${info.cgroupDriver} (v${info.cgroupVersion})` : info.cgroupDriver },
    { label: 'OS / Arch', value: `${info.osType} ${info.kernelVersion} / ${info.architecture}` },
    { label: 'Root directory', value: info.rootDirectory },
    { label: 'Containers (running)', value: `${info.containers.total} (${info.containers.running})` },
  ];
}

/**
 * The Contexts screen (REQ-92, REQ-93, REQ-94): every Docker context with its
 * endpoint and which one is active — whatever the endpoint kind, a TCP+TLS one
 * included — creating a local-socket or SSH context, switching the active one,
 * removing one, and the daemon information of the context in use.
 */
export function ContextsScreen() {
  const contexts = useContexts();
  const daemon = useDaemonInfo();
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

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
    } catch (cause) {
      reportError(`Could not remove ${context.name}`, (cause as Error).message);
    }
  }

  function contextRow(context: ContextSummary): CardListRowContent {
    return {
      title: contextTitle(context),
      subtitle: context.description ? [endpointLine(context), context.description] : endpointLine(context),
      selection: { active: context.active, onUse: () => handleUse(context) },
      badges: context.error ? <Badge tone="danger">unreadable</Badge> : undefined,
      meta: <ActionButtonGroup actions={[{ id: 'remove', label: 'Remove', destructive: true, onClick: () => handleRemove(context) }]} />,
    };
  }

  return (
    <Stack gap="var(--space-5)">
      <Grid columns="1.2fr 1fr" gap="var(--space-5)">
        <Card>
          <SectionHeader title="Docker contexts" trailing={<Button onClick={openCreate}>Create context</Button>} />
          <Stack gap="var(--space-3)">
            {contexts.error ? <ErrorBanner title="Could not load the contexts" detail={contexts.error} onRetry={contexts.refresh} /> : null}
            <CardList
              items={contexts.contexts}
              itemKey={(context) => context.name}
              renderRow={contextRow}
              emptyState={<EmptyState title={contexts.loaded ? 'No Docker contexts' : 'Loading contexts…'} />}
            />
          </Stack>
        </Card>

        <Card>
          <SectionHeader title="Daemon of active context" />
          <Stack gap="var(--space-3)">
            {daemon.error ? <ErrorBanner title="Could not read the daemon" detail={daemon.error} onRetry={daemon.refresh} /> : null}
            {daemon.info ? (
              <DefinitionList items={daemonItems(daemon.info)} />
            ) : daemon.error ? null : (
              <EmptyState title={daemon.loaded ? 'The daemon reported nothing' : 'Reading the daemon…'} />
            )}
          </Stack>
        </Card>
      </Grid>

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
