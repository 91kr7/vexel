import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  ConfirmDialog,
  CrossReference,
  DataTable,
  DefinitionList,
  EmptyState,
  ErrorBanner,
  IdentifierCell,
  MetaCell,
  Modal,
  ProportionBarCell,
  Row,
  SectionHeader,
  Stack,
  TransferProgressDialog,
  type DataTableColumn,
} from '../ui';
import type { ImageSummary } from '../data/images-client';
import { imageChangesetsStreamUrl, type LayerChangesetPath, type LayerMetadata } from '../data/image-layers-client';
import { useImageBuildCacheTrace } from '../data/use-image-build-cache-trace';
import { useImageChangesetStream } from '../data/use-image-changesets';
import { useImageLayerStack } from '../data/use-image-layers';
import { useCrossNavigation } from '../shell/services/CrossNavigationService';

export interface LayerExplorerProps {
  image: ImageSummary;
  open: boolean;
  onClose: () => void;
  /** Selects this layer once the stack is loaded (REQ-65, REQ-67), e.g. arriving from a signals finding. */
  initialSelectedLayerIndex?: number;
  /** Starts changeset analysis immediately on open, bypassing the cost warning — safe when the caller already knows the changeset job is cached (REQ-65, REQ-67). */
  autoAnalyze?: boolean;
  /** Layer index → finding count, from the efficiency/signals view (REQ-65, REQ-67); marks the layers carrying findings. */
  layersWithFindings?: Map<number, number>;
}

/** Above this uncompressed image size, the cost warning names a meaningfully longer estimate (REQ-51). */
const LARGE_IMAGE_THRESHOLD_BYTES = 250 * 1024 * 1024;

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

/** Rough, displayed-only estimate driving the pre-analysis cost warning (REQ-51); not a measured cost model. */
function estimateAnalysisSeconds(sizeBytes: number): number {
  return Math.max(5, Math.round(sizeBytes / (20 * 1024 * 1024)) * 5);
}

function statusTone(status: LayerChangesetPath['status']): 'success' | 'warning' | 'danger' {
  if (status === 'added') return 'success';
  if (status === 'modified') return 'warning';
  return 'danger';
}

