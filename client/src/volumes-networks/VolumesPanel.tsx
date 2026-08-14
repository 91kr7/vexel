import { useState } from 'react';
import {
  Button,
  Card,
  CardList,
  CodeViewer,
  Combobox,
  DefinitionList,
  EmptyState,
  ErrorBanner,
  FormDialog,
  FormField,
  KeyValueEditor,
  Row,
  SectionHeader,
  Stack,
  TextField,
  useToast,
  type CardListRowContent,
  type KeyValuePair,
} from '../ui';
import { createVolume, pruneVolumes, removeVolume, type VolumeSummary } from '../data/volumes-client';
import { useVolumeInspect } from '../data/use-volume-inspect';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';

export interface VolumesPanelProps {
  volumes: VolumeSummary[];
  loaded: boolean;
  error?: string;
  onRefresh: () => void;
}

const DRIVER_SUGGESTIONS = [{ value: 'local', label: 'local' }];

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

function pairsToRecord(pairs: KeyValuePair[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const pair of pairs) {
    if (pair.key.trim() === '') continue;
    record[pair.key.trim()] = pair.value;
  }
  return record;
}

function volumeRow(volume: VolumeSummary): CardListRowContent {
  return {
    title: volume.name,
    subtitle: [
      volume.mountpoint,
      `driver ${volume.driver} · mounted by ${volume.mountedBy.length > 0 ? volume.mountedBy.join(', ') : 'nothing'}`,
    ],
    meta: volume.sizeBytes !== undefined ? formatBytes(volume.sizeBytes) : '–',
  };
}

