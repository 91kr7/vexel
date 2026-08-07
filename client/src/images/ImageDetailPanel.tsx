import {
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

export interface ImageDetailPanelProps {
  image: ImageSummary;
  onClose: () => void;
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
export function ImageDetailPanel({ image, onClose }: ImageDetailPanelProps) {
  const { inspect, loaded, error, refresh } = useImageInspect(image.id);

  return (
    <DetailPanel onClose={onClose}>
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
    </DetailPanel>
  );
}
