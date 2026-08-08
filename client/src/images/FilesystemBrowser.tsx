import { useState } from 'react';
import {
  Button,
  ConfirmDialog,
  DefinitionList,
  EmptyState,
  FieldMessage,
  Modal,
  Row,
  SplitPane,
  Stack,
  StatusPill,
  TransferProgressDialog,
  TreeView,
  type TreeNode,
} from '../ui';
import type { ImageSummary } from '../data/images-client';
import { imageFilesystemStreamUrl, type FilesystemEntry } from '../data/image-filesystem-client';
import { useImageFilesystemExtraction } from '../data/use-image-filesystem-extraction';
import { useImageFilesystemTree } from '../data/use-image-filesystem-tree';

export interface FilesystemBrowserProps {
  image: ImageSummary;
  open: boolean;
  onClose: () => void;
}

const ROOT_PATH = '';

/** Above this uncompressed image size, the cost warning names a meaningfully longer estimate (REQ-55). */
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

/** Rough, displayed-only estimate driving the pre-extraction cost warning (REQ-55); not a measured cost model. */
function estimateExtractionSeconds(sizeBytes: number): number {
  return Math.max(5, Math.round(sizeBytes / (20 * 1024 * 1024)) * 5);
}

function toTreeNode(entry: FilesystemEntry): TreeNode {
  return { id: entry.path, label: entry.name, kind: entry.kind, meta: entry.kind === 'file' && entry.sizeBytes !== undefined ? formatBytes(entry.sizeBytes) : undefined };
}

/**
 * Filesystem browser for one image (REQ-52–56, REQ-113): a cost warning,
 * then cancellable extraction progress (a container created from the image
 * and never started, its filesystem copied out and removed again), then the
 * merged filesystem as a lazily expanded tree — identically for a
 * distroless/scratch image since nothing from it is ever executed.
 */
export function FilesystemBrowser({ image, open, onClose }: FilesystemBrowserProps) {
  const [warningOpen, setWarningOpen] = useState(false);
  const [pendingForce, setPendingForce] = useState(false);
  const [extractionUrl, setExtractionUrl] = useState<string | undefined>(undefined);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const extraction = useImageFilesystemExtraction(extractionUrl);
  const tree = useImageFilesystemTree(image.id);

  const rootEntries = tree.childrenByPath.get(ROOT_PATH);
  if (extraction.result && rootEntries === undefined && !tree.loadingPaths.has(ROOT_PATH)) tree.loadChildren(ROOT_PATH);

  // Every loaded entry, at any depth, keyed by its own path — the tree only
  // needs children grouped by parent id, but the detail panel needs to look
  // up whichever entry is currently selected regardless of its depth.
  const entriesById = new Map<string, FilesystemEntry>();
  const childrenById = new Map<string, TreeNode[]>();
  for (const [path, entries] of tree.childrenByPath) {
    for (const entry of entries) entriesById.set(entry.path, entry);
    if (path !== ROOT_PATH) childrenById.set(path, entries.map(toTreeNode));
  }
  const rootNodes = (rootEntries ?? []).map(toTreeNode);
  const loadingIds = new Set(Array.from(tree.loadingPaths).filter((path) => path !== ROOT_PATH));

  const selectedEntry = selectedId !== undefined ? entriesById.get(selectedId) : undefined;

  function openWarning(force: boolean) {
    setPendingForce(force);
    setWarningOpen(true);
  }

  function startExtraction() {
    setWarningOpen(false);
    setProgressDialogOpen(true);
    tree.reset();
    setExpandedIds(new Set());
    setSelectedId(undefined);
    setExtractionUrl(imageFilesystemStreamUrl(image.id, pendingForce));
  }

  /** Cancelling genuinely stops the work and leaves nothing behind (REQ-54, REQ-55): the intermediate container is still removed server-side. */
  function cancelExtraction() {
    setProgressDialogOpen(false);
    setExtractionUrl(undefined);
  }

  function closeProgressDialog() {
    setProgressDialogOpen(false);
    if (extraction.error) setExtractionUrl(undefined);
  }

  function toggleExpand(node: TreeNode) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
    if (!expandedIds.has(node.id) && !tree.childrenByPath.has(node.id) && !tree.loadingPaths.has(node.id)) tree.loadChildren(node.id);
  }

  return (
    <Modal open={open} title={`Filesystem — ${image.tags[0] ?? image.shortId}`} onClose={onClose} size="large">
      <Stack gap="var(--space-4)">
        {extraction.result ? (
          <>
            <Row justify="between" align="center">
              <StatusPill
                tone={extraction.result.fromCache ? 'neutral' : 'success'}
                action={{ label: 'Re-extract…', onClick: () => openWarning(true) }}
              >
                {extraction.result.fromCache ? 'From cache' : 'Freshly extracted'} · {extraction.result.entryCount} entries
              </StatusPill>
            </Row>
            <FieldMessage tone="muted">
              Includes container-creation scaffolding (e.g. .dockerenv, dev/, etc/hostname, proc/, sys/) written by Docker itself,
              not necessarily shipped by the image.
            </FieldMessage>
          </>
        ) : null}

        {!extraction.result ? (
          <EmptyState
            title="Filesystem not extracted yet"
            description="No process from this image is ever run: a container is created from it, its filesystem is copied out, and the container is removed."
            action={<Button onClick={() => openWarning(false)}>Browse filesystem…</Button>}
          />
        ) : (
          <SplitPane
            maxHeight="480px"
            start={
              <TreeView
                rootNodes={rootNodes}
                childrenById={childrenById}
                loadingIds={loadingIds}
                expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
                selectedId={selectedId}
                onSelect={(node) => setSelectedId(node.id)}
                maxHeight="480px"
                emptyState={<EmptyState title="Empty filesystem" />}
              />
            }
            end={
              selectedEntry ? (
                <DefinitionList
                  items={[
                    { label: 'Path', value: `/${selectedEntry.path}`, copyValue: `/${selectedEntry.path}` },
                    { label: 'Type', value: selectedEntry.kind },
                    { label: 'Size', value: selectedEntry.sizeBytes !== undefined ? formatBytes(selectedEntry.sizeBytes) : '–' },
                  ]}
                />
              ) : (
                <EmptyState title="No entry selected" description="Select a file, directory or symlink to see its details." />
              )
            }
          />
        )}
      </Stack>

      <ConfirmDialog
        open={warningOpen}
        targetName={image.tags[0] ?? image.shortId}
        consequence={`Extracting the filesystem creates a container from the image (never started) and copies out about ${formatBytes(image.sizeBytes)}, taking roughly ${estimateExtractionSeconds(image.sizeBytes)}s${image.sizeBytes > LARGE_IMAGE_THRESHOLD_BYTES ? ' or more' : ''}.`}
        confirmLabel="Extract"
        destructive={false}
        onConfirm={startExtraction}
        onCancel={() => setWarningOpen(false)}
      />

      <TransferProgressDialog
        open={progressDialogOpen}
        title="Extracting the filesystem"
        description={image.tags[0] ?? image.shortId}
        currentBytes={0}
        status={extraction.error ? 'error' : extraction.done ? 'done' : 'active'}
        errorMessage={extraction.error}
        formatCaption={() =>
          !extraction.progress
            ? 'Starting…'
            : extraction.progress.phase === 'creating'
              ? 'Creating the intermediate container…'
              : extraction.progress.phase === 'copying'
                ? 'Copying the filesystem out…'
                : 'Indexing the filesystem…'
        }
        onCancel={cancelExtraction}
        onClose={closeProgressDialog}
      />
    </Modal>
  );
}
