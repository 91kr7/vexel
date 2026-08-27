import { useEffect, useState } from 'react';
import {
  Badge,
  BandStack,
  Button,
  Card,
  Chip,
  CodeViewer,
  CollapsibleSection,
  DefinitionList,
  EmptyState,
  ErrorBanner,
  FieldList,
  FormFooter,
  Grid,
  KeyValueEditor,
  NumberField,
  RepeatableRowList,
  Row,
  ScrollArea,
  SectionHeader,
  Select,
  Spacer,
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
import { stateTone } from './container-status';
import { useContainerDetail } from '../data/use-container-detail';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';

type ContainerDetailTab = 'logs' | 'stats' | 'config' | 'processes' | 'inspect' | 'exec' | 'attach';

/**
 * The tab row's order, and with it the tab the detail opens on: the first entry is both
 * (tabs_composition_refactor/REQ-11). The seven are declared alike — `runningOnly` decides a tab's
 * presence in the row, never its presentation (tabs_composition_refactor/REQ-12).
 */
const DETAIL_TABS: { id: ContainerDetailTab; label: string; runningOnly?: boolean }[] = [
  { id: 'config', label: 'Config' },
  { id: 'logs', label: 'Logs' },
  { id: 'stats', label: 'Stats' },
  { id: 'processes', label: 'Processes' },
  { id: 'inspect', label: 'Inspect' },
  { id: 'exec', label: 'Exec', runningOnly: true },
  { id: 'attach', label: 'Attach', runningOnly: true },
];

export interface ContainerDetailPanelProps {
  container: ContainerSummary;
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

/** Docker states a health check's durations in nanoseconds; the form asks for, and shows, seconds. */
function formatNanoSeconds(nanos?: number): string {
  if (!nanos) return '–';
  return `${Number((nanos / 1e9).toFixed(3))}s`;
}

/** The command as the form's single field holds it: without the `CMD`/`CMD-SHELL` token Docker prefixes it with. */
function formatHealthCommand(test: string[]): string {
  return test.filter((token) => token !== 'CMD-SHELL' && token !== 'CMD').join(' ') || '–';
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

/** What a save would cost, stated in the form's footer for as long as the operator is editing (REQ-25). */
const RECREATE_NOTE = 'Environment and Mounts changes require the container to be recreated.';

function updateRequiresRecreate(update: ContainerConfigUpdate): boolean {
  return update.env !== undefined || update.ports !== undefined || update.mounts !== undefined || update.healthCheck !== undefined;
}

/** The container's tabbed detail, drawn as the body of the dialog that carries it. */
export function ContainerDetailPanel({ container, onContainerReplaced }: ContainerDetailPanelProps) {
  const { inspect, loaded, error, refresh } = useContainerDetail(container.id);
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  const [activeTab, setActiveTab] = useState<ContainerDetailTab>(DETAIL_TABS[0].id);
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
        /*
          Five groups, each inside a container of its own instead of a heading on a continuous
          ground (REQ-23), and the two small ones side by side in the library's named `pair`
          arrangement, which stacks them at full width when the dialog cannot carry both (REQ-24).
          `FormSection` is deliberately not used: its rule is that a field group is not a card
          (plan-ui-coherence-optimisation/REQ-78), and that rule and its own consumers stand.
        */
        <Stack gap="var(--space-4)">
          <Grid arrangement="pair">
            <Card>
              <Stack gap="var(--space-3)">
                <SectionHeader variant="eyebrow" title="Runtime" />
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
              </Stack>
            </Card>

            <Card>
              <Stack gap="var(--space-3)">
                <SectionHeader variant="eyebrow" title="Health check" />
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
                      <NumberField
                        ariaLabel="Start period seconds"
                        placeholder="Start period (s)"
                        value={form.healthStartPeriodSec}
                        onChange={(value) => setForm({ ...form, healthStartPeriodSec: value })}
                      />
                    </Row>
                  </Stack>
                ) : null}
              </Stack>
            </Card>
          </Grid>

          <Card>
            <Stack gap="var(--space-3)">
              <SectionHeader variant="eyebrow" title="Environment variables" />
              <KeyValueEditor pairs={form.env} onChange={(env) => setForm({ ...form, env })} name="Environment" />
            </Stack>
          </Card>

          <Card>
            <Stack gap="var(--space-3)">
              <SectionHeader variant="eyebrow" title="Port mappings" />
              <RepeatableRowList
                items={form.ports}
                onChange={(ports) => setForm({ ...form, ports })}
                createItem={(): PortBinding => ({ containerPort: 0, protocol: 'tcp' })}
                addLabel="Add port"
                renderRow={(port, index, update) => (
                  <>
                    <NumberField
                      ariaLabel={`Container port ${index + 1}`}
                      placeholder="Container port"
                      value={port.containerPort || undefined}
                      onChange={(value) => update({ containerPort: value ?? 0 })}
                    />
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
            </Stack>
          </Card>

          <Card>
            <Stack gap="var(--space-3)">
              <SectionHeader variant="eyebrow" title="Mounts" />
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
            </Stack>
          </Card>

          {/*
            Stated for the whole time the form is in editing, not once a group has been touched
            (REQ-25): it says what a save *would* cost while the operator is still deciding. It adds
            to the confirmation asked before a recreate and replaces nothing of it (REQ-26).
          */}
          <FormFooter
            dirty={dirty}
            saving={saving}
            onSave={handleSave}
            onCancel={cancelEdit}
            saveLabel="Save changes"
            note={RECREATE_NOTE}
          />
        </Stack>
      );
    }

    return (
      /*
        The tab reads as the form it edits, with the controls replaced by their values: the same
        five groups, in the same order, each inside a card of its own, and the two small ones side
        by side in the library's `pair` arrangement (REQ-23, REQ-24). Reading and editing are one
        screen in two states, so the operator never has to re-find a setting after pressing Edit —
        the action that opens the form included, which closes the tab at its foot as the form's own
        footer does (REQ-50).
      */
      <Stack gap="var(--space-4)">
        <Grid arrangement="pair">
          <Card>
            <Stack gap="var(--space-3)">
              <SectionHeader variant="eyebrow" title="Runtime" />
              <DefinitionList
                items={[
                  { label: 'Restart policy', value: data.restartPolicy.maximumRetryCount ? `${data.restartPolicy.name} (max ${data.restartPolicy.maximumRetryCount})` : data.restartPolicy.name },
                  { label: 'CPU limit', value: data.resourceLimits.cpus ? `${data.resourceLimits.cpus} cpus` : '–' },
                  { label: 'Memory limit', value: data.resourceLimits.memoryBytes ? formatBytes(data.resourceLimits.memoryBytes) : '–' },
                  { label: 'Networks', value: data.networks.map((network) => network.name).join(', ') || '–' },
                ]}
              />
            </Stack>
          </Card>

          {/*
            The card answers "is this container probed?" either way — the form's toggle, read.
          */}
          <Card>
            <Stack gap="var(--space-3)">
              <SectionHeader variant="eyebrow" title="Health check" trailing={<Badge variant="quiet">{data.healthCheck ? 'enabled' : 'disabled'}</Badge>} />
              {data.healthCheck ? (
                <DefinitionList
                  items={[
                    { label: 'Command', value: formatHealthCommand(data.healthCheck.test) },
                    { label: 'Interval', value: formatNanoSeconds(data.healthCheck.intervalNanos) },
                    { label: 'Timeout', value: formatNanoSeconds(data.healthCheck.timeoutNanos) },
                    { label: 'Retries', value: data.healthCheck.retries ?? '–' },
                    { label: 'Start period', value: formatNanoSeconds(data.healthCheck.startPeriodNanos) },
                  ]}
                />
              ) : (
                <EmptyState compact title="No health check" description="This container defines no probe, so Docker never reports it as healthy or unhealthy." action={null} />
              )}
            </Stack>
          </Card>
        </Grid>

        {/*
          The three counted groups, each drawn whether or not it holds anything and each with its
          count — the editing arrangement exactly (REQ-51). A group with nothing in it says so in
          the library's placeholder: "this container publishes no port" is an answer the operator
          came for, and an absent group is indistinguishable from one that was never designed. This
          supersedes plan-ui-coherence-optimisation/REQ-60 on this tab alone; the Inspect tab's
          collapsible sections below go on applying it.
        */}
        <Card>
          <Stack gap="var(--space-3)">
            <SectionHeader variant="eyebrow" title="Environment variables" trailing={<Badge variant="quiet">{data.env.length}</Badge>} />
            {data.env.length > 0 ? (
              /*
                One variable per row at the group's full width — the free-text class is one entry
                per line — with the key and the value each in a field of its own, sharing the row
                as the form's two text fields share it (REQ-54). The value begins where its own
                field begins, and the keys still read down as one column because every entry gives
                its first field the same share (REQ-18).
              */
              <FieldList
                contentClass="free-text"
                items={data.env.map(parseEnvEntry).map((pair) => ({ fields: [{ value: pair.key }, { value: pair.value }] }))}
              />
            ) : (
              <EmptyState compact title="No environment variables" description="This container declares none of its own; it runs with whatever its image sets." action={null} />
            )}
          </Stack>
        </Card>

        <Card>
          <Stack gap="var(--space-3)">
            <SectionHeader variant="eyebrow" title="Port mappings" trailing={<Badge variant="quiet">{data.ports.length}</Badge>} />
            {data.ports.length > 0 ? (
              /*
                Each entry names its two numbers, in the form's own words (REQ-55): which one the
                container listens on and which one the host answers on is read, not inferred from
                the order they happen to be written in. The group goes on flowing as many entries
                per line as its card carries — a port is a short scalar and the library derives the
                count from that.
              */
              <FieldList
                items={data.ports.map((port) => ({
                  fields: [
                    { caption: 'Container port', value: `${port.containerPort}/${port.protocol}` },
                    { caption: 'Host port', value: port.hostPort ? String(port.hostPort) : 'not published' },
                  ],
                }))}
              />
            ) : (
              <EmptyState compact title="No port mappings" description="This container neither exposes nor publishes a port, so nothing on the host reaches it." action={null} />
            )}
          </Stack>
        </Card>

        <Card>
          <Stack gap="var(--space-3)">
            <SectionHeader variant="eyebrow" title="Mounts" trailing={<Badge variant="quiet">{data.mounts.length}</Badge>} />
            {data.mounts.length > 0 ? (
              /*
                The form's row order, read: source, destination, and the write mode the toggle
                carries. One mount per row at the group's full width, the fields sharing it by what
                they hold (REQ-56) but neither taking more than half of it, so the boundary between
                source and destination falls at the same offset in every row (REQ-57).
              */
              <FieldList
                arrangement="content"
                contentClass="free-text"
                items={data.mounts.map((mount) => ({
                  fields: [
                    { caption: 'Source', value: mount.source },
                    {
                      caption: 'Destination',
                      value: (
                        <>
                          {mount.destination}
                          <Chip label={mount.readOnly ? 'ro' : 'rw'} tone={mount.readOnly ? 'accent' : 'neutral'} />
                        </>
                      ),
                    },
                  ],
                }))}
              />
            ) : (
              <EmptyState compact title="No mounts" description="Nothing from the host or from a volume is mounted into this container." action={null} />
            )}
          </Stack>
        </Card>

        {/*
          At the foot of the tab and at its trailing edge, where the edit form's own save and cancel
          sit, belonging to no group and scrolling with the content as that footer does (REQ-50).
        */}
        <Row>
          <Spacer />
          <Button variant="subtle" onClick={startEdit}>
            Edit configuration
          </Button>
        </Row>
      </Stack>
    );
  }

  function renderInspectView(data: ContainerInspect) {
    // Bad news, and only that: a container that exited cleanly, or has not
    // exited at all, reports `0` and is drawn like every other value (REQ-36).
    const exitedBadly = data.state.exitCode !== undefined && data.state.exitCode !== 0;
    return (
      <Stack gap="var(--space-4)">
        {/*
          Two questions instead of one list (REQ-34): what the container is, and how it has gone.
          Each group states the class of the values it holds and nothing else, so the number of
          columns each shows follows its own width, as one list of ten did before it.
        */}
        <Stack gap="var(--space-3)">
          <SectionHeader variant="eyebrow" title="Identity" />
          <DefinitionList
            contentClass="short-scalar"
            items={[
              { label: 'Id', value: data.id.slice(0, 12) },
              { label: 'Name', value: data.name },
              { label: 'Image', value: data.image },
              { label: 'Command', value: data.command.join(' ') || '–' },
              { label: 'Entrypoint', value: data.entrypoint.join(' ') || '–' },
              { label: 'Created', value: data.createdAt },
            ]}
          />
        </Stack>
        <Stack gap="var(--space-3)">
          <SectionHeader variant="eyebrow" title="Lifecycle" />
          <DefinitionList
            contentClass="short-scalar"
            items={[
              // The state pill the card and the dialog's own header draw, from the module's one
              // state→tone reading (REQ-35): a state is read here as it is read everywhere else.
              { label: 'State', value: <Badge tone={stateTone(data.state.status)}>{data.state.status.toUpperCase()}</Badge> },
              { label: 'Started at', value: data.state.startedAt || '–' },
              { label: 'Finished at', value: data.state.finishedAt || '–' },
              { label: 'Exit code', value: data.state.exitCode ?? '–', tone: exitedBadly ? 'danger' : undefined },
            ]}
          />
        </Stack>
        {/*
          A section with a count of `0` is absent, not present and empty
          (plan-ui-coherence-optimisation/REQ-60) — one rule, shared with the
          image panel: the delivered panel drew a `Labels` section headed `0` on
          every container declaring none. `Health` was already conditional on the
          container defining one, which is the same rule stated a third way.
        */}
        {data.networks.length > 0 ? (
          <CollapsibleSection title="Networks" summary={`${data.networks.length}`}>
            <DefinitionList items={data.networks.map((network) => ({ label: network.name, value: network.ipAddress ?? '–' }))} />
          </CollapsibleSection>
        ) : null}
        {Object.keys(data.labels).length > 0 ? (
          <CollapsibleSection title="Labels" summary={`${Object.keys(data.labels).length}`}>
            <DefinitionList contentClass="long-single-line" items={Object.entries(data.labels).map(([key, value]) => ({ label: key, value }))} />
          </CollapsibleSection>
        ) : null}
        {data.health ? (
          <CollapsibleSection title="Health" summary={data.health.status}>
            <DefinitionList items={[{ label: 'Status', value: data.health.status }, { label: 'Failing streak', value: data.health.failingStreak ?? 0 }]} />
            {data.health.log.map((entry, index) => (
              <CodeViewer key={index} code={entry.output} maxHeight="120px" />
            ))}
          </CollapsibleSection>
        ) : null}
        {/*
          A section like the tab's others, and closed when the tab opens (REQ-37) instead of the one
          section always open. Nothing of it is lost by that: opening it shows the whole payload as
          real selectable text (plan-ui-coherence-optimisation/REQ-65), with no action of its own —
          a hand-selection inside the block is how the full container id is obtained
          (plan-docker_management_app-remove_copy_controls/REQ-19).
        */}
        <CollapsibleSection title="Raw payload" summary="JSON">
          <CodeViewer code={JSON.stringify(data.raw, null, 2)} maxHeight="320px" />
        </CollapsibleSection>
      </Stack>
    );
  }

  function renderActiveTab() {
    if (activeTab === 'logs') return <ContainerLogsView container={container} />;
    // Unmounting the view is what stops the live stats stream (REQ-32).
    if (activeTab === 'stats')
      return (
        <ScrollArea inset>
          <ContainerStatsView container={container} />
        </ScrollArea>
      );
    // Not a document that scrolls inside the region: the process table takes the region and
    // scrolls inside itself, as the logs and the sessions do (tabs_composition_refactor/REQ-32).
    // Wrapped in a scroller it would be handed no definite height and could take none.
    if (activeTab === 'processes') return <ContainerProcessesView container={container} />;
    // Unmounting the view is what closes the interactive session (REQ-36).
    if (activeTab === 'exec') return <ContainerSessionView container={container} kind="exec" />;
    if (activeTab === 'attach') return <ContainerSessionView container={container} kind="attach" />;
    return (
      // The document tabs ask the region for room: their cards are surfaces, and one at the edge
      // of a bare scroller loses its drop shadow to the clip and shares its trailing edge with the
      // scrollbar (REQ-53). The inset is the library's own, named; nothing is stated here.
      <ScrollArea inset>
        <Stack gap="var(--space-4)">
          {error ? <ErrorBanner title="Could not load container details" detail={error} onRetry={refresh} /> : null}
          {!inspect ? (
            <EmptyState title={loaded ? 'No inspect data available' : 'Loading container details…'}  description={null} action={null} />
          ) : activeTab === 'config' ? (
            renderConfigView(inspect)
          ) : (
            renderInspectView(inspect)
          )}
        </Stack>
      </ScrollArea>
    );
  }

  /*
    The interior is the library's band arrangement: the tab row is a band, at the height of
    its own content, and the active tab is the one region that absorbs whatever height is
    left. It is also what makes the dialog hand its bounded height down (modal.md), which is
    why nothing here states a height, a width or a minimum. A tab that is a document scrolls
    inside that region; a tab that is a surface of its own (the logs, the two sessions) fills
    it and scrolls inside itself.
  */
  return (
    <BandStack
      bands={[
        <Tabs
          key="tabs"
          tabs={DETAIL_TABS.filter((tab) => !tab.runningOnly || container.state === 'running')}
          activeId={activeTab}
          onSelect={(id) => setActiveTab(id as ContainerDetailTab)}
        />,
      ]}
      fill={renderActiveTab()}
    />
  );
}