/** The inline inspect surface for a selected volume's row, expanded in place by `CardList`. */
function VolumeDetail({ volume, onRemoved }: { volume: VolumeSummary; onRemoved: () => void }) {
  const { inspect, loaded, error, refresh } = useVolumeInspect(volume.name);
  const { confirm } = useConfirmation();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  async function handleRemove() {
    const confirmed = await confirm({
      targetName: volume.name,
      consequence: 'This will permanently remove the volume and its data.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    try {
      await run(`Remove ${volume.name}`, () => removeVolume(volume.name));
      onRemoved();
    } catch (cause) {
      reportError(`Could not remove ${volume.name}`, (cause as Error).message);
    }
  }

  return (
    <Stack gap="var(--space-4)">
      {error ? <ErrorBanner title="Could not load volume details" detail={error} onRetry={refresh} /> : null}
      {!inspect ? (
        <EmptyState title={loaded ? 'No inspect data available' : 'Loading volume details…'} />
      ) : (
        <>
          <DefinitionList
            items={[
              { label: 'Driver', value: inspect.driver },
              { label: 'Mountpoint', value: inspect.mountpoint },
              { label: 'Scope', value: inspect.scope },
              { label: 'Created', value: inspect.createdAt || '–' },
              { label: 'Mounted by', value: inspect.mountedBy.length > 0 ? inspect.mountedBy.join(', ') : 'nothing' },
              { label: 'Driver options', value: Object.entries(inspect.options).map(([key, value]) => `${key}=${value}`).join(', ') || '–' },
              { label: 'Labels', value: Object.entries(inspect.labels).map(([key, value]) => `${key}=${value}`).join(', ') || '–' },
            ]}
          />
          <SectionHeader variant="eyebrow" title="Raw payload" description="Exactly as received from the Engine API." />
          <CodeViewer code={JSON.stringify(inspect.raw, null, 2)} maxHeight="240px" />
        </>
      )}
      <Row justify="between">
        <Button variant="destructive" onClick={handleRemove}>Remove</Button>
      </Row>
    </Stack>
  );
}

/**
 * The Volumes panel of the Volumes & networks screen (REQ-70, REQ-71): every
 * local volume with its driver, mountpoint, size and mounting containers,
 * create/inspect/remove and prune of unused volumes.
 */
export function VolumesPanel({ volumes, loaded, error, onRefresh }: VolumesPanelProps) {
  const [selectedName, setSelectedName] = useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [driver, setDriver] = useState('local');
  const [driverOpts, setDriverOpts] = useState<KeyValuePair[]>([]);
  const [labels, setLabels] = useState<KeyValuePair[]>([]);
  const [creating, setCreating] = useState(false);

  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  function openCreate() {
    setName('');
    setDriver('local');
    setDriverOpts([]);
    setLabels([]);
    setCreateOpen(true);
  }

  async function submitCreate() {
    setCreating(true);
    try {
      await run('Create volume', () =>
        createVolume({
          name: name.trim() || undefined,
          driver: driver.trim() || undefined,
          driverOpts: pairsToRecord(driverOpts),
          labels: pairsToRecord(labels),
        }),
      );
      setCreateOpen(false);
      onRefresh();
    } catch (cause) {
      reportError('Could not create volume', (cause as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handlePrune() {
    const confirmed = await confirm({
      targetName: 'unused volumes',
      consequence: 'This will permanently remove every volume not currently mounted by a container.',
      confirmLabel: 'Prune',
    });
    if (!confirmed) return;
    try {
      const result = await run('Prune unused volumes', () => pruneVolumes());
      push({
        title: `${result.removedNames.length} volume${result.removedNames.length === 1 ? '' : 's'} removed`,
        message: `${formatBytes(result.reclaimedBytes)} reclaimed`,
        tone: 'success',
      });
      onRefresh();
    } catch (cause) {
      reportError('Could not prune volumes', (cause as Error).message);
    }
  }

  function handleSelect(volume: VolumeSummary) {
    setSelectedName((current) => (current === volume.name ? undefined : volume.name));
  }

  function handleRemoved() {
    setSelectedName(undefined);
    onRefresh();
  }

  return (
    <Card>
      <SectionHeader
        title="Volumes"
        trailing={
          <Row gap="var(--space-2)">
            <Button onClick={openCreate}>Create</Button>
            <Button variant="destructive" onClick={handlePrune} disabled={volumes.length === 0}>Prune</Button>
          </Row>
        }
      />
      <Stack gap="var(--space-3)">
        {error ? <ErrorBanner title="Could not load volumes" detail={error} onRetry={onRefresh} /> : null}
        <CardList
          items={volumes}
          itemKey={(volume) => volume.name}
          renderRow={volumeRow}
          selectedKey={selectedName}
          onSelect={handleSelect}
          expandedKey={selectedName}
          renderExpanded={(volume) => <VolumeDetail volume={volume} onRemoved={handleRemoved} />}
          emptyState={<EmptyState title={loaded ? 'No volumes' : 'Loading volumes…'} />}
        />
      </Stack>

      <FormDialog
        open={createOpen}
        title="Create volume"
        description="Creates a new named or anonymous volume."
        submitLabel="Create"
        submitting={creating}
        onSubmit={submitCreate}
        onCancel={() => setCreateOpen(false)}
      >
        <Stack gap="var(--space-3)">
          <FormField label="Name" hint="Leave blank for an anonymous, daemon-generated name.">
            <TextField ariaLabel="Volume name" placeholder="e.g. pgdata" value={name} onChange={setName} autoFocus />
          </FormField>
          <FormField label="Driver">
            <Combobox ariaLabel="Driver" value={driver} onChange={setDriver} options={DRIVER_SUGGESTIONS} />
          </FormField>
          <FormField label="Driver options">
            <KeyValueEditor pairs={driverOpts} onChange={setDriverOpts} name="Driver options" addLabel="Add option" />
          </FormField>
          <FormField label="Labels">
            <KeyValueEditor pairs={labels} onChange={setLabels} name="Labels" keyPlaceholder="key" addLabel="Add label" />
          </FormField>
        </Stack>
      </FormDialog>
    </Card>
  );
}
