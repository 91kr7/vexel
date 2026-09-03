import {
  CodeViewer,
  CollapsibleSection,
  DefinitionList,
  DetailPanel,
  EmptyState,
  SectionHeader,
  Stack,
} from '../ui';
import type { ImageSummary } from '../data/images-client';
import { useImageInspect } from '../data/use-image-inspect';
import { useFailureReport } from '../shell/services/use-failure-report';
import { FailedReadEmptyState } from '../shell/FailedReadEmptyState';

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
 * exposed ports, digest, platform, content size and recorded history, plus the
 * raw payload.
 */
export function ImageDetailPanel({ image, onClose }: ImageDetailPanelProps) {
  const { inspect, loaded, error } = useImageInspect(image.id);

  useFailureReport('Could not load image details', error);

  // The repository digest, and only when it is a digest of its own (REQ-58): a
  // containerd-backed daemon reports the image id under `RepoDigests` too, and
  // the delivered panel then printed the identical value under `Id` and under
  // `Digest`. The server sends the two Engine fields as they are — this is the
  // daemon stating one digest twice, not a payload defect — so the band with
  // nothing of its own is simply not rendered.
  const repositoryDigest = inspect?.digest !== undefined && !inspect.id.startsWith(inspect.digest) ? inspect.digest : undefined;

  return (
    // The close control leaves with `dismissal`: the row that opened the panel
    // closes it, and `Escape` closes it from the keyboard. The action bar is
    // gone with it, and `actions` is *omitted* rather than passed an empty node
    // — an empty one would keep the header's slot spacing and leave a gap where
    // the four analysis buttons sat. This panel shows data and offers nothing,
    // exactly as the container panel does: the intended end state, not a region
    // waiting to be filled. The four analyses are the screen's own views now,
    // opened from the row's overflow menu (`images-screen.md`).
    <DetailPanel
      dismissal="opening-gesture"
      onClose={onClose}
      // The properties are the panel primitive's own grid rather than a list
      // this file lays out (REQ-61): same properties, same order, same content
      // class, so the certified column rule
      // (plan-docker_management_app-detail_property_columns) resolves exactly as
      // it did. `Digest` is the one band that can be absent, and only when it
      // has nothing of its own to state.
      properties={
        inspect
          ? [
              { label: 'Id', value: inspect.id.slice(0, 19) },
              { label: 'Tags', value: inspect.tags.join(', ') || '<none>' },
              ...(repositoryDigest ? [{ label: 'Digest', value: repositoryDigest }] : []),
              { label: 'Platform(s)', value: inspect.platforms.join(', ') || '–' },
              // The inspect endpoint's own `Size` — the image's content, which on
              // a containerd-backed daemon excludes the unpacked snapshots the
              // list's `DISK USAGE` column counts (`ImagesScreen.tsx`). Measured
              // on this daemon, 2026-08-15, `alpine:3.20`: 4,103,199 here against
              // 13,660,215 in the row. Two measurements, two names (REQ-59).
              { label: 'Content size', value: formatBytes(inspect.sizeBytes) },
              { label: 'Created', value: inspect.createdAt },
              { label: 'Entrypoint', value: inspect.entrypoint.join(' ') || '–' },
              { label: 'Command', value: inspect.command.join(' ') || '–' },
              { label: 'Exposed ports', value: inspect.exposedPorts.join(', ') || '–' },
            ]
          : undefined
      }
    >
      <Stack gap="var(--space-4)">
        {!inspect ? (
          error ? (
            <FailedReadEmptyState />
          ) : (
            <EmptyState title={loaded ? 'No inspect data available' : 'Loading image details…'} description={null} action={null} />
          )
        ) : (
          <>
            {/*
              A section with a count of `0` is absent, not present and empty
              (REQ-60): the delivered panel drew a `Labels` section headed `0` on
              every image declaring none. A section with content is unchanged.
            */}
            {inspect.env.length > 0 ? (
              <CollapsibleSection title="Environment" summary={`${inspect.env.length}`}>
                <DefinitionList
                  contentClass="long-single-line"
                  items={inspect.env.map((entry) => ({ label: entry.split('=')[0], value: entry.split('=').slice(1).join('=') }))}
                />
              </CollapsibleSection>
            ) : null}
            {Object.keys(inspect.labels).length > 0 ? (
              <CollapsibleSection title="Labels" summary={`${Object.keys(inspect.labels).length}`}>
                <DefinitionList contentClass="long-single-line" items={Object.entries(inspect.labels).map(([key, value]) => ({ label: key, value }))} />
              </CollapsibleSection>
            ) : null}
            {inspect.history.length > 0 ? (
              <CollapsibleSection title="History" summary={`${inspect.history.length} layers`}>
                <DefinitionList
                  contentClass="free-text"
                  items={inspect.history.map((entry, index) => ({
                    label: `${index + 1}. ${entry.createdAt}`,
                    value: `${entry.createdBy} (${formatBytes(entry.sizeBytes)})`,
                  }))}
                />
              </CollapsibleSection>
            ) : null}
            <SectionHeader variant="eyebrow" title="Raw payload" description="Exactly as received from the Engine API." />
            <CodeViewer code={JSON.stringify(inspect.raw, null, 2)} maxHeight="320px" />
          </>
        )}
      </Stack>
    </DetailPanel>
  );
}
