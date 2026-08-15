import { useEffect, useState } from 'react';
import {
  ActionButtonGroup,
  Badge,
  Button,
  Card,
  CardList,
  ChipInput,
  Combobox,
  CrossReferenceList,
  EmptyState,
  ErrorBanner,
  FormDialog,
  FormField,
  MetaCell,
  Row,
  SectionHeader,
  Stack,
  TextField,
  useToast,
  type BadgeTone,
  type CardListRowContent,
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

function statusTone(status: string): BadgeTone {
  if (status === 'running') return 'success';
  if (status === 'unknown') return 'neutral';
  return 'warning';
}

const USAGE_LABELS: Record<BuildCacheUsageState, string> = {
  shared: 'shared',
  'in-use': 'in use',
  reclaimable: 'reclaimable',
};

const USAGE_TONES: Record<BuildCacheUsageState, BadgeTone> = {
  shared: 'success',
  'in-use': 'neutral',
  reclaimable: 'warning',
};

function truncateId(id: string): string {
  return id.length > 20 ? `${id.slice(0, 20)}…` : id;
}

function cacheRow(record: BuildCacheRecord): CardListRowContent {
  return {
    title: truncateId(record.id),
    subtitle: record.description ? [record.type, record.description] : record.type,
    badges: <Badge tone={USAGE_TONES[record.usageState]}>{USAGE_LABELS[record.usageState]}</Badge>,
    meta: formatBytes(record.sizeBytes),
  };
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

  /** The images and layers the selected record relates to, or the stated reason none can be named (REQ-69). */
  function renderCacheUsage() {
    return (
      <Stack gap="var(--space-2)">
        <SectionHeader variant="eyebrow" title="Related images & layers" />
        {usage.error ? <ErrorBanner title="Could not load the related images" detail={usage.error} onRetry={usage.refresh} /> : null}
        {!usage.loaded && !usage.usage ? (
          <MetaCell>Looking for the images this record relates to…</MetaCell>
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
    );
  }

  function builderRow(builder: BuilderSummary): CardListRowContent {
    return {
      title: builder.name,
      subtitle: [`${builder.driver} · ${builder.platforms.join(', ') || 'no platforms reported'}`, builder.endpoint],
      badges: <Badge tone={statusTone(builder.status)}>{builder.status}</Badge>,
      meta: (
        <Row gap="var(--space-2)" align="center">
          {builder.cacheBytes !== undefined ? `cache ${formatBytes(builder.cacheBytes)}` : 'cache unavailable'}
          {builder.active ? (
            <Badge tone="success">in use</Badge>
          ) : (
            <Badge onClick={() => handleUse(builder)}>use</Badge>
          )}
          <ActionButtonGroup actions={[{ id: 'remove', label: 'Remove', destructive: true, onClick: () => handleRemove(builder) }]} />
        </Row>
      ),
    };
  }

  return (
    <Stack gap="var(--space-5)">
      <Card>
        <SectionHeader title="buildx builders" trailing={<Button onClick={openCreate}>Create builder</Button>} />
        <Stack gap="var(--space-3)">
          {builders.error ? <ErrorBanner title="Could not load builders" detail={builders.error} onRetry={builders.refresh} /> : null}
          <CardList
            items={builders.builders}
            itemKey={(builder) => builder.name}
            renderRow={builderRow}
            emptyState={<EmptyState title={builders.loaded ? 'No builders' : 'Loading builders…'}  description={null} action={null} />}
          />
        </Stack>
      </Card>

      <Card>
        <SectionHeader
          title="Build cache"
          trailing={
            <Button variant="destructive" onClick={handlePrune} disabled={cache.records.length === 0}>
              Prune
            </Button>
          }
        />
        <Stack gap="var(--space-3)">
          {cache.error ? <ErrorBanner title="Could not load the build cache" detail={cache.error} onRetry={cache.refresh} /> : null}
          <CardList
            items={cache.records}
            itemKey={(record) => record.id}
            renderRow={cacheRow}
            selectedKey={selectedRecordId}
            onSelect={(record) => setSelectedRecordId((current) => (current === record.id ? undefined : record.id))}
            expandedKey={selectedRecordId}
            renderExpanded={renderCacheUsage}
            emptyState={<EmptyState title={cache.loaded ? 'No build-cache records' : 'Loading build cache…'}  description={null} action={null} />}
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
