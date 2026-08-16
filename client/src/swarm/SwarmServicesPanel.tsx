import { useState } from 'react';
import {
  ActionButtonGroup,
  BadgeListCell,
  Button,
  Card,
  DataTable,
  DetailPanel,
  EmptyState,
  ErrorBanner,
  FormDialog,
  FormField,
  KeyValueEditor,
  MetaCell,
  NumberField,
  RepeatableRowList,
  Row,
  ScreenToolbar,
  SectionHeader,
  Select,
  Stack,
  StatusDotCell,
  TextField,
  TwoLineCell,
  useToast,
  type DataTableColumn,
  type KeyValuePair,
} from '../ui';
import type {
  CreateSwarmServiceInput,
  SwarmListing,
  SwarmService,
  SwarmServiceMode,
  SwarmServicePort,
  SwarmTask,
  UpdateSwarmServiceInput,
} from '../data/swarm-client';
import { useSwarmServiceDetail } from '../data/use-swarm-service-detail';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';
import { formatAge, formatReplicas, taskStateTone, toLabels } from './swarm-formatting';

const MODE_OPTIONS = [
  { value: 'replicated', label: 'replicated' },
  { value: 'global', label: 'global' },
];

/** What it takes for a service to appear here, for a cluster that runs none. */
const NO_SERVICES = 'A service is listed here once it is created on the cluster; the swarm then schedules its tasks itself.';

interface PortDraft {
  published: string;
  target: string;
  protocol: string;
}

interface ServiceForm {
  name: string;
  image: string;
  mode: SwarmServiceMode;
  replicas: number | undefined;
  env: KeyValuePair[];
  ports: PortDraft[];
  labels: KeyValuePair[];
}

const EMPTY_FORM: ServiceForm = { name: '', image: '', mode: 'replicated', replicas: 1, env: [], ports: [], labels: [] };

/** `KEY=value` strings, the daemon's own shape, so a value containing `=` survives. */
function toEnvStrings(pairs: KeyValuePair[]): string[] {
  return pairs.filter((pair) => pair.key.trim() !== '').map((pair) => `${pair.key.trim()}=${pair.value}`);
}

function toEnvPairs(env: string[]): KeyValuePair[] {
  return env.map((entry) => {
    const separator = entry.indexOf('=');
    return separator === -1 ? { key: entry, value: '' } : { key: entry.slice(0, separator), value: entry.slice(separator + 1) };
  });
}

/** Only published ports are sent: this panel publishes ports, it does not declare internal ones. */
function toPorts(drafts: PortDraft[]): SwarmServicePort[] {
  return drafts
    .map((draft) => ({
      published: Number.parseInt(draft.published, 10),
      target: Number.parseInt(draft.target, 10),
      protocol: draft.protocol.trim() === '' ? 'tcp' : draft.protocol.trim(),
    }))
    .filter((port) => Number.isFinite(port.target) && port.target > 0 && Number.isFinite(port.published));
}

function portLine(ports: SwarmServicePort[]): string {
  return ports.map((port) => `${port.published}:${port.target}/${port.protocol}`).join(', ');
}

function taskSlot(task: SwarmTask): string {
  return task.slot === undefined ? 'task' : `slot ${task.slot}`;
}

export interface SwarmServicesPanelProps {
  services: SwarmListing<SwarmService>;
  onCreate: (input: CreateSwarmServiceInput) => Promise<SwarmService>;
  onUpdate: (id: string, input: UpdateSwarmServiceInput) => Promise<SwarmService>;
  onRemove: (id: string) => Promise<void>;
}

/**
 * The Services & tasks panel of the Swarm screen (REQ-82): the services with
 * image, mode, replicas and published ports, created, updated, inspected with
 * their tasks and removed. Nothing here reads a compose file — a service is
 * composed from arguments (departure Three).
 *
 * **It is drawn only where there is a cluster to read**: the screen states the
 * swarm's condition once and renders this panel on a manager alone
 * (plan-ui-coherence-optimisation/REQ-52), so the panel repeats none of it.
 */
