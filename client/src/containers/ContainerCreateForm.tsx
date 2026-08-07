import { useEffect, useState } from 'react';
import {
  ChipInput,
  Combobox,
  ErrorBanner,
  FormField,
  FormSection,
  FormSheet,
  KeyValueEditor,
  NumberField,
  RepeatableRowList,
  Row,
  Select,
  StepProgressList,
  TextField,
  Toggle,
  useToast,
  type ComboboxOption,
  type FormSheetCommit,
  type KeyValuePair,
  type ProgressStep,
} from '../ui';
import type { ImageSummary } from '../data/images-client';
import type { ContainerCreateResult, ContainerCreateSpec } from '../data/container-create-client';
import { useContainerCreate } from '../data/use-container-create';
import { useErrorReporter } from '../shell/services/ErrorReportingService';

export interface ContainerCreateFormProps {
  open: boolean;
  /** Local images offered as suggestions; any other reference can still be typed and is pulled. */
  images: ImageSummary[];
  imagesLoaded?: boolean;
  /** Pre-fills the image reference (e.g. "run this image" from an image row). */
  initialImage?: string;
  /** Makes "Create and start" the primary commit action rather than "Create". */
  defaultStart?: boolean;
  onCancel: () => void;
  onCreated: (result: ContainerCreateResult) => void;
}

interface PortRow {
  containerPort: string;
  hostPort: string;
  protocol: 'tcp' | 'udp';
  hostIp: string;
}

interface MountRow {
  type: 'bind' | 'volume';
  source: string;
  destination: string;
  readOnly: boolean;
}

interface FormValues {
  image: string;
  platform: string;
  name: string;
  entrypoint: string;
  command: string;
  env: KeyValuePair[];
  ports: PortRow[];
  mounts: MountRow[];
  networks: string[];
  restartPolicy: string;
  maximumRetryCount?: number;
  cpus?: number;
  memoryMb?: number;
  labels: KeyValuePair[];
  privileged: boolean;
  capAdd: string[];
  capDrop: string[];
}

interface FormErrors {
  image?: string;
  name?: string;
  ports?: string;
  mounts?: string;
  env?: string;
  labels?: string;
  resources?: string;
}

const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

const RESTART_POLICY_OPTIONS = [
  { value: 'no', label: 'no — never restart' },
  { value: 'on-failure', label: 'on-failure — restart on a non-zero exit' },
  { value: 'always', label: 'always — restart whatever happens' },
  { value: 'unless-stopped', label: 'unless-stopped — restart unless stopped by hand' },
];

const PROTOCOL_OPTIONS = [
  { value: 'tcp', label: 'tcp' },
  { value: 'udp', label: 'udp' },
];

const MOUNT_TYPE_OPTIONS = [
  { value: 'bind', label: 'bind' },
  { value: 'volume', label: 'volume' },
];

function emptyValues(image: string): FormValues {
  return {
    image,
    platform: '',
    name: '',
    entrypoint: '',
    command: '',
    env: [],
    ports: [],
    mounts: [],
    networks: [],
    restartPolicy: 'no',
    maximumRetryCount: undefined,
    cpus: undefined,
    memoryMb: undefined,
    labels: [],
    privileged: false,
    capAdd: [],
    capDrop: [],
  };
}

/** Splits a command line on whitespace; empty input means "keep the image's own". */
function splitTokens(text: string): string[] {
  return text.trim() === '' ? [] : text.trim().split(/\s+/);
}

function isValidPort(text: string): boolean {
  const port = Number(text);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};

  if (values.image.trim() === '') errors.image = 'An image reference is required.';
  if (values.name.trim() !== '' && !NAME_PATTERN.test(values.name.trim())) {
    errors.name = 'Use letters, digits, "_", "." or "-", starting with a letter or a digit.';
  }

  if (values.ports.some((port) => !isValidPort(port.containerPort))) {
    errors.ports = 'Every mapping needs a container port between 1 and 65535.';
  } else if (values.ports.some((port) => port.hostPort.trim() !== '' && !isValidPort(port.hostPort))) {
    errors.ports = 'A host port must be between 1 and 65535.';
  }

  if (values.mounts.some((mount) => mount.source.trim() === '' || mount.destination.trim() === '')) {
    errors.mounts = 'Every mount needs a source and a container path.';
  } else if (values.mounts.some((mount) => !mount.destination.trim().startsWith('/'))) {
    errors.mounts = 'The container path must be absolute.';
  }

  if (values.env.some((pair) => pair.key.trim() === '' || pair.key.includes('='))) {
    errors.env = 'Every variable needs a name, without "=".';
  }
  if (values.labels.some((pair) => pair.key.trim() === '')) errors.labels = 'Every label needs a key.';

  if ((values.cpus !== undefined && values.cpus <= 0) || (values.memoryMb !== undefined && values.memoryMb <= 0)) {
    errors.resources = 'Limits must be greater than zero; leave a field empty for no limit.';
  }

  return errors;
}

