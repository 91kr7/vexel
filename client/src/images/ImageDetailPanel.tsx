import { useEffect, useState } from 'react';
import {
  Button,
  CodeViewer,
  CollapsibleSection,
  DefinitionList,
  DetailPanel,
  EmptyState,
  ErrorBanner,
  SectionHeader,
  Stack,
} from '../ui';
import type { ImageSummary } from '../data/images-client';
import { useImageInspect } from '../data/use-image-inspect';
import { FilesystemBrowser } from './FilesystemBrowser';
import { ImageDiffView } from './ImageDiffView';
import { LayerEfficiencyView } from './LayerEfficiencyView';
import { LayerExplorer } from './LayerExplorer';

export interface ImageDetailPanelProps {
  image: ImageSummary;
  /** Every local image, offered as the other side of a comparison ("Compare with…", REQ-63). */
  images: ImageSummary[];
  onClose: () => void;
  /** Opens the layer explorer at this layer as soon as it arrives (REQ-69), e.g. following a build-cache record's reference. */
  layerFocus?: { layerIndex?: number; requestId: number };
}

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

/**
 * Image inspect surface (REQ-40): config, entrypoint/cmd, env, labels,
 * exposed ports, digest, platform, size and recorded history, plus the raw
 * payload. Later batches (layer stack, build-cache traceability) extend this
 * panel with further content.
 */
export function ImageDetailPanel({ image, images, onClose, layerFocus }: ImageDetailPanelProps) {
  const { inspect, loaded, error, refresh } = useImageInspect(image.id);
  const [layersOpen, setLayersOpen] = useState(false);
  const [filesystemOpen, setFilesystemOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [signalsOpen, setSignalsOpen] = useState(false);
  const [autoAnalyzeLayers, setAutoAnalyzeLayers] = useState(false);
  const [initialSelectedLayerIndex, setInitialSelectedLayerIndex] = useState<number | undefined>(undefined);
  const [layersWithFindings, setLayersWithFindings] = useState<Map<number, number>>(new Map());

  /** A reference followed from a build-cache record opens the layer explorer at the layer it names (REQ-69); changesets stay behind their cost warning, nothing here says they are cached. */
  useEffect(() => {
    if (!layerFocus) return;
    setInitialSelectedLayerIndex(layerFocus.layerIndex);
    setAutoAnalyzeLayers(false);
    setLayersOpen(true);
  }, [layerFocus]);

  /** A signals finding closes the signals view and opens the layer explorer at the layer it concerns, already-cached so analysis starts without the cost warning (REQ-65, REQ-67). */
  function navigateToLayer(layerIndex: number) {
    setSignalsOpen(false);
    setInitialSelectedLayerIndex(layerIndex);
    setAutoAnalyzeLayers(true);
    setLayersOpen(true);
  }

  return (
    // The close control leaves with `dismissal`: the row that opened the panel
    // closes it, and `Escape` closes it from the keyboard. Unlike the container
    // panel, the header area keeps a populated action bar — these four open the
    // image's own analyses and are panel actions, not row actions, so only the
    // `✕` goes and nothing replaces it.
    <DetailPanel
      dismissal="opening-gesture"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={() => setLayersOpen(true)}>Explore layers…</Button>
          <Button variant="secondary" onClick={() => setSignalsOpen(true)}>Efficiency & signals…</Button>
          <Button variant="secondary" onClick={() => setFilesystemOpen(true)}>Browse filesystem…</Button>
          <Button variant="secondary" onClick={() => setDiffOpen(true)} disabled={images.length < 2}>Compare with…</Button>
        </>
      }
    >
      <Stack gap="var(--space-4)">
        {error ? <ErrorBanner title="Could not load image details" detail={error} onRetry={refresh} /> : null}
        {!inspect ? (
          <EmptyState title={loaded ? 'No inspect data available' : 'Loading image details…'} />
        ) : (
          <>
            <DefinitionList
              items={[
                { label: 'Id', value: inspect.id.slice(0, 19), copyValue: inspect.id },
                { label: 'Tags', value: inspect.tags.join(', ') || '<none>' },
                { label: 'Digest', value: inspect.digest ?? '–' },
                { label: 'Platform(s)', value: inspect.platforms.join(', ') || '–' },
                { label: 'Size', value: formatBytes(inspect.sizeBytes) },
                { label: 'Created', value: inspect.createdAt },
                { label: 'Entrypoint', value: inspect.entrypoint.join(' ') || '–' },
                { label: 'Command', value: inspect.command.join(' ') || '–' },
                { label: 'Exposed ports', value: inspect.exposedPorts.join(', ') || '–' },
              ]}
            />
            <CollapsibleSection title="Environment" summary={`${inspect.env.length}`}>
              <DefinitionList items={inspect.env.map((entry) => ({ label: entry.split('=')[0], value: entry.split('=').slice(1).join('=') }))} />
            </CollapsibleSection>
            <CollapsibleSection title="Labels" summary={`${Object.keys(inspect.labels).length}`}>
              <DefinitionList items={Object.entries(inspect.labels).map(([key, value]) => ({ label: key, value }))} />
            </CollapsibleSection>
            <CollapsibleSection title="History" summary={`${inspect.history.length} layers`}>
              <DefinitionList
                items={inspect.history.map((entry, index) => ({
                  label: `${index + 1}. ${entry.createdAt}`,
                  value: `${entry.createdBy} (${formatBytes(entry.sizeBytes)})`,
                }))}
              />
            </CollapsibleSection>
            <SectionHeader variant="eyebrow" title="Raw payload" description="Exactly as received from the Engine API." />
            <CodeViewer code={JSON.stringify(inspect.raw, null, 2)} maxHeight="320px" />
          </>
        )}
      </Stack>
      <LayerExplorer
        image={image}
        open={layersOpen}
        onClose={() => setLayersOpen(false)}
        initialSelectedLayerIndex={initialSelectedLayerIndex}
        autoAnalyze={autoAnalyzeLayers}
        layersWithFindings={layersWithFindings}
      />
      <LayerEfficiencyView image={image} open={signalsOpen} onClose={() => setSignalsOpen(false)} onNavigateToLayer={navigateToLayer} onFindingsChange={setLayersWithFindings} />
      <FilesystemBrowser image={image} open={filesystemOpen} onClose={() => setFilesystemOpen(false)} />
      <ImageDiffView images={images} initialImageAId={image.id} open={diffOpen} onClose={() => setDiffOpen(false)} />
    </DetailPanel>
  );
}