export function SwarmServicesPanel({ services, onCreate, onUpdate, onRemove }: SwarmServicesPanelProps) {
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const detail = useSwarmServiceDetail(openId);

  const [form, setForm] = useState<ServiceForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<SwarmService | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function openCreate() {
    setEditing(undefined);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openUpdate(service: SwarmService) {
    setEditing(service);
    setForm({
      name: service.name,
      image: service.image,
      mode: service.mode,
      replicas: service.replicasDesired ?? 1,
      env: toEnvPairs(detail.detail?.service.id === service.id ? (detail.detail?.env ?? []) : []),
      ports: service.ports.map((port) => ({ published: String(port.published ?? ''), target: String(port.target), protocol: port.protocol })),
      // Labels are set at creation; an update sends the service's whole current
      // spec back, which preserves them.
      labels: [],
    });
    setFormOpen(true);
  }

  async function submitForm() {
    setSubmitting(true);
    try {
      if (editing) {
        const input: UpdateSwarmServiceInput = {
          image: form.image.trim(),
          replicas: form.mode === 'global' ? undefined : form.replicas,
          env: toEnvStrings(form.env),
          ports: toPorts(form.ports),
        };
        await run(`Update ${editing.name}`, () => onUpdate(editing.id, input));
        push({ title: 'Service updated', message: editing.name, tone: 'success' });
      } else {
        const input: CreateSwarmServiceInput = {
          name: form.name.trim(),
          image: form.image.trim(),
          mode: form.mode,
          replicas: form.mode === 'global' ? undefined : (form.replicas ?? 1),
          env: toEnvStrings(form.env),
          ports: toPorts(form.ports),
          labels: toLabels(form.labels),
        };
        await run(`Create ${input.name}`, () => onCreate(input));
        push({ title: 'Service created', message: input.name, tone: 'success' });
      }
      setFormOpen(false);
    } catch (cause) {
      reportError(editing ? `Could not update ${editing.name}` : 'Could not create the service', (cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(service: SwarmService) {
    const confirmed = await confirm({
      targetName: service.name,
      consequence: 'This removes the service from the cluster; every task it runs is stopped.',
      confirmLabel: 'Remove service',
    });
    if (!confirmed) return;
    try {
      await run(`Remove ${service.name}`, () => onRemove(service.id));
      setOpenId(undefined);
      push({ title: 'Service removed', message: service.name, tone: 'success' });
    } catch (cause) {
      reportError(`Could not remove ${service.name}`, (cause as Error).message);
    }
  }

  /**
   * A service's row. Every cell is a fixed number of lines whatever the service
   * is: the stack a service may belong to and the ports it may publish shared
   * one subtitle line, and each is a column here, where its absence is the
   * column's own '–' and costs the row no height.
   */
  const columns: DataTableColumn<SwarmService>[] = [
    {
      id: 'service',
      header: 'SERVICE',
      width: '1.4fr',
      render: (service) => <TwoLineCell title={service.name} />,
    },
    {
      id: 'image',
      header: 'IMAGE',
      width: '1.8fr',
      render: (service) => <MetaCell>{service.image}</MetaCell>,
    },
    {
      id: 'mode',
      header: 'MODE',
      // What the service *is*, in words and in a tone — a statement drawn like a
      // statement, beside the cluster that changes it
      // (plan-ui-coherence-optimisation/REQ-27).
      width: '116px',
      render: (service) => <BadgeListCell labels={[service.mode]} tone="info" />,
    },
    {
      id: 'replicas',
      header: 'REPLICAS',
      width: '116px',
      render: (service) => <MetaCell>{formatReplicas(service.replicasRunning, service.replicasDesired)}</MetaCell>,
    },
    {
      id: 'ports',
      header: 'PUBLISHED PORTS',
      width: '1.2fr',
      render: (service) => <MetaCell>{portLine(service.ports)}</MetaCell>,
    },
    {
      id: 'stack',
      header: 'STACK',
      width: '1fr',
      render: (service) => <MetaCell>{service.stack}</MetaCell>,
    },
    {
      id: 'actions',
      header: 'ACTIONS',
      // The cluster's own width and no more, stated as a length
      // (plan-ui-coherence-optimisation/REQ-9).
      width: '140px',
      render: (service) => (
        <ActionButtonGroup
          actions={[
            { id: 'update', label: 'Update', onClick: () => openUpdate(service) },
            { id: 'remove', label: 'Remove', weight: 'destructive' as const, onClick: () => void handleRemove(service) },
          ]}
        />
      ),
    },
  ];

  /**
   * A task's row, in the nested list the opened service's panel holds. A task
   * is an object of the cluster like any other, so it is listed by the object
   * list rather than folded into the property grid, where its state, its node
   * and the daemon's message about it were becoming label/value pairs.
   */
  const taskColumns: DataTableColumn<SwarmTask>[] = [
    {
      id: 'slot',
      header: 'SLOT',
      width: '116px',
      render: (task) => <TwoLineCell title={taskSlot(task)} />,
    },
    {
      id: 'node',
      header: 'NODE',
      width: '1.6fr',
      render: (task) => <MetaCell>{task.nodeHostname ?? task.nodeId}</MetaCell>,
    },
    {
      id: 'state',
      header: 'STATE',
      width: '150px',
      render: (task) => <StatusDotCell tone={taskStateTone(task.state)} label={task.state} />,
    },
    {
      id: 'desired',
      header: 'DESIRED',
      width: '124px',
      render: (task) => <MetaCell>{task.desiredState}</MetaCell>,
    },
    {
      id: 'reports',
      header: 'DAEMON REPORTS',
      // A task that failed explains itself; every other task reads as the
      // column's own '–'.
      width: '2fr',
      render: (task) => <MetaCell>{task.error ?? task.message}</MetaCell>,
    },
  ];

  /**
   * The opened service, at the content column's full width: its properties in
   * the library's grid, then its tasks as a list of their own.
   */
  function serviceDetail(service: SwarmService) {
    const opened = detail.detail?.service.id === service.id ? detail.detail : undefined;
    return (
      <DetailPanel
        dismissal="opening-gesture"
        onClose={() => setOpenId(undefined)}
        properties={[
          { label: 'Service id', value: service.id },
          { label: 'Image', value: service.image },
          { label: 'Mode', value: service.mode },
          { label: 'Replicas', value: formatReplicas(service.replicasRunning, service.replicasDesired) },
          { label: 'Published ports', value: portLine(service.ports) || 'none' },
          { label: 'Stack', value: service.stack ?? 'none' },
          { label: 'Environment', value: opened && opened.env.length > 0 ? opened.env.join(' · ') : 'none' },
          { label: 'Updated', value: formatAge(service.updatedAt) },
        ]}
        // A service's bands hold an id, an image reference and an environment
        // line: single-line values that are long rather than free text.
        propertiesContentClass="long-single-line"
      >
        <Stack gap="var(--space-3)">
          {detail.error ? <ErrorBanner title="Could not read the service" detail={detail.error} onRetry={detail.refresh} /> : null}
          <SectionHeader variant="eyebrow" title="Tasks" />
          <DataTable
            variant="comfortable"
            columns={taskColumns}
            rows={opened?.tasks ?? []}
            rowKey={(task) => task.id}
            emptyState={
              detail.loaded ? (
                <EmptyState
                  title="No tasks"
                  description="The cluster has scheduled no task for this service yet."
                  action={null}
                  compact
                />
              ) : (
                <EmptyState title="Reading the tasks…" description={null} action={null} compact />
              )
            }
          />
        </Stack>
      </DetailPanel>
    );
  }

  return (
    <Card>
      <SectionHeader title="Services & tasks" description="In name order, with the tasks of the opened service" />
      {/* The page-level action, in the toolbar under the header rather than in
          the card's header. */}
      <ScreenToolbar primaryAction={{ label: 'Create service', onClick: openCreate }} />
      <DataTable
        variant="comfortable"
        columns={columns}
        rows={services.items}
        rowKey={(service) => service.id}
        selectedRowKey={openId}
        onRowSelect={(service) => setOpenId((current) => (current === service.id ? undefined : service.id))}
        expandedRowKey={openId}
        renderExpanded={serviceDetail}
        emptyState={
          <EmptyState
            title="No services"
            description={services.unavailableReason ?? NO_SERVICES}
            // Where the reading itself states a reason, creating a service is
            // not what resolves it, so no action is offered for it.
            // Its label is the invitation, never the toolbar's own word (DEF-2,
            // `swarm-services-panel.md`): one surface holds one control per name.
            action={services.unavailableReason ? null : <Button onClick={openCreate}>Create the first service</Button>}
          />
        }
      />

      <FormDialog
        open={formOpen}
        title={editing ? `Update ${editing.name}` : 'Create service'}
        description={
          editing
            ? 'Only the fields changed here are sent; the rest of the service definition is preserved.'
            : 'Creates a service on the swarm. The cluster schedules its tasks itself.'
        }
        submitLabel={editing ? 'Update' : 'Create'}
        submitting={submitting}
        submitDisabled={form.image.trim() === '' || (!editing && form.name.trim() === '')}
        onSubmit={submitForm}
        onCancel={() => setFormOpen(false)}
      >
        <Stack gap="var(--space-3)">
          {editing ? null : (
            <FormField label="Name">
              <TextField ariaLabel="Service name" placeholder="e.g. edge_proxy" value={form.name} onChange={(name) => setForm({ ...form, name })} autoFocus />
            </FormField>
          )}
          <FormField label="Image">
            <TextField ariaLabel="Service image" placeholder="e.g. nginx:1.27" value={form.image} onChange={(image) => setForm({ ...form, image })} />
          </FormField>
          <FormField label="Mode">
            <Select
              ariaLabel="Service mode"
              value={form.mode}
              options={MODE_OPTIONS}
              onChange={(mode) => setForm({ ...form, mode: mode as SwarmServiceMode })}
            />
          </FormField>
          {form.mode === 'global' ? (
            <FormField label="Replicas" hint="A global service runs one task per node and has no replica count.">
              <MetaCell>one task per node</MetaCell>
            </FormField>
          ) : (
            <FormField label="Replicas">
              <NumberField ariaLabel="Replica count" min={0} value={form.replicas} onChange={(replicas) => setForm({ ...form, replicas })} />
            </FormField>
          )}
          <FormField label="Environment">
            <KeyValueEditor pairs={form.env} onChange={(env) => setForm({ ...form, env })} name="Environment" />
          </FormField>
          {editing ? null : (
            <FormField label="Labels" hint="Set at creation; they are what lets a caller find this service again later.">
              <KeyValueEditor pairs={form.labels} onChange={(labels) => setForm({ ...form, labels })} name="Labels" addLabel="Add label" />
            </FormField>
          )}
          <FormField label="Published ports" hint="Published port : container port, e.g. 8080 : 80.">
            <RepeatableRowList
              items={form.ports}
              onChange={(ports) => setForm({ ...form, ports })}
              createItem={() => ({ published: '', target: '', protocol: 'tcp' })}
              addLabel="Add port"
              renderRow={(port, index, update) => (
                <Row gap="var(--space-2)" align="center">
                  <TextField ariaLabel={`Published port ${index + 1}`} placeholder="8080" value={port.published} onChange={(published) => update({ published })} />
                  <TextField ariaLabel={`Container port ${index + 1}`} placeholder="80" value={port.target} onChange={(target) => update({ target })} />
                  <TextField ariaLabel={`Protocol ${index + 1}`} placeholder="tcp" value={port.protocol} onChange={(protocol) => update({ protocol })} />
                </Row>
              )}
            />
          </FormField>
        </Stack>
      </FormDialog>
    </Card>
  );
}