function truncateId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 14)}…` : id;
}

/**
 * Layer explorer (REQ-47–51, REQ-68): the image's layer stack in build order,
 * each layer's instruction shown as a bar proportional to its uncompressed
 * size, shared-layer markers naming the images that reuse it, the build-cache
 * record behind each layer — or the stated reason there is none — and, once
 * analysed behind a cost warning, the selected layer's added/modified/deleted
 * paths.
 */
export function LayerExplorer({ image, open, onClose, initialSelectedLayerIndex, autoAnalyze, layersWithFindings }: LayerExplorerProps) {
  const { stack, loaded, error, refresh } = useImageLayerStack(open ? image.id : undefined);
  const trace = useImageBuildCacheTrace(open ? image.id : undefined);
  const { navigateTo } = useCrossNavigation();
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>(undefined);
  const [warningOpen, setWarningOpen] = useState(false);
  // `analysisUrl` drives the stream/result lifetime; `progressDialogOpen` only
  // drives the dialog's visibility. They are deliberately separate: closing
  // the dialog after a successful analysis is an acknowledgement, not a
  // discard, so the browsed result must outlive the dialog (REQ-49) — only
  // cancelling, or starting a new analysis, replaces it.
  const [analysisUrl, setAnalysisUrl] = useState<string | undefined>(undefined);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const changesets = useImageChangesetStream(analysisUrl);

  useEffect(() => {
    if (!open) return;
    if (initialSelectedLayerIndex !== undefined) setSelectedIndex(initialSelectedLayerIndex);
    if (autoAnalyze && analysisUrl === undefined) setAnalysisUrl(imageChangesetsStreamUrl(image.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSelectedLayerIndex, autoAnalyze]);

  const layers = stack?.layers ?? [];
  const maxSize = layers.reduce((max, layer) => Math.max(max, layer.uncompressedSizeBytes), 0);
  const selectedChangeset = changesets.result?.layers.find((layer) => layer.layerIndex === selectedIndex);
  const buildCacheLinks = trace.trace?.layers ?? [];
  const selectedLink = buildCacheLinks.find((link) => link.layerIndex === selectedIndex);

  /** Leaves the explorer and reaches the record on the Builders & cache screen (REQ-68). */
  function goToCacheRecord(recordId: string) {
    onClose();
    navigateTo({ screenId: 'builders-cache', objectId: recordId });
  }

  function startAnalysis() {
    setWarningOpen(false);
    setProgressDialogOpen(true);
    setAnalysisUrl(imageChangesetsStreamUrl(image.id));
  }

  /** Cancelling genuinely stops the work and leaves nothing behind (REQ-51): closes the stream, drops any partial state, and dismisses the dialog. */
  function cancelAnalysis() {
    setProgressDialogOpen(false);
    setAnalysisUrl(undefined);
  }

  /** Dismisses the dialog only. A successful result stays browsable per layer, served from the cache on a later visit; a failed run has nothing to keep, so it also clears the stream, allowing a retry. */
  function closeProgressDialog() {
    setProgressDialogOpen(false);
    if (changesets.error) setAnalysisUrl(undefined);
  }

  const layerColumns: DataTableColumn<LayerMetadata>[] = [
    { id: 'index', header: '#', width: '48px', render: (layer) => <MetaCell>{String(layer.index + 1).padStart(2, '0')}</MetaCell> },
    {
      id: 'instruction',
      header: 'INSTRUCTION',
      width: '2.4fr',
      render: (layer) => (
        <ProportionBarCell fraction={maxSize > 0 ? layer.uncompressedSizeBytes / maxSize : 0} label={layer.command ?? layer.instruction} />
      ),
    },
    {
      id: 'shared',
      header: 'SHARED',
      width: '1fr',
      render: (layer) =>
        layer.sharedWith.length > 0 ? (
          <Badge tone="success">{`shared · ${layer.sharedWith.length}`}</Badge>
        ) : layer.emptyLayer ? (
          <Badge>empty</Badge>
        ) : (
          <MetaCell />
        ),
    },
    {
      id: 'findings',
      header: 'SIGNALS',
      width: '0.9fr',
      render: (layer) => {
        const count = layersWithFindings?.get(layer.index);
        return count ? <Badge tone="danger">{`findings · ${count}`}</Badge> : <MetaCell />;
      },
    },
    {
      id: 'cache',
      header: 'CACHE',
      width: '1.2fr',
      render: (layer) => {
        const link = buildCacheLinks.find((candidate) => candidate.layerIndex === layer.index);
        if (!link) return <MetaCell>{trace.loaded ? undefined : '…'}</MetaCell>;
        const record = link.cacheRecord;
        if (!record) return <MetaCell unavailableReason={link.unavailableDetail} />;
        return <CrossReference kind="cached" label={truncateId(record.id)} onNavigate={() => goToCacheRecord(record.id)} />;
      },
    },
    { id: 'uncompressed', header: 'SIZE', align: 'end', width: '0.8fr', render: (layer) => <MetaCell>{formatBytes(layer.uncompressedSizeBytes)}</MetaCell> },
    {
      id: 'compressed',
      header: 'COMPRESSED',
      align: 'end',
      width: '0.9fr',
      render: (layer) => (
        <MetaCell unavailableReason={layer.compressedSizeUnavailableReason}>
          {layer.compressedSizeBytes !== undefined ? formatBytes(layer.compressedSizeBytes) : undefined}
        </MetaCell>
      ),
    },
  ];

  /** The selected layer's cache record, reachable in one move — or, where the association does not exist, the reason (REQ-68). */
  function renderSelectedCacheReference() {
    if (!trace.loaded && !selectedLink) return <MetaCell>Reading the build-cache association…</MetaCell>;
    const record = selectedLink?.cacheRecord;
    if (!record) {
      return <CrossReference kind="build cache" unavailableReason={selectedLink?.unavailableDetail ?? 'This layer has no recorded build step to trace.'} />;
    }
    return (
      <Row gap="var(--space-2)" align="center" wrap>
        <CrossReference kind="build cache" label={truncateId(record.id)} onNavigate={() => goToCacheRecord(record.id)} />
        <Badge>{record.type}</Badge>
        <Badge tone={record.usageState === 'in-use' ? 'neutral' : record.usageState === 'shared' ? 'success' : 'warning'}>{record.usageState}</Badge>
        <MetaCell>{formatBytes(record.sizeBytes)}</MetaCell>
      </Row>
    );
  }

  const pathColumns: DataTableColumn<LayerChangesetPath>[] = [
    { id: 'status', header: '', width: '110px', render: (path) => <Badge tone={statusTone(path.status)}>{path.status}</Badge> },
    { id: 'path', header: 'PATH', width: '2fr', render: (path) => <IdentifierCell value={path.path} /> },
    {
      id: 'size',
      header: 'SIZE',
      align: 'end',
      width: '0.8fr',
      render: (path) => <MetaCell unavailableReason={path.sizeUnavailableReason}>{path.sizeBytes !== undefined ? formatBytes(path.sizeBytes) : undefined}</MetaCell>,
    },
  ];

  return (
    <Modal open={open} title={`Layer stack — ${image.tags[0] ?? image.shortId}`} onClose={onClose} size="large">
      <Stack gap="var(--space-4)">
        {error ? <ErrorBanner title="Could not load the layer stack" detail={error} onRetry={refresh} /> : null}
        <DataTable
          columns={layerColumns}
          rows={layers}
          rowKey={(layer) => String(layer.index)}
          selectedRowKey={selectedIndex !== undefined ? String(selectedIndex) : undefined}
          onRowSelect={(layer) => setSelectedIndex(layer.index)}
          expandedRowKey={selectedIndex !== undefined ? String(selectedIndex) : undefined}
          emptyState={<EmptyState title={loaded ? 'No layer data available' : 'Loading layer stack…'}  description={null} action={null} />}
          renderExpanded={() => (
            <Stack gap="var(--space-4)">
              <Stack gap="var(--space-2)">
                <SectionHeader variant="eyebrow" title="Build step & build cache" />
                {trace.error ? <ErrorBanner title="Could not load the build-cache association" detail={trace.error} onRetry={trace.refresh} /> : null}
                <DefinitionList
                  items={[{ label: 'Build step', value: selectedLink?.command ?? selectedLink?.instruction ?? '–' }]}
                />
                {renderSelectedCacheReference()}
              </Stack>
              {!changesets.result ? (
                <EmptyState
                  title="Changesets not analyzed yet"
                  description="Reading every layer's added, modified and deleted paths takes time and temporary disk space on a large image."
                  action={
                    <Button onClick={() => setWarningOpen(true)} disabled={analysisUrl !== undefined}>
                      Analyze changesets…
                    </Button>
                  }
                />
              ) : (
                <DataTable
                  columns={pathColumns}
                  rows={selectedChangeset?.paths ?? []}
                  rowKey={(path) => path.path}
                  maxHeight="320px"
                  emptyState={<EmptyState title="No changes recorded for this layer"  description={null} action={null} />}
                />
              )}
            </Stack>
          )}
        />
      </Stack>

      <ConfirmDialog
        open={warningOpen}
        targetName={image.tags[0] ?? image.shortId}
        consequence={`Computing per-layer changesets reads the full image (about ${formatBytes(image.sizeBytes)}) into temporary disk and takes roughly ${estimateAnalysisSeconds(image.sizeBytes)}s${image.sizeBytes > LARGE_IMAGE_THRESHOLD_BYTES ? ' or more' : ''}.`}
        confirmLabel="Analyze"
        destructive={false}
        onConfirm={startAnalysis}
        onCancel={() => setWarningOpen(false)}
      />

      <TransferProgressDialog
        open={progressDialogOpen}
        title="Analyzing layer changesets"
        description={image.tags[0] ?? image.shortId}
        currentBytes={changesets.progress?.phase === 'analyzing' ? changesets.progress.completedLayers : 0}
        totalBytes={changesets.progress?.phase === 'analyzing' ? changesets.progress.totalLayers : undefined}
        status={changesets.error ? 'error' : changesets.done ? 'done' : 'active'}
        errorMessage={changesets.error}
        formatCaption={(current, total) =>
          !changesets.progress || changesets.progress.phase === 'exporting'
            ? 'Exporting the image…'
            : total
              ? `${current} of ${total} layers analyzed`
              : `${current} layers analyzed`
        }
        onCancel={cancelAnalysis}
        onClose={closeProgressDialog}
        autoCloseOnDone
      />
    </Modal>
  );
}
