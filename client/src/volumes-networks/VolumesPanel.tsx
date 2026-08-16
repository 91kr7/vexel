import { useState } from 'react';
import {
  ActionButtonGroup,
  BadgeListCell,
  Button,
  Card,
  CodeViewer,
  Combobox,
  DataTable,
  DetailPanel,
  EmptyState,
  ErrorBanner,
  FormDialog,
  FormField,
  KeyValueEditor,
  MetaCell,
  ScreenToolbar,
  SectionHeader,
  Stack,
  TextField,
  TwoLineCell,
  useToast,
  type DataTableColumn,
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

/**
 * The inspect surface for a selected volume, revealed by the library's detail
 * panel in the row's expansion: full content width, properties in the two-column
 * grid, and the raw payload at that same width rather than in a card column's
 * leftover.
 *
 * `long-single-line` is what these properties actually hold — an absolute mount
 * path, driver options, label strings — and the mountpoint is here in full,
 * wrapped and selectable, which is the route out of the truncation the row
 * applies to it.
 */
function VolumeDetail({ volume, onClose }: { volume: VolumeSummary; onClose: () => void }) {
  const { inspect, loaded, error, refresh } = useVolumeInspect(volume.name);

  return (
    // The row that opened the panel closes it, so it presents no close control
    // of its own and `Escape` closes it from the keyboard. It is rendered
    // whatever the inspect call has returned so far: the one-panel-open
    // guarantee is the panel's, and a panel that only appears once its data
    // arrives would leave a second one open until then.
    <DetailPanel
      dismissal="opening-gesture"
      onClose={onClose}
      properties={
        inspect
          ? [
              { label: 'Driver', value: inspect.driver },
              { label: 'Mountpoint', value: inspect.mountpoint },
              { label: 'Scope', value: inspect.scope },
              { label: 'Created', value: inspect.createdAt || '–' },
              { label: 'Mounted by', value: inspect.mountedBy.length > 0 ? inspect.mountedBy.join(', ') : 'nothing' },
              { label: 'Driver options', value: Object.entries(inspect.options).map(([key, value]) => `${key}=${value}`).join(', ') || '–' },
              { label: 'Labels', value: Object.entries(inspect.labels).map(([key, value]) => `${key}=${value}`).join(', ') || '–' },
            ]
          : undefined
      }
      propertiesContentClass="long-single-line"
    >
      <Stack gap="var(--space-4)">
        {error ? <ErrorBanner title="Could not load volume details" detail={error} onRetry={refresh} /> : null}
        {!inspect ? (
          loaded ? (
            <EmptyState
              title="No inspect data available"
              description="The daemon returned no details for this volume."
              action={null}
            />
          ) : (
            <EmptyState title="Loading volume details…" description={null} action={null} />
          )
        ) : (
          <>
            <SectionHeader variant="eyebrow" title="Raw payload" description="Exactly as received from the Engine API." />
            <CodeViewer code={JSON.stringify(inspect.raw, null, 2)} maxHeight="240px" />
          </>
        )}
      </Stack>
    </DetailPanel>
  );
}

/**
 * The Volumes panel of the Volumes & networks screen (REQ-70, REQ-71): every
 * local volume with its driver, mountpoint, size and mounting containers, listed
 * with the object list's comfortable variant, with create and prune in the
 * toolbar under the section header and remove in the row's action cluster.
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

  async function handleRemove(volume: VolumeSummary) {
    const confirmed = await confirm({
      targetName: volume.name,
      consequence: 'This will permanently remove the volume and its data.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    try {
      await run(`Remove ${volume.name}`, () => removeVolume(volume.name));
      setSelectedName((current) => (current === volume.name ? undefined : current));
      onRefresh();
    } catch (cause) {
      reportError(`Could not remove ${volume.name}`, (cause as Error).message);
    }
  }

  function handleSelect(volume: VolumeSummary) {
    setSelectedName((current) => (current === volume.name ? undefined : volume.name));
  }

  const columns: DataTableColumn<VolumeSummary>[] = [
    {
      id: 'name',
      header: 'NAME',
      width: '2fr',
      render: (volume) => <TwoLineCell title={volume.name} subtitle={volume.mountpoint} />,
    },
    { id: 'driver', header: 'DRIVER', width: '0.8fr', render: (volume) => <MetaCell>{volume.driver}</MetaCell> },
    {
      id: 'mounted-by',
      header: 'MOUNTED BY',
      width: '1.2fr',
      render: (volume) => <BadgeListCell labels={volume.mountedBy} maxVisible={2} emptyLabel="nothing" />,
    },
    {
      id: 'size',
      header: 'SIZE',
      width: '0.6fr',
      align: 'end',
      render: (volume) => <MetaCell>{volume.sizeBytes !== undefined ? formatBytes(volume.sizeBytes) : undefined}</MetaCell>,
    },
    {
      id: 'actions',
      header: 'ACTIONS',
      // The cluster's own width and no more (REQ-9), stated as a **length**: an
      // intrinsic track resolves separately in the header and in every row — it
      // measured 57.4px in this table's header against 62.7px in its rows — so
      // the column is the width its one control needs, on every row alike.
      width: '72px',
      render: (volume) => (
        <ActionButtonGroup
          actions={[{ id: 'remove', label: 'Remove', weight: 'destructive', onClick: () => handleRemove(volume) }]}
        />
      ),
    },
  ];

  return (
    <Card>
      <SectionHeader title="Volumes" />
      <ScreenToolbar
        primaryAction={{ label: 'Create volume…', onClick: openCreate }}
        destructiveAction={{ label: 'Prune', onClick: handlePrune, disabled: volumes.length === 0 }}
      />
      <Stack gap="var(--space-3)">
        {error ? <ErrorBanner title="Could not load volumes" detail={error} onRetry={onRefresh} /> : null}
        <DataTable
          // The `NAME` cell is a name over its mountpoint, so the row is sized
          // by what it holds rather than clipped to the fixed height a list of
          // one-line values is drawn at.
          autoRowHeight
          columns={columns}
          rows={volumes}
          rowKey={(volume) => volume.name}
          selectedRowKey={selectedName}
          onRowSelect={handleSelect}
          expandedRowKey={selectedName}
          renderExpanded={(volume) => <VolumeDetail volume={volume} onClose={() => setSelectedName(undefined)} />}
          emptyState={
            loaded ? (
              <EmptyState
                title="No volumes"
                description="A volume keeps data alive independently of the containers that mount it."
                // Its label is the invitation, never the toolbar's own word
                // (DEF-2, `volumes-panel.md`): one surface, one control per name.
                action={<Button onClick={openCreate}>Create the first volume</Button>}
              />
            ) : (
              <EmptyState title="Loading volumes…" description={null} action={null} />
            )
          }
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
