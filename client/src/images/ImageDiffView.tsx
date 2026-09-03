import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  ConfirmDialog,
  DefinitionList,
  DiffTreeView,
  EmptyState,
  FieldMessage,
  Modal,
  Row,
  Select,
  SideBySideViewer,
  Spinner,
  SplitPane,
  Stack,
  StatusPill,
  TransferProgressDialog,
  type DiffStatusFilter,
  type DiffTreeNode,
} from '../ui';
import type { ImageSummary } from '../data/images-client';
import { imageDiffStreamUrl, type ImageDiffEntry, type ImageDiffNature } from '../data/image-diff-client';
import { useImageDiffStream } from '../data/use-image-diff-stream';
import { useImageDiffTree } from '../data/use-image-diff-tree';
import { useImageFilesystemEntryContent } from '../data/use-image-filesystem-entry';
import { useFailureReport } from '../shell/services/use-failure-report';

export interface ImageDiffViewProps {
  images: ImageSummary[];
  /** Pre-selected image ids (REQ-63): both from a two-image bulk selection, or the first alone from a row's "Compare with…" entry. */
  initialImageAId?: string;
  initialImageBId?: string;
  open: boolean;
  onClose: () => void;
}

const ROOT_PATH = '';
const NATURE_LABEL: Record<ImageDiffNature, string> = {
  content: 'Content',
  size: 'Size',
  mode: 'Permissions',
  ownership: 'Ownership',
  'symlink-target': 'Symlink target',
};

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

function imageLabel(image: ImageSummary): string {
  return image.tags[0] ?? image.shortId;
}

function toDiffTreeNode(entry: ImageDiffEntry): DiffTreeNode {
  return { id: entry.path, label: entry.name, kind: entry.kind, status: entry.status, rollup: entry.rollup };
}

/** Whether `entry` (or something in its subtree) matches `filter`. */
function matchesFilter(entry: ImageDiffEntry, filter: DiffStatusFilter): boolean {
  if (filter === 'all') return true;
  if (entry.status === filter) return true;
  return Boolean(entry.rollup && entry.rollup[filter] > 0);
}

function formatMode(mode?: number): string | undefined {
  return mode !== undefined ? `0${mode.toString(8)}` : undefined;
}

function sideMetadataItems(label: string, side: ImageDiffEntry['a']) {
  if (!side) return [{ label, value: 'Not present on this side' }];
  return [
    { label: `${label} · size`, value: side.sizeBytes !== undefined ? formatBytes(side.sizeBytes) : '–' },
    { label: `${label} · permissions`, value: formatMode(side.mode) ?? '–' },
    { label: `${label} · owner`, value: side.uid !== undefined ? `${side.uid}:${side.gid}` : '–' },
    ...(side.linkTarget !== undefined ? [{ label: `${label} · link target`, value: side.linkTarget }] : []),
  ];
}

/** Rough, displayed-only estimate driving the pre-comparison cost warning; not a measured cost model. */
function estimateComparisonSeconds(sizeBytesA: number, sizeBytesB: number): number {
  return Math.max(5, Math.round((sizeBytesA + sizeBytesB) / (20 * 1024 * 1024)) * 5);
}

/**
 * Cross-image filesystem diff view (REQ-63, REQ-64): pick two images (or
 * start from ones already chosen), a cost warning then cancellable
 * comparison progress (extracting either side not already cached, then
 * comparing), then the difference as a navigable, status-filterable tree;
 * selecting a changed path states what changed and previews both sides.
 *
 * One view, two shapes of the operation: the bulk path arrives with both
 * operands, the row path with the first one alone. Nothing is remembered
 * between openings — every opening re-seeds both sides from the ids it was
 * given — so neither shape can leave an operand behind for the other.
 */
