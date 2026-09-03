import { useEffect, useState } from 'react';
import {
  BadgeListCell,
  Button,
  Callout,
  Card,
  ConfirmDialog,
  DataTable,
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
  TwoLineCell,
  type DataTableColumn,
} from '../ui';
import type { ImageSummary } from '../data/images-client';
import { imageSignalsStreamUrl, type DuplicateContentGroup, type LayerSignals, type SecretFinding, type WastedFile } from '../data/image-signals-client';
import { useImageSignalsStream } from '../data/use-image-signals';
import { useFailureReport } from '../shell/services/use-failure-report';

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

/**
 * The three finding lists, as columns of the one object list (REQ-82). Each was
 * a card row built by hand, stating in a subtitle sentence what a column states
 * in its own header: the layer that wrote a file, the layer that superseded it,
 * the pattern a path matched. The reason and the pattern keep their tone, so a
 * flagged path still reads as flagged.
 */
const wastedFileColumns: DataTableColumn<WastedFile>[] = [
  { id: 'path', header: 'PATH', width: '2.4fr', render: (file) => <TwoLineCell title={file.path} /> },
  { id: 'written', header: 'WRITTEN AT', width: '128px', render: (file) => <MetaCell>{`layer ${file.layerIndex + 1}`}</MetaCell> },
  { id: 'reason', header: 'REASON', width: '132px', render: (file) => <BadgeListCell labels={[file.reason]} tone="warning" /> },
  {
    id: 'superseded',
    header: 'SUPERSEDED AT',
    width: '148px',
    render: (file) => <MetaCell>{`layer ${file.supersededByLayerIndex + 1}`}</MetaCell>,
  },
  { id: 'size', header: 'SIZE', align: 'end', width: '0.8fr', render: (file) => <MetaCell>{formatBytes(file.sizeBytes)}</MetaCell> },
];

const duplicateColumns: DataTableColumn<DuplicateContentGroup>[] = [
  {
    id: 'duplicate',
    header: 'DUPLICATE',
    width: '1.2fr',
    render: (group) => <TwoLineCell title={`${group.paths.length} copies · ${formatBytes(group.sizeBytes)} each`} />,
  },
  { id: 'paths', header: 'PATHS', width: '2.4fr', render: (group) => <MetaCell>{group.paths.map((path) => path.path).join(', ')}</MetaCell> },
  { id: 'wasted', header: 'WASTED', align: 'end', width: '0.8fr', render: (group) => <MetaCell>{formatBytes(group.wastedBytes)}</MetaCell> },
];

const secretColumns: DataTableColumn<SecretFinding>[] = [
  { id: 'path', header: 'PATH', width: '2.4fr', render: (finding) => <TwoLineCell title={finding.path} /> },
  { id: 'pattern', header: 'PATTERN', width: '1.2fr', render: (finding) => <BadgeListCell labels={[finding.patternName]} tone="danger" /> },
  {
    id: 'introduced',
    header: 'INTRODUCED AT',
    width: '148px',
    render: (finding) => <MetaCell>{`layer ${finding.introducedLayerIndex + 1}`}</MetaCell>,
  },
  {
    id: 'removed',
    header: 'REMOVED AT',
    width: '148px',
    // A finding that was never removed is still present, which is a fact about
    // the image rather than a missing value: the column says so in words.
    render: (finding) => <MetaCell>{finding.removedLayerIndex !== undefined ? `layer ${finding.removedLayerIndex + 1}` : 'still present'}</MetaCell>,
  },
];

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

  useFailureReport('Could not analyze layer efficiency', signals.error);

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

            {/* The composition containers and images ship, inside the dialog:
                the section header above, and the list alone in a card of its own
                that it fills edge to edge. Each list's one enclosing surface is
                that card, so the section around it has none — and neither does
                the dialog add one, a card inside a card being two surfaces. */}
            <Stack gap="var(--space-3)">
              <SectionHeader variant="eyebrow" title="Deleted-later / overwritten files" description="Bytes written by one layer, no longer reachable, still stored in the image." />
              <Card padding="none">
                <DataTable
                  columns={wastedFileColumns}
                  rows={signals.result.waste.wastedFiles}
                  rowKey={(file) => `${file.path}#${file.layerIndex}`}
                  selectedRowKey={selectedWasteKey}
                  onRowSelect={(file) => {
                    const key = `${file.path}#${file.layerIndex}`;
                    setSelectedWasteKey((current) => (current === key ? undefined : key));
                  }}
                  // The route out of a finding is its **expansion**, drawn for
                  // the selected row alone directly under it — not the row
                  // content slot beside it, which every row would carry.
                  expandedRowKey={selectedWasteKey}
                  renderExpanded={(file) => (
                    <Button variant="secondary" onClick={() => onNavigateToLayer(file.layerIndex)}>
                      View layer {file.layerIndex + 1}
                    </Button>
                  )}
                  emptyState={<EmptyState title="No wasted files found"  description={null} action={null} />}
                />
              </Card>
            </Stack>

            <Stack gap="var(--space-3)">
              <SectionHeader variant="eyebrow" title="Duplicated content" description="Identical file content stored at more than one path." />
              <Card padding="none">
                <DataTable
                  columns={duplicateColumns}
                  rows={signals.result.duplicates.duplicates}
                  rowKey={(group) => group.contentHash}
                  selectedRowKey={selectedDuplicateKey}
                  onRowSelect={(group) => setSelectedDuplicateKey((current) => (current === group.contentHash ? undefined : group.contentHash))}
                  expandedRowKey={selectedDuplicateKey}
                  renderExpanded={(group) => (
                    <Stack gap="var(--space-2)">
                      {group.paths.map((path) => (
                        <Button key={`${path.path}#${path.layerIndex}`} variant="secondary" onClick={() => onNavigateToLayer(path.layerIndex)}>
                          {path.path} — view layer {path.layerIndex + 1}
                        </Button>
                      ))}
                    </Stack>
                  )}
                  emptyState={<EmptyState title="No duplicated content found"  description={null} action={null} />}
                />
              </Card>
            </Stack>

            <Stack gap="var(--space-3)">
              <SectionHeader variant="eyebrow" title="Credential/secret-looking paths" description="Path and name patterns only; never a scan of file content." />
              <Card padding="none">
                <DataTable
                  columns={secretColumns}
                  rows={signals.result.secrets.findings}
                  rowKey={(finding) => `${finding.path}#${finding.introducedLayerIndex}`}
                  selectedRowKey={selectedSecretKey}
                  onRowSelect={(finding) => {
                    const key = `${finding.path}#${finding.introducedLayerIndex}`;
                    setSelectedSecretKey((current) => (current === key ? undefined : key));
                  }}
                  expandedRowKey={selectedSecretKey}
                  renderExpanded={(finding) => (
                    <Button variant="secondary" onClick={() => onNavigateToLayer(finding.introducedLayerIndex)}>
                      View introducing layer {finding.introducedLayerIndex + 1}
                    </Button>
                  )}
                  emptyState={<EmptyState title="No flagged paths found"  description={null} action={null} />}
                />
              </Card>
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