function toSpec(values: FormValues, start: boolean): ContainerCreateSpec {
  return {
    image: values.image.trim(),
    platform: values.platform.trim() || undefined,
    name: values.name.trim() || undefined,
    entrypoint: splitTokens(values.entrypoint),
    command: splitTokens(values.command),
    env: values.env.map((pair) => `${pair.key.trim()}=${pair.value}`),
    ports: values.ports.map((port) => ({
      containerPort: Number(port.containerPort),
      protocol: port.protocol,
      hostPort: port.hostPort.trim() === '' ? undefined : Number(port.hostPort),
      hostIp: port.hostIp.trim() || undefined,
    })),
    mounts: values.mounts.map((mount) => ({
      type: mount.type,
      source: mount.source.trim(),
      destination: mount.destination.trim(),
      readOnly: mount.readOnly,
    })),
    networks: values.networks,
    restartPolicy: {
      name: values.restartPolicy,
      maximumRetryCount: values.restartPolicy === 'on-failure' ? values.maximumRetryCount : undefined,
    },
    resourceLimits: {
      cpus: values.cpus,
      memoryBytes: values.memoryMb === undefined ? undefined : Math.round(values.memoryMb * 1024 * 1024),
    },
    labels: Object.fromEntries(values.labels.map((pair) => [pair.key.trim(), pair.value])),
    privileged: values.privileged,
    capabilities: { add: values.capAdd, drop: values.capDrop },
    start,
  };
}

function imageOptions(images: ImageSummary[]): ComboboxOption[] {
  return images.flatMap((image) =>
    image.tags.length > 0
      ? image.tags.map((tag) => ({ value: tag, label: tag, hint: image.shortId }))
      : [{ value: image.id, label: image.shortId, hint: 'untagged' }],
  );
}

/**
 * Create/run form (REQ-27, REQ-28, REQ-29): the image comes from the local
 * images or is typed freely (and is pulled first, with progress, when it is
 * not present locally); every configuration section is grouped, what can be
 * checked in the browser is checked before submitting, and a daemon refusal is
 * shown with the daemon's own message while every entered value stays in place
 * for correction.
 */
