import { useEffect, useState } from 'react';
import {
  ActionButtonGroup,
  Button,
  Card,
  ChipInput,
  Combobox,
  CrossReferenceList,
  DataTable,
  DetailPanel,
  EmptyState,
  ErrorBanner,
  FormDialog,
  FormField,
  IdentifierCell,
  MetaCell,
  ScreenToolbar,
  SectionHeader,
  Stack,
  StatusDotCell,
  StatusPill,
  TextField,
  TwoLineCell,
  useToast,
  type DataTableColumn,
  type StatusTone,
} from '../ui';
import type { BuildCacheRecord, BuildCacheUsageState, BuilderSummary } from '../data/builders-client';
import { useBuildCache } from '../data/use-build-cache';
import { useBuildCacheUsage } from '../data/use-build-cache-usage';
import { useBuilders } from '../data/use-builders';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useCrossNavigation } from '../shell/services/CrossNavigationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';

const DRIVER_SUGGESTIONS = [
  { value: 'docker', label: 'docker' },
  { value: 'docker-container', label: 'docker-container' },
  { value: 'kubernetes', label: 'kubernetes' },
  { value: 'remote', label: 'remote' },
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

function statusTone(status: string): StatusTone {
  if (status === 'running') return 'success';
  if (status === 'unknown') return 'neutral';
  return 'warning';
}

const USAGE_LABELS: Record<BuildCacheUsageState, string> = {
  shared: 'shared',
  'in-use': 'in use',
  reclaimable: 'reclaimable',
};

const USAGE_TONES: Record<BuildCacheUsageState, StatusTone> = {
  shared: 'success',
  'in-use': 'neutral',
  reclaimable: 'warning',
};

/** Characters of a cache record's identifier kept in its list cell; the panel states it in full. */
const RECORD_ID_CHARS = 20;

/** Why a builder's cache size is missing, as the inventory states it: it is read from the builder itself. */
const CACHE_UNREADABLE = 'The builder did not report a cache size.';

/**
 * The endpoint a builder's node answers on — **unless that endpoint is the
 * builder's own name**, which is what the `docker` driver reports: buildx names
 * such a builder after the context it is bound to, and the node's endpoint is
 * that same context. Printed as delivered it was the row's title said a second
 * time (plan-ui-coherence-optimisation/REQ-40); the value is stated once, as
 * the title, and the column carries the reason its cell is empty.
 */
function endpointOf(builder: BuilderSummary): string | undefined {
  return builder.endpoint === builder.name ? undefined : builder.endpoint;
}

/**
 * The Builders & cache screen (REQ-88, REQ-89, REQ-91, REQ-69): every buildx
 * builder with its driver, endpoint, platforms, status and cache size,
 * selecting the active one, create and remove; and the build-cache inventory
 * with its usage state and prune, reporting the space reclaimed, each record
 * opening on the images and layers it relates to — or on the stated reason
 * none can be named. Does not launch builds (REQ-90 withdrawn) and does not
 * export/import the cache (withdrawn half of REQ-91).
 */
export function BuildersScreen() {
  const builders = useBuilders();
  const cache = useBuildCache();
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();
  const { request, navigateTo, consumeRequest } = useCrossNavigation();

  const [selectedRecordId, setSelectedRecordId] = useState<string | undefined>(undefined);
  const usage = useBuildCacheUsage(selectedRecordId);

  // A cross-reference followed from a layer arrives here naming its record
  // (REQ-68): open it, then acknowledge the request.
  useEffect(() => {
    if (request?.screenId !== 'builders-cache') return;
    setSelectedRecordId(request.objectId);
    consumeRequest();
  }, [request, consumeRequest]);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [driver, setDriver] = useState('docker-container');
  const [endpoint, setEndpoint] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  function openCreate() {
    setName('');
    setDriver('docker-container');
    setEndpoint('');
    setPlatforms([]);
    setCreateOpen(true);
  }

  async function submitCreate() {
    setCreating(true);
    try {
      await run('Create builder', () => builders.create({ name: name.trim(), driver: driver.trim(), endpoint: endpoint.trim() || undefined, platforms }));
      setCreateOpen(false);
    } catch (cause) {
      reportError('Could not create builder', (cause as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleUse(builder: BuilderSummary) {
    try {
      await run(`Use ${builder.name}`, () => builders.use(builder.name));
    } catch (cause) {
      reportError(`Could not switch to ${builder.name}`, (cause as Error).message);
    }
  }

  async function handleRemove(builder: BuilderSummary) {
    const confirmed = await confirm({
      targetName: builder.name,
      consequence: 'This will permanently remove the builder instance.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    try {
      await run(`Remove ${builder.name}`, () => builders.remove(builder.name));
    } catch (cause) {
      reportError(`Could not remove ${builder.name}`, (cause as Error).message);
    }
  }

  async function handlePrune() {
    const confirmed = await confirm({
      targetName: 'the build cache',
      consequence: 'This will permanently remove every reclaimable build-cache record.',
      confirmLabel: 'Prune',
    });
    if (!confirmed) return;
    try {
      const result = await run('Prune build cache', () => cache.prune());
      push({ title: 'Build cache pruned', message: `${formatBytes(result.reclaimedBytes)} reclaimed`, tone: 'success' });
    } catch (cause) {
      reportError('Could not prune build cache', (cause as Error).message);
    }
  }

  /** Leaves this screen and reaches the layer inside the Images & layers screen (REQ-69). */
  function goToImageLayer(imageId: string, layerIndex: number) {
    navigateTo({ screenId: 'images-layers', objectId: imageId, position: layerIndex });
  }

  /**
   * The selected record revealed by the library's detail panel: its identifier
   * in full — the list cell cuts it at `RECORD_ID_CHARS`
   * (plan-ui-coherence-optimisation/REQ-21) — and the images and layers it
   * relates to, or the stated reason none can be named (REQ-69), which a
   * migration may not turn back into an empty space.
   */
  function renderCacheUsage(record: BuildCacheRecord) {
    return (
      <DetailPanel
        dismissal="opening-gesture"
        onClose={() => setSelectedRecordId(undefined)}
        properties={[
          { label: 'Id', value: record.id },
          { label: 'Type', value: record.type },
          { label: 'Size', value: formatBytes(record.sizeBytes) },
          { label: 'Usage state', value: USAGE_LABELS[record.usageState] },
          { label: 'Build step', value: record.description ?? '–' },
        ]}
        propertiesContentClass="long-single-line"
      >
        <Stack gap="var(--space-2)">
          <SectionHeader variant="eyebrow" title="Related images & layers" />
          {usage.error ? <ErrorBanner title="Could not load the related images" detail={usage.error} onRetry={usage.refresh} /> : null}
          {!usage.loaded && !usage.usage ? (
            <EmptyState title="Looking for the images this record relates to…" description={null} action={null} compact />
          ) : (
            <CrossReferenceList
              items={(usage.usage?.references ?? []).map((reference) => ({
                key: `${reference.imageId}:${reference.layerIndex}`,
                kind: reference.tags[0] ?? reference.imageShortId,
                label: `layer ${String(reference.layerIndex + 1).padStart(2, '0')} · ${reference.instruction}`,
                onNavigate: () => goToImageLayer(reference.imageId, reference.layerIndex),
              }))}
              unavailableReason={usage.usage?.unavailableDetail}
            />
          )}
        </Stack>
      </DetailPanel>
    );
  }

  /**
   * A builder's row. Every value the delivered row carried is here, each in a
   * column of its own: the run that mixed a status pill, a plain cache string, a
   * state and a button on one line (plan-ui-coherence-optimisation/REQ-39) is
   * now four named columns and one action cluster, so what can be clicked is
   * what looks like a control.
   *
   * Every cell is the same number of lines whatever the builder's state — the
   * two values whose presence depends on it, the endpoint and the cache size,
   * are columns where an absence costs no height rather than lines that come and
   * go.
   *
   * The trailing three were written with `max-content` first, which is how this
   * screen found what `DataTableColumnWidth` now refuses: the cache column
   * resolved 85.8px on the row reading `unavailable` and 47px on the one reading
   * `15.4MB`, moving every left edge in the row with it.
   */
  const builderColumns: DataTableColumn<BuilderSummary>[] = [
    {
      id: 'active',
      header: '',
      // The marker for the one active builder, and nothing on the others: wide
      // enough for the pill it carries (77px measured) and no wider.
      width: '88px',
      render: (builder) => (builder.active ? <StatusPill tone="success">in use</StatusPill> : null),
    },
    {
      id: 'builder',
      header: 'BUILDER',
      width: '1.6fr',
      render: (builder) => <TwoLineCell title={builder.name} subtitle={builder.driver} />,
    },
    {
      id: 'endpoint',
      header: 'ENDPOINT',
      width: '1.2fr',
      render: (builder) => {
        const endpoint = endpointOf(builder);
        // The tooltip is the value itself where there is one, and the reason the
        // cell is empty where there is not.
        return <MetaCell title={endpoint ?? `Its endpoint is the ${builder.name} context, which is this builder's name.`}>{endpoint}</MetaCell>;
      },
    },
    {
      id: 'platforms',
      header: 'PLATFORMS',
      width: '1.4fr',
      // The joined list the delivered row carried, on one line, with the whole
      // of it in the cell's tooltip. **Not `BadgeListCell`**, which is the
      // natural reading of a list-valued column and is wrong here: its badges
      // do not shrink with the wrapper that holds them, so at this column's
      // width they paint over one another — measured on this row at all three
      // viewports, `linux/arm64` ending 9px inside `linux/amd64`'s box. That is
      // the library's to repair — reported with its figures rather than worked
      // around in a second place.
      render: (builder) => <MetaCell>{builder.platforms.join(', ')}</MetaCell>,
    },
    {
      id: 'status',
      header: 'STATUS',
      width: '1fr',
      render: (builder) => <StatusDotCell tone={statusTone(builder.status)} label={builder.status} />,
    },
    {
      id: 'cache',
      header: 'CACHE',
      width: '1fr',
      align: 'end',
      render: (builder) => (
        <MetaCell unavailableReason={CACHE_UNREADABLE}>{builder.cacheBytes === undefined ? undefined : formatBytes(builder.cacheBytes)}</MetaCell>
      ),
    },
    {
      id: 'actions',
      header: 'ACTIONS',
      // The cluster's own width and no more: the two controls a builder row ever
      // carries ink 106px of it, and it is the same track on every row.
      width: '120px',
      render: (builder) => (
        <ActionButtonGroup
          actions={[
            // Switching the active builder is an action with a weight, never the
            // bare word it shipped as (plan-ui-coherence-optimisation/REQ-27).
            ...(builder.active ? [] : [{ id: 'use', label: 'Use', weight: 'primary' as const, onClick: () => handleUse(builder) }]),
            { id: 'remove', label: 'Remove', weight: 'destructive' as const, onClick: () => handleRemove(builder) },
          ]}
        />
      ),
    },
  ];

  const cacheColumns: DataTableColumn<BuildCacheRecord>[] = [
    {
      id: 'record',
      header: 'RECORD',
      width: '1.2fr',
      render: (record) => <IdentifierCell value={record.id} maxChars={RECORD_ID_CHARS} />,
    },
    { id: 'type', header: 'TYPE', width: '0.8fr', render: (record) => <MetaCell>{record.type}</MetaCell> },
    {
      id: 'step',
      header: 'BUILD STEP',
      width: '2fr',
      render: (record) => <MetaCell>{record.description}</MetaCell>,
    },
    {
      id: 'usage',
      header: 'USAGE',
      width: '1.2fr',
      render: (record) => <StatusDotCell tone={USAGE_TONES[record.usageState]} label={USAGE_LABELS[record.usageState]} />,
    },
    {
      id: 'size',
      header: 'SIZE',
      width: '0.8fr',
      align: 'end',
      render: (record) => <MetaCell>{formatBytes(record.sizeBytes)}</MetaCell>,
    },
  ];

  return (
    <Stack gap="var(--space-5)">
      <Card>
        <SectionHeader title="buildx builders" />
        {/* The screen's page-level action, in the toolbar under the header
            rather than in the card's header (plan-ui-coherence-optimisation/REQ-41). */}
        <ScreenToolbar primaryAction={{ label: 'Create builder', onClick: openCreate }} />
        <Stack gap="var(--space-3)">
          {builders.error ? <ErrorBanner title="Could not load builders" detail={builders.error} onRetry={builders.refresh} /> : null}
          <DataTable
            variant="comfortable"
            columns={builderColumns}
            rows={builders.builders}
            rowKey={(builder) => builder.name}
            emptyState={
              builders.loaded ? (
                <EmptyState
                  title="No builders"
                  description="buildx builds with an instance of a driver; creating one gives this daemon something to build with."
                  action={<Button onClick={openCreate}>Create builder…</Button>}
                />
              ) : (
                <EmptyState title="Loading builders…" description={null} action={null} />
              )
            }
          />
        </Stack>
      </Card>

      <Card>
        <SectionHeader title="Build cache" />
        <ScreenToolbar destructiveAction={{ label: 'Prune', onClick: handlePrune, disabled: cache.records.length === 0 }} />
        <Stack gap="var(--space-3)">
          {cache.error ? <ErrorBanner title="Could not load the build cache" detail={cache.error} onRetry={cache.refresh} /> : null}
          <DataTable
            variant="comfortable"
            columns={cacheColumns}
            rows={cache.records}
            rowKey={(record) => record.id}
            selectedRowKey={selectedRecordId}
            onRowSelect={(record) => setSelectedRecordId((current) => (current === record.id ? undefined : record.id))}
            expandedRowKey={selectedRecordId}
            renderExpanded={renderCacheUsage}
            emptyState={
              cache.loaded ? (
                <EmptyState
                  title="No build-cache records"
                  description="The cache fills as buildx builds: a record per layer, source and mount it keeps."
                  action={null}
                />
              ) : (
                <EmptyState title="Loading build cache…" description={null} action={null} />
              )
            }
          />
        </Stack>
      </Card>

      <FormDialog
        open={createOpen}
        title="Create builder"
        description="Creates a new buildx builder instance."
        submitLabel="Create"
        submitting={creating}
        submitDisabled={name.trim() === '' || driver.trim() === ''}
        onSubmit={submitCreate}
        onCancel={() => setCreateOpen(false)}
      >
        <Stack gap="var(--space-3)">
          <FormField label="Name">
            <TextField ariaLabel="Builder name" placeholder="e.g. multiarch" value={name} onChange={setName} autoFocus />
          </FormField>
          <FormField label="Driver">
            <Combobox ariaLabel="Driver" value={driver} onChange={setDriver} options={DRIVER_SUGGESTIONS} />
          </FormField>
          <FormField label="Endpoint" hint="Context name or remote endpoint, e.g. tcp://build01:1234. Leave blank for a local, context-less builder.">
            <TextField ariaLabel="Endpoint" placeholder="tcp://build01:1234" value={endpoint} onChange={setEndpoint} />
          </FormField>
          <FormField label="Platforms">
            <ChipInput values={platforms} onChange={setPlatforms} placeholder="e.g. linux/amd64" ariaLabel="Platforms" addLabel="Add platform" />
          </FormField>
        </Stack>
      </FormDialog>
    </Stack>
  );
}
