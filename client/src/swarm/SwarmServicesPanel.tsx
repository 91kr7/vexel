import { useState } from 'react';
import {
  ActionButtonGroup,
  Badge,
  Button,
  Card,
  CardList,
  DefinitionList,
  EmptyState,
  ErrorBanner,
  FormDialog,
  FormField,
  KeyValueEditor,
  MetaCell,
  NumberField,
  RepeatableRowList,
  Row,
  SectionHeader,
  Select,
  Stack,
  TextField,
  useToast,
  type CardListRowContent,
  type KeyValuePair,
} from '../ui';
import type {
  CreateSwarmServiceInput,
  SwarmListing,
  SwarmService,
  SwarmServiceMode,
  SwarmServicePort,
  UpdateSwarmServiceInput,
} from '../data/swarm-client';
import { useSwarmServiceDetail } from '../data/use-swarm-service-detail';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';
import { formatAge, formatReplicas, toLabels } from './swarm-formatting';

const MODE_OPTIONS = [
  { value: 'replicated', label: 'replicated' },
  { value: 'global', label: 'global' },
];

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

export interface SwarmServicesPanelProps {
  services: SwarmListing<SwarmService>;
  loaded: boolean;
  canManage: boolean;
  onCreate: (input: CreateSwarmServiceInput) => Promise<SwarmService>;
  onUpdate: (id: string, input: UpdateSwarmServiceInput) => Promise<SwarmService>;
  onRemove: (id: string) => Promise<void>;
}

/**
 * The Services & tasks panel of the Swarm screen (REQ-82): the services with
 * image, mode, replicas and published ports, created, updated, inspected with
 * their tasks and removed. Nothing here reads a compose file — a service is
 * composed from arguments (departure Three).
 */
export function SwarmServicesPanel({ services, loaded, canManage, onCreate, onUpdate, onRemove }: SwarmServicesPanelProps) {
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

  function serviceRow(service: SwarmService): CardListRowContent {
    const subtitleParts = [service.stack ? `stack: ${service.stack}` : undefined, portLine(service.ports) || undefined].filter(
      (part): part is string => Boolean(part),
    );
    return {
      title: service.name,
      subtitle: subtitleParts.length > 0 ? subtitleParts.join(' · ') : undefined,
      meta: (
        <Row gap="var(--space-3)" align="center">
          <MetaCell>{service.image}</MetaCell>
          <MetaCell>{formatReplicas(service.replicasRunning, service.replicasDesired)}</MetaCell>
          <Badge tone="info">{service.mode}</Badge>
        </Row>
      ),
    };
  }

  function serviceDetail(service: SwarmService) {
    const opened = detail.detail?.service.id === service.id ? detail.detail : undefined;
    return (
      <Stack gap="var(--space-3)">
        {detail.error ? <ErrorBanner title="Could not read the service" detail={detail.error} onRetry={detail.refresh} /> : null}
        <DefinitionList
          items={[
            { label: 'Service id', value: service.id },
            { label: 'Image', value: service.image },
            { label: 'Mode', value: service.mode },
            { label: 'Replicas', value: formatReplicas(service.replicasRunning, service.replicasDesired) },
            { label: 'Published ports', value: portLine(service.ports) || 'none' },
            { label: 'Stack', value: service.stack ?? 'none' },
            { label: 'Environment', value: opened && opened.env.length > 0 ? opened.env.join(' · ') : 'none' },
            { label: 'Updated', value: formatAge(service.updatedAt) },
          ]}
        />
        <SectionHeader variant="eyebrow" title="Tasks" />
        {opened ? (
          <DefinitionList
            items={
              opened.tasks.length === 0
                ? [{ label: 'tasks', value: 'no task yet' }]
                : opened.tasks.map((task) => ({
                    label: `${task.slot === undefined ? 'task' : `slot ${task.slot}`} · ${task.nodeHostname ?? task.nodeId ?? 'unassigned'}`,
                    value: [`${task.state} → ${task.desiredState}`, task.error ?? task.message].filter(Boolean).join(' · '),
                  }))
            }
          />
        ) : (
          <MetaCell>{detail.loaded ? 'No tasks read' : 'Reading tasks…'}</MetaCell>
        )}
        {canManage ? (
          <ActionButtonGroup
            actions={[
              { id: 'update', label: 'Update', onClick: () => openUpdate(service) },
              { id: 'remove', label: 'Remove', destructive: true, onClick: () => handleRemove(service) },
            ]}
          />
        ) : null}
      </Stack>
    );
  }

  return (
    <Card>
      <SectionHeader
        title="Services & tasks"
        trailing={
          canManage ? (
            <Button onClick={openCreate}>Create service</Button>
          ) : undefined
        }
      />
      <CardList
        items={services.items}
        itemKey={(service) => service.id}
        renderRow={serviceRow}
        selectedKey={openId}
        onSelect={(service) => setOpenId((current) => (current === service.id ? undefined : service.id))}
        expandedKey={openId}
        renderExpanded={serviceDetail}
        emptyState={
          <EmptyState
            title={services.unavailableReason ? 'No cluster to read' : loaded ? 'No services' : 'Reading services…'}
            description={services.unavailableReason}
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