export function ImageDiffView({ images, initialImageAId, initialImageBId, open, onClose }: ImageDiffViewProps) {
  const [imageAId, setImageAId] = useState('');
  const [imageBId, setImageBId] = useState('');
  const [warningOpen, setWarningOpen] = useState(false);
  const [diffUrl, setDiffUrl] = useState<string | undefined>(undefined);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<DiffStatusFilter>('all');

  const diff = useImageDiffStream(diffUrl);

  useFailureReport('Could not compare the filesystems', diff.error);
  const tree = useImageDiffTree(diff.result ? diff.result.imageIdA : undefined, diff.result ? diff.result.imageIdB : undefined);

  useEffect(() => {
    if (!open) return;
    setImageAId(initialImageAId ?? '');
    setImageBId(initialImageBId ?? '');
    setDiffUrl(undefined);
    setExpandedIds(new Set());
    setSelectedPath(undefined);
    setStatusFilter('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialImageAId, initialImageBId]);

  const imageA = images.find((image) => image.id === imageAId);
  const imageB = images.find((image) => image.id === imageBId);
  /**
   * The row shape of the operation: one operand supplied, the other left to be
   * chosen here. The view says which image it was started from, by the same
   * reference the pick-list shows, so the side that is theirs is read rather
   * than inferred from a pre-filled control. Stated, never pinned — the operand
   * stays changeable, and the line goes once it has been changed, since it would
   * then name an image that is no longer the first side.
   */
  const startedFrom = initialImageAId !== undefined && initialImageBId === undefined ? images.find((image) => image.id === initialImageAId) : undefined;
  const rootEntries = tree.childrenByPath.get(ROOT_PATH);
  if (diff.result && rootEntries === undefined && !tree.loadingPaths.has(ROOT_PATH)) tree.loadChildren(ROOT_PATH);

  const filteredChildrenById = new Map<string, DiffTreeNode[]>();
  for (const [path, entries] of tree.childrenByPath) {
    if (path === ROOT_PATH) continue;
    filteredChildrenById.set(path, entries.filter((entry) => matchesFilter(entry, statusFilter)).map(toDiffTreeNode));
  }
  const rootNodes = (rootEntries ?? []).filter((entry) => matchesFilter(entry, statusFilter)).map(toDiffTreeNode);
  const loadingIds = new Set(Array.from(tree.loadingPaths).filter((path) => path !== ROOT_PATH));

  const selectedEntry = selectedPath !== undefined ? findLoadedEntry(tree.childrenByPath, selectedPath) : undefined;
  const selectedIsFile = selectedEntry?.kind === 'file';

  const leftContent = useImageFilesystemEntryContent(
    diff.result && selectedIsFile && selectedEntry?.a ? diff.result.imageIdA : undefined,
    selectedIsFile && selectedEntry?.a ? selectedPath : undefined,
    undefined,
  );
  const rightContent = useImageFilesystemEntryContent(
    diff.result && selectedIsFile && selectedEntry?.b ? diff.result.imageIdB : undefined,
    selectedIsFile && selectedEntry?.b ? selectedPath : undefined,
    undefined,
  );

  function toggleExpand(node: DiffTreeNode) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
    if (!expandedIds.has(node.id) && !tree.childrenByPath.has(node.id) && !tree.loadingPaths.has(node.id)) tree.loadChildren(node.id);
  }

  function startComparison() {
    if (!imageA || !imageB) return;
    setWarningOpen(false);
    setProgressDialogOpen(true);
    tree.reset();
    setExpandedIds(new Set());
    setSelectedPath(undefined);
    setDiffUrl(imageDiffStreamUrl(imageA.id, imageB.id));
  }

  function cancelComparison() {
    setProgressDialogOpen(false);
    setDiffUrl(undefined);
  }

  function closeProgressDialog() {
    setProgressDialogOpen(false);
    if (diff.error) setDiffUrl(undefined);
  }

  return (
    <Modal open={open} title="Compare filesystems" onClose={onClose} size="large">
      <Stack gap="var(--space-4)">
        {startedFrom && imageAId === startedFrom.id ? (
          <FieldMessage tone="muted">
            Started from {imageLabel(startedFrom)} — the first image of this comparison. Pick the second one below.
          </FieldMessage>
        ) : null}
        <Row gap="var(--space-3)" align="center">
          <Select
            ariaLabel="First image"
            value={imageAId}
            onChange={setImageAId}
            options={[{ value: '', label: 'Select an image…' }, ...images.map((image) => ({ value: image.id, label: imageLabel(image) }))]}
          />
          <Badge tone="neutral">vs</Badge>
          <Select
            ariaLabel="Second image"
            value={imageBId}
            onChange={setImageBId}
            options={[{ value: '', label: 'Select an image…' }, ...images.map((image) => ({ value: image.id, label: imageLabel(image) }))]}
          />
          <Button disabled={!imageA || !imageB || imageAId === imageBId} onClick={() => setWarningOpen(true)}>
            Compare
          </Button>
        </Row>

        {diff.result ? (
          <StatusPill tone="neutral">
            {diff.result.addedCount} added · {diff.result.removedCount} removed · {diff.result.changedCount} changed
          </StatusPill>
        ) : null}

        {!diff.result ? (
          <EmptyState
            title="No comparison yet"
            description="Pick two images and start a comparison to see their filesystem differences."
           action={null} />
        ) : (
          <SplitPane
            startWidth="360px"
            start={
              <DiffTreeView
                rootNodes={rootNodes}
                childrenById={filteredChildrenById}
                loadingIds={loadingIds}
                expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
                selectedId={selectedPath}
                onSelect={(node) => setSelectedPath(node.id)}
                maxHeight="480px"
                emptyState={<EmptyState title="No differences" description="These two images have identical filesystems."  action={null} />}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
              />
            }
            end={
              selectedPath === undefined ? (
                <EmptyState title="No path selected" description="Select an added, removed or changed path to see what changed."  action={null} />
              ) : !selectedEntry ? (
                <Spinner label="Loading entry" />
              ) : (
                <Stack gap="var(--space-4)">
                  <Row gap="var(--space-2)" wrap>
                    {(selectedEntry.natures ?? []).map((nature) => (
                      <Badge key={nature} tone="warning">
                        {NATURE_LABEL[nature]}
                      </Badge>
                    ))}
                    {!selectedEntry.natures && selectedEntry.status ? <Badge tone={selectedEntry.status === 'added' ? 'success' : 'danger'}>{selectedEntry.status}</Badge> : null}
                  </Row>
                  <DefinitionList
                    items={[...sideMetadataItems(imageLabel(imageA!), selectedEntry.a), ...sideMetadataItems(imageLabel(imageB!), selectedEntry.b)]}
                  />
                  {selectedEntry.kind === 'file' ? (
                    <SideBySideViewer
                      maxHeight="360px"
                      left={{
                        header: imageLabel(imageA!),
                        content: leftContent.content?.content,
                        mode: leftContent.content?.mode,
                        truncated: leftContent.content?.truncated,
                        totalSizeBytes: leftContent.content?.totalSizeBytes,
                        emptyMessage: selectedEntry.a ? (leftContent.loading ? 'Loading…' : leftContent.error) : 'Not present on this side',
                      }}
                      right={{
                        header: imageLabel(imageB!),
                        content: rightContent.content?.content,
                        mode: rightContent.content?.mode,
                        truncated: rightContent.content?.truncated,
                        totalSizeBytes: rightContent.content?.totalSizeBytes,
                        emptyMessage: selectedEntry.b ? (rightContent.loading ? 'Loading…' : rightContent.error) : 'Not present on this side',
                      }}
                    />
                  ) : null}
                </Stack>
              )
            }
          />
        )}
      </Stack>

      <ConfirmDialog
        open={warningOpen}
        targetName={imageA && imageB ? `${imageLabel(imageA)} vs ${imageLabel(imageB)}` : ''}
        consequence={
          imageA && imageB
            ? `Comparing extracts either image not already browsed (a container created from it, never started, then removed), taking roughly ${estimateComparisonSeconds(imageA.sizeBytes, imageB.sizeBytes)}s or more for large images.`
            : ''
        }
        confirmLabel="Compare"
        destructive={false}
        onConfirm={startComparison}
        onCancel={() => setWarningOpen(false)}
      />

      <TransferProgressDialog
        open={progressDialogOpen}
        title="Comparing filesystems"
        description={imageA && imageB ? `${imageLabel(imageA)} vs ${imageLabel(imageB)}` : undefined}
        currentBytes={0}
        status={diff.error ? 'error' : diff.done ? 'done' : 'active'}
        formatCaption={() =>
          !diff.progress
            ? 'Starting…'
            : diff.progress.phase === 'extracting'
              ? `Extracting image ${diff.progress.side.toUpperCase()}…`
              : `Comparing paths — ${diff.progress.comparedPaths} / ${diff.progress.totalPaths}`
        }
        onCancel={cancelComparison}
        onClose={closeProgressDialog}
        autoCloseOnDone
      />
    </Modal>
  );
}

/** The selected path's own diff entry, if the directory level holding it has been loaded. */
function findLoadedEntry(childrenByPath: Map<string, ImageDiffEntry[]>, path: string): ImageDiffEntry | undefined {
  for (const entries of childrenByPath.values()) {
    const found = entries.find((entry) => entry.path === path);
    if (found) return found;
  }
  return undefined;
}
