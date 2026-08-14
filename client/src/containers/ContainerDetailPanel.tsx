import { useEffect, useState } from 'react';
import {
  Button,
  CodeViewer,
  CollapsibleSection,
  ContentColumns,
  DefinitionList,
  DetailPanel,
  EmptyState,
  ErrorBanner,
  FormFooter,
  Grid,
  KeyValueEditor,
  MetaCell,
  NumberField,
  RepeatableRowList,
  Row,
  SectionHeader,
  Select,
  Stack,
  Tabs,
  TextField,
  Toggle,
  useToast,
  type KeyValuePair,
} from '../ui';
import {
  updateContainerConfig,
  type ContainerConfigUpdate,
  type ContainerInspect,
  type ContainerSummary,
  type MountInfo,
  type PortBinding,
} from '../data/containers-client';
import { ContainerLogsView } from './ContainerLogsView';
import { ContainerProcessesView } from './ContainerProcessesView';
import { ContainerSessionView } from './ContainerSessionView';
import { ContainerStatsView } from './ContainerStatsView';
import { useContainerDetail } from '../data/use-container-detail';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';

type ContainerDetailTab = 'logs' | 'stats' | 'config' | 'processes' | 'inspect' | 'exec' | 'attach';

export interface ContainerDetailPanelProps {
  container: ContainerSummary;
  onClose: () => void;
  /** Called after a recreate with the new container id, since the old one no longer exists. */
  onContainerReplaced: (newId: string) => void;
}

interface ConfigFormState {
  restartPolicyName: string;
  maxRetries?: number;
  cpus?: number;
  memoryMb?: number;
  env: KeyValuePair[];
  ports: PortBinding[];
  mounts: MountInfo[];
  healthEnabled: boolean;
  healthCommand: string;
  healthIntervalSec?: number;
  healthTimeoutSec?: number;
  healthRetries?: number;
  healthStartPeriodSec?: number;
}