export function ContainerCreateForm({
  open,
  images,
  imagesLoaded = true,
  initialImage,
  defaultStart = true,
  onCancel,
  onCreated,
}: ContainerCreateFormProps) {
  const { push } = useToast();
  const { reportError } = useErrorReporter();
  const [values, setValues] = useState<FormValues>(() => emptyValues(initialImage ?? ''));
  const [submitted, setSubmitted] = useState(false);
  const create = useContainerCreate();
  const { reset: resetCreate } = create;

  // Every opening starts from a clean form (pre-filled with the requested
  // image, if any); a rejection leaves the form open and untouched instead.
  useEffect(() => {
    if (!open) return;
    setValues(emptyValues(initialImage ?? ''));
    setSubmitted(false);
    resetCreate();
  }, [open, initialImage, resetCreate]);

  const errors = validate(values);
  const hasErrors = Object.keys(errors).length > 0;
  const busy = create.phase === 'pulling' || create.phase === 'creating';

  function patch(next: Partial<FormValues>) {
    setValues((current) => ({ ...current, ...next }));
  }

  async function submit(start: boolean) {
    setSubmitted(true);
    if (hasErrors) return;
    const result = await create.submit(toSpec(values, start));
    if (!result) return;
    push({
      title: start ? 'Container created and started' : 'Container created',
      message: result.name || result.id.slice(0, 12),
      tone: 'success',
    });
    for (const warning of result.warnings) reportError('The daemon reported a warning', warning);
    onCreated(result);
  }

  const commitActions: FormSheetCommit[] = defaultStart
    ? [
        { id: 'create', label: 'Create only', onClick: () => void submit(false) },
        { id: 'create-start', label: 'Create and start', onClick: () => void submit(true) },
      ]
    : [
        { id: 'create-start', label: 'Create and start', onClick: () => void submit(true) },
        { id: 'create', label: 'Create only', onClick: () => void submit(false) },
      ];

  const pullSteps: ProgressStep[] = create.pullSteps.map((step) => ({
    id: step.id,
    label: step.id === 'overall' ? step.status : `${step.id} — ${step.status}`,
    status: create.phase === 'pulling' ? 'active' : 'done',
    percent: step.totalBytes ? Math.round(((step.currentBytes ?? 0) / step.totalBytes) * 100) : undefined,
  }));

  const shown = (key: keyof FormErrors) => (submitted ? errors[key] : undefined);

  return (
    <FormSheet
      open={open}
      title="Run a container"
      description="Creates a container from an image; the image is pulled first when it is not present locally."
      banner={create.rejection ? <ErrorBanner title="The daemon refused the creation" detail={create.rejection} /> : undefined}
      commitActions={commitActions}
      busy={busy}
      busyLabel={create.phase === 'pulling' ? 'Pulling…' : 'Creating…'}
      onCancel={onCancel}
    >
      <FormSection title="Image and identity">
        <FormField label="Image" error={shown('image')} hint="Pick a local image or type any reference.">
          <Combobox
            value={values.image}
            onChange={(image) => patch({ image })}
            options={imageOptions(images)}
            loading={!imagesLoaded}
            placeholder="e.g. nginx:1.27"
            ariaLabel="Image reference"
            autoFocus
          />
        </FormField>
        <FormField label="Platform" hint="Used only when the image has to be pulled.">
          <TextField value={values.platform} onChange={(platform) => patch({ platform })} placeholder="e.g. linux/amd64" ariaLabel="Platform" />
        </FormField>
        <FormField label="Container name" error={shown('name')} hint="Left empty, the daemon picks one.">
          <TextField value={values.name} onChange={(name) => patch({ name })} placeholder="e.g. web-frontend" ariaLabel="Container name" />
        </FormField>
      </FormSection>

      <FormSection title="Entrypoint and command" description="Left empty, the image's own values are kept.">
        <FormField label="Entrypoint">
          <TextField value={values.entrypoint} onChange={(entrypoint) => patch({ entrypoint })} placeholder="e.g. /docker-entrypoint.sh" ariaLabel="Entrypoint" />
        </FormField>
        <FormField label="Command">
          <TextField value={values.command} onChange={(command) => patch({ command })} placeholder="e.g. nginx -g daemon off;" ariaLabel="Command" />
        </FormField>
      </FormSection>

      <FormSection title="Environment">
        <FormField label="Variables" error={shown('env')}>
          <KeyValueEditor pairs={values.env} onChange={(env) => patch({ env })} addLabel="Add variable" />
        </FormField>
      </FormSection>

      <FormSection title="Ports">
        <FormField label="Published ports" error={shown('ports')} hint="A mapping without a host port only exposes the container port.">
          <RepeatableRowList<PortRow>
            items={values.ports}
            onChange={(ports) => patch({ ports })}
            createItem={() => ({ containerPort: '', hostPort: '', protocol: 'tcp', hostIp: '' })}
            addLabel="Add port mapping"
            removeLabel={(port) => `Remove port mapping ${port.containerPort || 'row'}`}
            renderRow={(port, index, update) => (
              <>
                <TextField
                  value={port.containerPort}
                  onChange={(containerPort) => update({ containerPort })}
                  placeholder="container port"
                  ariaLabel={`Container port ${index + 1}`}
                />
                <TextField value={port.hostPort} onChange={(hostPort) => update({ hostPort })} placeholder="host port" ariaLabel={`Host port ${index + 1}`} />
                <TextField value={port.hostIp} onChange={(hostIp) => update({ hostIp })} placeholder="host ip" ariaLabel={`Host address ${index + 1}`} />
                <Select
                  value={port.protocol}
                  onChange={(protocol) => update({ protocol: protocol as 'tcp' | 'udp' })}
                  options={PROTOCOL_OPTIONS}
                  ariaLabel={`Protocol ${index + 1}`}
                />
              </>
            )}
          />
        </FormField>
      </FormSection>

      <FormSection title="Volumes">
        <FormField label="Mounts" error={shown('mounts')} hint="A bind source is a host path; a volume source is a volume name.">
          <RepeatableRowList<MountRow>
            items={values.mounts}
            onChange={(mounts) => patch({ mounts })}
            createItem={() => ({ type: 'bind', source: '', destination: '', readOnly: false })}
            addLabel="Add mount"
            removeLabel={(mount) => `Remove mount ${mount.destination || 'row'}`}
            renderRow={(mount, index, update) => (
              <>
                <Select
                  value={mount.type}
                  onChange={(type) => update({ type: type as 'bind' | 'volume' })}
                  options={MOUNT_TYPE_OPTIONS}
                  ariaLabel={`Mount type ${index + 1}`}
                />
                <TextField value={mount.source} onChange={(source) => update({ source })} placeholder="source" ariaLabel={`Mount source ${index + 1}`} />
                <TextField
                  value={mount.destination}
                  onChange={(destination) => update({ destination })}
                  placeholder="/container/path"
                  ariaLabel={`Mount destination ${index + 1}`}
                />
                <Toggle checked={mount.readOnly} onChange={(readOnly) => update({ readOnly })} label="read-only" ariaLabel={`Mount ${index + 1} read-only`} />
              </>
            )}
          />
        </FormField>
      </FormSection>

      <FormSection title="Networks" description="The first network is attached at creation; the others right after.">
        <FormField label="Attached networks">
          <ChipInput values={values.networks} onChange={(networks) => patch({ networks })} placeholder="network name" ariaLabel="Network name" />
        </FormField>
      </FormSection>

      <FormSection title="Restart policy">
        <FormField label="Policy">
          <Select
            value={values.restartPolicy}
            onChange={(restartPolicy) => patch({ restartPolicy })}
            options={RESTART_POLICY_OPTIONS}
            ariaLabel="Restart policy"
          />
        </FormField>
        {values.restartPolicy === 'on-failure' ? (
          <FormField label="Maximum retries" hint="Left empty, the daemon retries without a limit.">
            <NumberField
              value={values.maximumRetryCount}
              onChange={(maximumRetryCount) => patch({ maximumRetryCount })}
              min={0}
              ariaLabel="Maximum retry count"
            />
          </FormField>
        ) : null}
      </FormSection>

      <FormSection title="Resource limits" description="Leave a field empty for no limit.">
        <Row gap="var(--space-3)" align="start">
          <FormField label="CPUs" error={shown('resources')}>
            <NumberField value={values.cpus} onChange={(cpus) => patch({ cpus })} min={0} step={0.5} placeholder="e.g. 1.5" ariaLabel="CPU limit" />
          </FormField>
          <FormField label="Memory (MB)">
            <NumberField value={values.memoryMb} onChange={(memoryMb) => patch({ memoryMb })} min={0} step={64} placeholder="e.g. 512" ariaLabel="Memory limit in megabytes" />
          </FormField>
        </Row>
      </FormSection>

      <FormSection title="Labels">
        <FormField label="Labels" error={shown('labels')}>
          <KeyValueEditor pairs={values.labels} onChange={(labels) => patch({ labels })} keyPlaceholder="key" addLabel="Add label" />
        </FormField>
      </FormSection>

      <FormSection title="Privileges" description="Privileged mode gives the container full access to the host's devices.">
        <FormField label="Privileged">
          <Toggle checked={values.privileged} onChange={(privileged) => patch({ privileged })} label="Run privileged" />
        </FormField>
        <FormField label="Capabilities to add">
          <ChipInput values={values.capAdd} onChange={(capAdd) => patch({ capAdd })} placeholder="e.g. NET_ADMIN" ariaLabel="Capability to add" />
        </FormField>
        <FormField label="Capabilities to drop">
          <ChipInput values={values.capDrop} onChange={(capDrop) => patch({ capDrop })} placeholder="e.g. MKNOD" ariaLabel="Capability to drop" />
        </FormField>
      </FormSection>

      {pullSteps.length > 0 ? (
        <FormSection title="Pulling the image">
          <StepProgressList steps={pullSteps} />
        </FormSection>
      ) : null}
    </FormSheet>
  );
}
