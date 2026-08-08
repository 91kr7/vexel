import { useState } from 'react';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorBanner,
  IdentifierCell,
  MetaCell,
  Modal,
  ProportionBarCell,
  Stack,
  TransferProgressDialog,
  type DataTableColumn,
} from '../ui';
import type { ImageSummary } from '../data/images-client';
import { imageChangesetsStreamUrl, type LayerChangesetPath, type LayerMetadata } from '../data/image-layers-client';
import { useImageChangesetStream } from '../data/use-image-changesets';
import { useImageLayerStack } from '../data/use-image-layers';

export interface LayerExplorerProps {
  image: ImageSummary;
  open: boolean;
  onClose: () => void;
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

/**
 * Layer explorer (REQ-47–51): the image's layer stack in build order, each
 * layer's instruction shown as a bar proportional to its uncompressed size,
 * shared-layer markers naming the images that reuse it, and — once analysed,
 * behind a cost warning — the selected layer's added/modified/deleted paths.
 */
export function LayerExplorer({ image, open, onClose }: LayerExplorerProps) {
  const { stack, loaded, error, refresh } = useImageLayerStack(open ? image.id : undefined);
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

  const layers = stack?.layers ?? [];
  const maxSize = layers.reduce((max, layer) => Math.max(max, layer.uncompressedSizeBytes), 0);
  const selectedChangeset = changesets.result?.layers.find((layer) => layer.layerIndex === selectedIndex);

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
          emptyState={<EmptyState title={loaded ? 'No layer data available' : 'Loading layer stack…'} />}
          renderExpanded={() =>
            !changesets.result ? (
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
                emptyState={<EmptyState title="No changes recorded for this layer" />}
              />
            )
          }
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
      />
    </Modal>
  );
}