const RESTART_POLICY_OPTIONS = [
  { value: 'no', label: 'no' },
  { value: 'always', label: 'always' },
  { value: 'on-failure', label: 'on-failure' },
  { value: 'unless-stopped', label: 'unless-stopped' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)}${units[unitIndex]}`;
}

function formatPorts(ports: PortBinding[]): string {
  if (ports.length === 0) return '–';
  return ports.map((port) => (port.hostPort ? `${port.hostPort}→${port.containerPort}/${port.protocol}` : `${port.containerPort}/${port.protocol}`)).join(', ');
}

function parseEnvEntry(entry: string): KeyValuePair {
  const separatorIndex = entry.indexOf('=');
  if (separatorIndex === -1) return { key: entry, value: '' };
  return { key: entry.slice(0, separatorIndex), value: entry.slice(separatorIndex + 1) };
}

function buildFormState(inspect: ContainerInspect): ConfigFormState {
  return {
    restartPolicyName: inspect.restartPolicy.name,
    maxRetries: inspect.restartPolicy.maximumRetryCount,
    cpus: inspect.resourceLimits.cpus,
    memoryMb: inspect.resourceLimits.memoryBytes ? Math.round(inspect.resourceLimits.memoryBytes / (1024 * 1024)) : undefined,
    env: inspect.env.map(parseEnvEntry),
    ports: inspect.ports.map((port) => ({ ...port })),
    mounts: inspect.mounts.map((mount) => ({ ...mount })),
    healthEnabled: Boolean(inspect.healthCheck),
    healthCommand: inspect.healthCheck?.test.filter((token) => token !== 'CMD-SHELL' && token !== 'CMD').join(' ') ?? '',
    healthIntervalSec: inspect.healthCheck?.intervalNanos ? inspect.healthCheck.intervalNanos / 1e9 : undefined,
    healthTimeoutSec: inspect.healthCheck?.timeoutNanos ? inspect.healthCheck.timeoutNanos / 1e9 : undefined,
    healthRetries: inspect.healthCheck?.retries,
    healthStartPeriodSec: inspect.healthCheck?.startPeriodNanos ? inspect.healthCheck.startPeriodNanos / 1e9 : undefined,
  };
}

/** Fields that require Docker to recreate the container when they change. */
function buildUpdate(form: ConfigFormState, initial: ConfigFormState): ContainerConfigUpdate {
  const update: ContainerConfigUpdate = {};

  if (form.restartPolicyName !== initial.restartPolicyName || form.maxRetries !== initial.maxRetries) {
    update.restartPolicy = { name: form.restartPolicyName, maximumRetryCount: form.restartPolicyName === 'on-failure' ? form.maxRetries : undefined };
  }
  if (form.cpus !== initial.cpus || form.memoryMb !== initial.memoryMb) {
    update.resourceLimits = { cpus: form.cpus, memoryBytes: form.memoryMb ? form.memoryMb * 1024 * 1024 : undefined };
  }

  const env = form.env.filter((pair) => pair.key.trim() !== '').map((pair) => `${pair.key}=${pair.value}`);
  const initialEnv = initial.env.filter((pair) => pair.key.trim() !== '').map((pair) => `${pair.key}=${pair.value}`);
  if (JSON.stringify(env) !== JSON.stringify(initialEnv)) update.env = env;

  const ports = form.ports.filter((port) => port.containerPort !== undefined);
  if (JSON.stringify(ports) !== JSON.stringify(initial.ports)) update.ports = ports;

  const mounts = form.mounts.filter((mount) => mount.source.trim() !== '' && mount.destination.trim() !== '');
  if (JSON.stringify(mounts) !== JSON.stringify(initial.mounts)) update.mounts = mounts;

  const healthChanged =
    form.healthEnabled !== initial.healthEnabled ||
    form.healthCommand !== initial.healthCommand ||
    form.healthIntervalSec !== initial.healthIntervalSec ||
    form.healthTimeoutSec !== initial.healthTimeoutSec ||
    form.healthRetries !== initial.healthRetries ||
    form.healthStartPeriodSec !== initial.healthStartPeriodSec;
  if (healthChanged) {
    update.healthCheck = form.healthEnabled
      ? {
          test: form.healthCommand.trim() ? ['CMD-SHELL', form.healthCommand.trim()] : [],
          intervalNanos: form.healthIntervalSec ? form.healthIntervalSec * 1e9 : undefined,
          timeoutNanos: form.healthTimeoutSec ? form.healthTimeoutSec * 1e9 : undefined,
          retries: form.healthRetries,
          startPeriodNanos: form.healthStartPeriodSec ? form.healthStartPeriodSec * 1e9 : undefined,
        }
      : null;
  }

  return update;
}

function updateRequiresRecreate(update: ContainerConfigUpdate): boolean {
  return update.env !== undefined || update.ports !== undefined || update.mounts !== undefined || update.healthCheck !== undefined;
}

/**
 * Container detail surface (REQ-24, REQ-25, REQ-26, REQ-34, REQ-35): a Config
 * tab showing and editing restart policy, resource limits, environment,
 * ports, mounts and health check (warning before a Docker-required
 * recreate), an Inspect tab with the full structured inspect data plus the
 * raw payload, copyable, and — for running containers — Exec/Attach tabs
 * opening an interactive session. Rename and the filesystem export both live on
 * the row instead, in its overflow menu.
 */
export function ContainerDetailPanel({ container, onClose, onContainerReplaced }: ContainerDetailPanelProps) {
  const { inspect, loaded, error, refresh } = useContainerDetail(container.id);
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  const [activeTab, setActiveTab] = useState<ContainerDetailTab>('config');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ConfigFormState | null>(null);
  const [initialForm, setInitialForm] = useState<ConfigFormState | null>(null);

  useEffect(() => {
    setEditing(false);
    setForm(null);
    setInitialForm(null);
  }, [container.id]);

  function startEdit() {
    if (!inspect) return;
    const state = buildFormState(inspect);
    setForm(state);
    setInitialForm(state);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setForm(null);
    setInitialForm(null);
  }

  async function handleSave() {
    if (!form || !initialForm) return;
    const update = buildUpdate(form, initialForm);
    if (Object.keys(update).length === 0) {
      cancelEdit();
      return;
    }
    if (updateRequiresRecreate(update)) {
      const confirmed = await confirm({
        targetName: container.name,
        consequence:
          'Docker cannot apply this change in place: the container will be stopped, removed and recreated with the new configuration, keeping its name, mounts and networks.',
        confirmLabel: 'Recreate container',
        destructive: false,
      });
      if (!confirmed) return;
    }
    setSaving(true);
    try {
      const result = await run(`Update configuration for ${container.name}`, () => updateContainerConfig(container.id, update));
      push({
        title: result.path === 'recreate' ? 'Container recreated' : 'Configuration updated',
        message:
          result.path === 'recreate'
            ? `${container.name} was recreated with the new configuration.`
            : `${container.name}'s configuration was updated in place.`,
        tone: 'success',
      });
      cancelEdit();
      if (result.path === 'recreate') onContainerReplaced(result.container.id);
      else refresh();
    } catch (cause) {
      reportError(`Could not update configuration for ${container.name}`, (cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function renderConfigView(data: ContainerInspect) {
    if (editing && form) {
      const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
      return (
        <Stack gap="var(--space-4)">
          <Row gap="var(--space-3)" wrap>
            <Select
              ariaLabel="Restart policy"
              value={form.restartPolicyName}
              options={RESTART_POLICY_OPTIONS}
              onChange={(value) => setForm({ ...form, restartPolicyName: value })}
            />
            {form.restartPolicyName === 'on-failure' ? (
              <NumberField ariaLabel="Max retries" placeholder="Max retries" value={form.maxRetries} onChange={(value) => setForm({ ...form, maxRetries: value })} />
            ) : null}
            <NumberField ariaLabel="CPU limit" placeholder="CPU limit (cpus)" step={0.1} value={form.cpus} onChange={(value) => setForm({ ...form, cpus: value })} />
            <NumberField ariaLabel="Memory limit" placeholder="Memory limit (MB)" value={form.memoryMb} onChange={(value) => setForm({ ...form, memoryMb: value })} />
          </Row>

          <SectionHeader title="Environment variables" />
          <KeyValueEditor pairs={form.env} onChange={(env) => setForm({ ...form, env })} name="Environment" />

          <SectionHeader title="Port mappings" />
          <RepeatableRowList
            items={form.ports}
            onChange={(ports) => setForm({ ...form, ports })}
            createItem={(): PortBinding => ({ containerPort: 0, protocol: 'tcp' })}
            addLabel="Add port"
            renderRow={(port, index, update) => (
              <>
                <NumberField ariaLabel={`Container port ${index + 1}`} placeholder="Container port" value={port.containerPort || undefined} onChange={(value) => update({ containerPort: value ?? 0 })} />
                <Select
                  ariaLabel={`Protocol ${index + 1}`}
                  value={port.protocol}
                  options={[
                    { value: 'tcp', label: 'tcp' },
                    { value: 'udp', label: 'udp' },
                  ]}
                  onChange={(value) => update({ protocol: value === 'udp' ? 'udp' : 'tcp' })}
                />
                <NumberField ariaLabel={`Host port ${index + 1}`} placeholder="Host port" value={port.hostPort} onChange={(value) => update({ hostPort: value })} />
              </>
            )}
          />

          <SectionHeader title="Mounts" />
          <RepeatableRowList
            items={form.mounts}
            onChange={(mounts) => setForm({ ...form, mounts })}
            createItem={() => ({ type: 'bind', source: '', destination: '', readOnly: false })}
            addLabel="Add mount"
            renderRow={(mount, index, update) => (
              <>
                <TextField ariaLabel={`Source ${index + 1}`} placeholder="Source" value={mount.source} onChange={(value) => update({ source: value })} />
                <TextField ariaLabel={`Destination ${index + 1}`} placeholder="Destination" value={mount.destination} onChange={(value) => update({ destination: value })} />
                <Toggle ariaLabel={`Read only ${index + 1}`} label="ro" checked={mount.readOnly} onChange={(value) => update({ readOnly: value })} />
              </>
            )}
          />

          <SectionHeader title="Health check" />
          <Toggle label="Enabled" checked={form.healthEnabled} onChange={(value) => setForm({ ...form, healthEnabled: value })} />
          {form.healthEnabled ? (
            <Stack gap="var(--space-2)">
              <TextField
                ariaLabel="Health check command"
                placeholder="Command (e.g. curl -f localhost/healthz)"
                value={form.healthCommand}
                onChange={(value) => setForm({ ...form, healthCommand: value })}
              />
              <Row gap="var(--space-3)" wrap>
                <NumberField ariaLabel="Interval seconds" placeholder="Interval (s)" value={form.healthIntervalSec} onChange={(value) => setForm({ ...form, healthIntervalSec: value })} />
                <NumberField ariaLabel="Timeout seconds" placeholder="Timeout (s)" value={form.healthTimeoutSec} onChange={(value) => setForm({ ...form, healthTimeoutSec: value })} />
                <NumberField ariaLabel="Retries" placeholder="Retries" value={form.healthRetries} onChange={(value) => setForm({ ...form, healthRetries: value })} />
                <NumberField ariaLabel="Start period seconds" placeholder="Start period (s)" value={form.healthStartPeriodSec} onChange={(value) => setForm({ ...form, healthStartPeriodSec: value })} />
              </Row>
            </Stack>
          ) : null}

          <FormFooter dirty={dirty} saving={saving} onSave={handleSave} onCancel={cancelEdit} saveLabel="Save changes" />
        </Stack>
      );
    }

    return (
      <Grid arrangement="pair">
        <Stack gap="var(--space-3)">
          <SectionHeader variant="eyebrow" title="Runtime configuration" />
          <DefinitionList
            items={[
              { label: 'Restart policy', value: data.restartPolicy.maximumRetryCount ? `${data.restartPolicy.name} (max ${data.restartPolicy.maximumRetryCount})` : data.restartPolicy.name },
              { label: 'CPU limit', value: data.resourceLimits.cpus ? `${data.resourceLimits.cpus} cpus` : '–' },
              { label: 'Memory limit', value: data.resourceLimits.memoryBytes ? formatBytes(data.resourceLimits.memoryBytes) : '–' },
              { label: 'Port mapping', value: formatPorts(data.ports) },
              { label: 'Health check', value: data.healthCheck ? data.healthCheck.test.join(' ') : 'none' },
              { label: 'Networks', value: data.networks.map((network) => network.name).join(', ') || '–' },
            ]}
          />
        </Stack>
        <Stack gap="var(--space-3)">
          <SectionHeader variant="eyebrow" title="Environment · Mounts" />
          <ContentColumns contentClass="long-single-line">
            {data.env.length === 0 && data.mounts.length === 0 ? <MetaCell>–</MetaCell> : null}
            {data.env.map((entry) => (
              <MetaCell key={entry} wrap>
                {entry}
              </MetaCell>
            ))}
            {data.mounts.map((mount) => (
              <MetaCell key={`${mount.source}:${mount.destination}`} wrap>
                {`mount: ${mount.source} → ${mount.destination} (${mount.readOnly ? 'ro' : 'rw'})`}
              </MetaCell>
            ))}
          </ContentColumns>
          <Row>
            <Button variant="subtle" onClick={startEdit}>
              Edit configuration
            </Button>
          </Row>
        </Stack>
      </Grid>
    );
  }

  function renderInspectView(data: ContainerInspect) {
    return (
      <Stack gap="var(--space-4)">
        <DefinitionList
          items={[
            { label: 'Id', value: data.id.slice(0, 12), copyValue: data.id },
            { label: 'Name', value: data.name },
            { label: 'Image', value: data.image, copyValue: data.image },
            { label: 'Command', value: data.command.join(' ') || '–' },
            { label: 'Entrypoint', value: data.entrypoint.join(' ') || '–' },
            { label: 'Created', value: data.createdAt },
            { label: 'State', value: data.state.status },
            { label: 'Started at', value: data.state.startedAt || '–' },
            { label: 'Finished at', value: data.state.finishedAt || '–' },
            { label: 'Exit code', value: data.state.exitCode ?? '–' },
          ]}
        />
        <CollapsibleSection title="Networks" summary={`${data.networks.length}`}>
          <DefinitionList items={data.networks.map((network) => ({ label: network.name, value: network.ipAddress ?? '–' }))} />
        </CollapsibleSection>
        <CollapsibleSection title="Labels" summary={`${Object.keys(data.labels).length}`}>
          <DefinitionList contentClass="long-single-line" items={Object.entries(data.labels).map(([key, value]) => ({ label: key, value }))} />
        </CollapsibleSection>
        {data.health ? (
          <CollapsibleSection title="Health" summary={data.health.status}>
            <DefinitionList items={[{ label: 'Status', value: data.health.status }, { label: 'Failing streak', value: data.health.failingStreak ?? 0 }]} />
            {data.health.log.map((entry, index) => (
              <CodeViewer key={index} code={entry.output} maxHeight="120px" />
            ))}
          </CollapsibleSection>
        ) : null}
        <SectionHeader variant="eyebrow" title="Raw payload" description="Exactly as received from the Engine API." />
        <CodeViewer code={JSON.stringify(data.raw, null, 2)} maxHeight="320px" />
      </Stack>
    );
  }

  return (
    // The header area is deliberately empty, and stays empty: "Export
    // filesystem…" was this panel's only action and it is started from the row's
    // overflow menu now, and the close control leaves with `dismissal` — the row
    // that opened the panel closes it, and `Escape` closes it from the keyboard.
    // Neither is replaced by anything.
    <DetailPanel dismissal="opening-gesture" onClose={onClose}>
      <Stack gap="var(--space-4)">
        <Tabs
          tabs={[
            { id: 'logs', label: 'Logs' },
            { id: 'stats', label: 'Stats' },
            { id: 'config', label: 'Config' },
            { id: 'processes', label: 'Processes' },
            { id: 'inspect', label: 'Inspect' },
            ...(container.state === 'running' ? [{ id: 'exec', label: 'Exec' }, { id: 'attach', label: 'Attach' }] : []),
          ]}
          activeId={activeTab}
          onSelect={(id) => setActiveTab(id as ContainerDetailTab)}
        />
        {activeTab === 'logs' ? (
          <ContainerLogsView container={container} />
        ) : activeTab === 'stats' ? (
          // Unmounting the view is what stops the live stats stream (REQ-32).
          <ContainerStatsView container={container} />
        ) : activeTab === 'processes' ? (
          <ContainerProcessesView container={container} />
        ) : activeTab === 'exec' ? (
          // Unmounting the view is what closes the interactive session (REQ-36).
          <ContainerSessionView container={container} kind="exec" />
        ) : activeTab === 'attach' ? (
          <ContainerSessionView container={container} kind="attach" />
        ) : (
          <>
            {error ? <ErrorBanner title="Could not load container details" detail={error} onRetry={refresh} /> : null}
            {!inspect ? (
              <EmptyState title={loaded ? 'No inspect data available' : 'Loading container details…'} />
            ) : activeTab === 'config' ? (
              renderConfigView(inspect)
            ) : (
              renderInspectView(inspect)
            )}
          </>
        )}
      </Stack>
    </DetailPanel>
  );
}
