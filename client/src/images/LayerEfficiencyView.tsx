import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Callout,
  CardList,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Grid,
  MetaCell,
  MetricTile,
  Meter,
  Modal,
  SectionHeader,
  Stack,
  TransferProgressDialog,
  type CardListRowContent,
} from '../ui';
import type { ImageSummary } from '../data/images-client';
import { imageSignalsStreamUrl, type DuplicateContentGroup, type LayerSignals, type SecretFinding, type WastedFile } from '../data/image-signals-client';
import { useImageSignalsStream } from '../data/use-image-signals';

export interface LayerEfficiencyViewProps {
  image: ImageSummary;
  open: boolean;
  onClose: () => void;
  /** Closes this view and selects `layerIndex` in the layer explorer (REQ-65, REQ-67). */
  onNavigateToLayer: (layerIndex: number) => void;
  /** Reported every time a new result arrives, so the layer explorer can mark layers carrying findings (REQ-65, REQ-67). */
  onFindingsChange?: (layersWithFindings: Map<number, number>) => void;
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

/** Rough, displayed-only estimate driving the pre-analysis cost warning; not a measured cost model. */
function estimateAnalysisSeconds(sizeBytes: number): number {
  return Math.max(5, Math.round(sizeBytes / (20 * 1024 * 1024)) * 5);
}

/** Every layer index a finding names, with how many findings name it — feeds the layer explorer's markers. */
function countFindingsByLayer(signals: LayerSignals): Map<number, number> {
  const counts = new Map<number, number>();
  const bump = (layerIndex: number) => counts.set(layerIndex, (counts.get(layerIndex) ?? 0) + 1);

  for (const file of signals.waste.wastedFiles) bump(file.layerIndex);
  for (const group of signals.duplicates.duplicates) for (const path of group.paths) bump(path.layerIndex);
  for (const finding of signals.secrets.findings) {
    bump(finding.introducedLayerIndex);
    if (finding.removedLayerIndex !== undefined) bump(finding.removedLayerIndex);
  }
  return counts;
}

function wasteRow(file: WastedFile): CardListRowContent {
  return {
    title: file.path,
    subtitle: `layer ${file.layerIndex + 1} → ${file.reason} at layer ${file.supersededByLayerIndex + 1}`,
    badges: <Badge tone="warning">{file.reason}</Badge>,
    meta: <MetaCell>{formatBytes(file.sizeBytes)}</MetaCell>,
  };
}

function duplicateRow(group: DuplicateContentGroup): CardListRowContent {
  return {
    title: `${group.paths.length} copies · ${formatBytes(group.sizeBytes)} each`,
    subtitle: group.paths.map((path) => path.path).join(', '),
    badges: <Badge tone="warning">duplicate</Badge>,
    meta: <MetaCell>{formatBytes(group.wastedBytes)}</MetaCell>,
  };
}

function secretRow(finding: SecretFinding): CardListRowContent {
  return {
    title: finding.path,
    subtitle:
      finding.removedLayerIndex !== undefined
        ? `${finding.patternName} · introduced at layer ${finding.introducedLayerIndex + 1}, removed at layer ${finding.removedLayerIndex + 1}`
        : `${finding.patternName} · introduced at layer ${finding.introducedLayerIndex + 1}, still present`,
    badges: <Badge tone="danger">secret pattern</Badge>,
  };
}

/**
 * Layer efficiency and secret-signal view (REQ-65, REQ-66, REQ-67): shares
 * the changeset job/cache of the layer explorer, then presents wasted bytes
 * with an efficiency score, duplicated content and flagged credential-looking
 * paths, each behind an explicit heuristic disclaimer and navigating to the
 * layer it concerns.
 */
export function LayerEfficiencyView({ image, open, onClose, onNavigateToLayer, onFindingsChange }: LayerEfficiencyViewProps) {
  const [warningOpen, setWarningOpen] = useState(false);
  const [analysisUrl, setAnalysisUrl] = useState<string | undefined>(undefined);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [selectedWasteKey, setSelectedWasteKey] = useState<string | undefined>(undefined);
  const [selectedDuplicateKey, setSelectedDuplicateKey] = useState<string | undefined>(undefined);
  const [selectedSecretKey, setSelectedSecretKey] = useState<string | undefined>(undefined);

  const signals = useImageSignalsStream(analysisUrl);

  useEffect(() => {
    if (signals.result) onFindingsChange?.(countFindingsByLayer(signals.result));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals.result]);

  function startAnalysis() {
    setWarningOpen(false);
    setProgressDialogOpen(true);
    setAnalysisUrl(imageSignalsStreamUrl(image.id));
  }

  function cancelAnalysis() {
    setProgressDialogOpen(false);
    setAnalysisUrl(undefined);
  }

  function closeProgressDialog() {
    setProgressDialogOpen(false);
    if (signals.error) setAnalysisUrl(undefined);
  }

  return (
    <Modal open={open} title={`Efficiency & signals — ${image.tags[0] ?? image.shortId}`} onClose={onClose} size="large">
      <Stack gap="var(--space-4)">
        <Callout tone="info" title="Heuristic signals, not a security verdict">
          Wasted bytes, duplicated content and flagged paths below are derived from the image's own
          layer history — path and size patterns, never file content read as a secret. Review a
          flagged path before treating it as an actual leak.
        </Callout>

        {signals.error ? <ErrorBanner title="Could not analyze the image's layer efficiency" detail={signals.error} onRetry={() => setWarningOpen(true)} /> : null}

        {!signals.result ? (
          <EmptyState
            title="Not analyzed yet"
            description="Deriving waste, duplication and secret-pattern signals reuses the layer explorer's changeset analysis, reading the full image the first time."
            action={
              <Button onClick={() => setWarningOpen(true)} disabled={analysisUrl !== undefined}>
                Analyze layer efficiency…
              </Button>
            }
          />
        ) : (
          <Stack gap="var(--space-6)">
            <Grid columns="repeat(auto-fit, minmax(200px, 1fr))" gap="var(--space-5)">
              <MetricTile
                label="Efficiency score"
                value={`${Math.round(signals.result.waste.efficiencyScore * 100)}%`}
                subLabel={`${formatBytes(signals.result.waste.totalWastedBytes)} wasted of ${formatBytes(signals.result.waste.totalBytesWritten)} written`}
                tone={signals.result.waste.efficiencyScore < 0.7 ? 'warning' : 'success'}
              >
                <Meter
                  value={signals.result.waste.efficiencyScore * 100}
                  max={100}
                  tone={signals.result.waste.efficiencyScore < 0.7 ? 'warning' : 'success'}
                  ariaLabel="Layer efficiency score"
                />
              </MetricTile>
              <MetricTile label="Duplicated content" value={formatBytes(signals.result.duplicates.totalDuplicateWastedBytes)} subLabel={`${signals.result.duplicates.duplicates.length} group(s)`} tone={signals.result.duplicates.duplicates.length > 0 ? 'warning' : 'neutral'} />
              <MetricTile label="Flagged paths" value={String(signals.result.secrets.findings.length)} subLabel="credential/secret patterns" tone={signals.result.secrets.findings.length > 0 ? 'danger' : 'neutral'} />
            </Grid>

            <Stack gap="var(--space-3)">
              <SectionHeader variant="eyebrow" title="Deleted-later / overwritten files" description="Bytes written by one layer, no longer reachable, still stored in the image." />
              <CardList
                items={signals.result.waste.wastedFiles}
                itemKey={(file) => `${file.path}#${file.layerIndex}`}
                renderRow={wasteRow}
                selectedKey={selectedWasteKey}
                onSelect={(file) => setSelectedWasteKey(`${file.path}#${file.layerIndex}`)}
                expandedKey={selectedWasteKey}
                renderExpanded={(file) => (
                  <Button variant="secondary" onClick={() => onNavigateToLayer(file.layerIndex)}>
                    View layer {file.layerIndex + 1}
                  </Button>
                )}
                emptyState={<EmptyState title="No wasted files found" />}
              />
            </Stack>

            <Stack gap="var(--space-3)">
              <SectionHeader variant="eyebrow" title="Duplicated content" description="Identical file content stored at more than one path." />
              <CardList
                items={signals.result.duplicates.duplicates}
                itemKey={(group) => group.contentHash}
                renderRow={duplicateRow}
                selectedKey={selectedDuplicateKey}
                onSelect={(group) => setSelectedDuplicateKey(group.contentHash)}
                expandedKey={selectedDuplicateKey}
                renderExpanded={(group) => (
                  <Stack gap="var(--space-2)">
                    {group.paths.map((path) => (
                      <Button key={`${path.path}#${path.layerIndex}`} variant="secondary" onClick={() => onNavigateToLayer(path.layerIndex)}>
                        {path.path} — view layer {path.layerIndex + 1}
                      </Button>
                    ))}
                  </Stack>
                )}
                emptyState={<EmptyState title="No duplicated content found" />}
              />
            </Stack>

            <Stack gap="var(--space-3)">
              <SectionHeader variant="eyebrow" title="Credential/secret-looking paths" description="Path and name patterns only; never a scan of file content." />
              <CardList
                items={signals.result.secrets.findings}
                itemKey={(finding) => `${finding.path}#${finding.introducedLayerIndex}`}
                renderRow={secretRow}
                selectedKey={selectedSecretKey}
                onSelect={(finding) => setSelectedSecretKey(`${finding.path}#${finding.introducedLayerIndex}`)}
                expandedKey={selectedSecretKey}
                renderExpanded={(finding) => (
                  <Button variant="secondary" onClick={() => onNavigateToLayer(finding.introducedLayerIndex)}>
                    View introducing layer {finding.introducedLayerIndex + 1}
                  </Button>
                )}
                emptyState={<EmptyState title="No flagged paths found" />}
              />
            </Stack>
          </Stack>
        )}
      </Stack>

      <ConfirmDialog
        open={warningOpen}
        targetName={image.tags[0] ?? image.shortId}
        consequence={`Analyzing layer efficiency reuses the layer explorer's changeset analysis; the first run reads the full image (about ${formatBytes(image.sizeBytes)}) into temporary disk and takes roughly ${estimateAnalysisSeconds(image.sizeBytes)}s.`}
        confirmLabel="Analyze"
        destructive={false}
        onConfirm={startAnalysis}
        onCancel={() => setWarningOpen(false)}
      />

      <TransferProgressDialog
        open={progressDialogOpen}
        title="Analyzing layer efficiency"
        description={image.tags[0] ?? image.shortId}
        currentBytes={signals.progress?.phase === 'analyzing' ? signals.progress.completedLayers : 0}
        totalBytes={signals.progress?.phase === 'analyzing' ? signals.progress.totalLayers : undefined}
        status={signals.error ? 'error' : signals.done ? 'done' : 'active'}
        errorMessage={signals.error}
        formatCaption={(current, total) =>
          !signals.progress || signals.progress.phase === 'exporting'
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
