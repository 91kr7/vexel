import { useEffect, useState } from 'react';
import {
  BandStack,
  Button,
  ConfirmDialog,
  DefinitionList,
  EmptyState,
  FieldMessage,
  HexDumpViewer,
  Modal,
  Row,
  SegmentedControl,
  Spinner,
  SplitPane,
  Stack,
  StatusPill,
  StreamSearchField,
  TextViewer,
  TransferProgressDialog,
  TreeView,
  triggerDownload,
  useToast,
  type TreeNode,
} from '../ui';
import type { ImageSummary } from '../data/images-client';
import {
  fetchSubtreeExportSummary,
  imageFilesystemEntryDownloadUrl,
  imageFilesystemStreamUrl,
  imageFilesystemSubtreeDownloadUrl,
  type FilesystemContentMode,
  type FilesystemEntry,
} from '../data/image-filesystem-client';
import { useImageFilesystemExtraction } from '../data/use-image-filesystem-extraction';
import { useImageFilesystemEntryContent, useImageFilesystemEntryMetadata } from '../data/use-image-filesystem-entry';
import { useImageFilesystemKeptResult } from '../data/use-image-filesystem-kept-result';
import { useImageFilesystemSearch } from '../data/use-image-filesystem-search';
import { useImageFilesystemTree } from '../data/use-image-filesystem-tree';
import { useFailureReport } from '../shell/services/use-failure-report';
import { FailedReadEmptyState } from '../shell/FailedReadEmptyState';

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
 * Filesystem browser for one image (REQ-52–62, REQ-113), in two shapes decided
 * before anything is raised: with nothing kept for the image's content, the
 * cost warning is the first thing on screen and confirming it runs a
 * cancellable extraction (a container created from the image and never
 * started, its filesystem copied out and removed again); with a result still
 * kept, the tree is on screen directly — no warning about a cost that will not
 * be paid, and no progress dialog for an operation that never runs. Either way
 * the merged filesystem is a lazily expanded, searchable tree with a metadata
 * and content-preview panel and single-file/subtree download — identically for
 * a distroless/scratch image since nothing from it is ever executed.
 */
export function FilesystemBrowser({ image, open, onClose }: FilesystemBrowserProps) {
  const [warningOpen, setWarningOpen] = useState(false);
  const [pendingForce, setPendingForce] = useState(false);
  const [extractionUrl, setExtractionUrl] = useState<string | undefined>(undefined);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [shapeDecided, setShapeDecided] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [modeOverride, setModeOverride] = useState<FilesystemContentMode | undefined>(undefined);
  const [subtreeExportBusy, setSubtreeExportBusy] = useState(false);

  const kept = useImageFilesystemKeptResult(open ? image.id : undefined);
  const extraction = useImageFilesystemExtraction(extractionUrl);

  useFailureReport('Could not extract the filesystem', extraction.error);
  const tree = useImageFilesystemTree(image.id);
  const toast = useToast();

  // One result feeds the whole extracted view, whether it was just extracted or
  // was already kept: the two shapes differ in what is raised on the way in, not
  // in what the operator ends up browsing.
  const result = extraction.result ?? kept.summary;

  const search = useImageFilesystemSearch(result ? image.id : undefined);
  const metadataState = useImageFilesystemEntryMetadata(result ? image.id : undefined, selectedId);

  useFailureReport('Could not read this entry', metadataState.error);

  const contentState = useImageFilesystemEntryContent(
    result && metadataState.metadata?.kind === 'file' ? image.id : undefined,
    metadataState.metadata?.kind === 'file' ? selectedId : undefined,
    modeOverride,
  );

  const rootEntries = tree.childrenByPath.get(ROOT_PATH);
  if (result && rootEntries === undefined && !tree.loadingPaths.has(ROOT_PATH)) tree.loadChildren(ROOT_PATH);

  const childrenById = new Map<string, TreeNode[]>();
  for (const [path, entries] of tree.childrenByPath) {
    if (path !== ROOT_PATH) childrenById.set(path, entries.map(toTreeNode));
  }
  const rootNodes = (rootEntries ?? []).map(toTreeNode);
  const loadingIds = new Set(Array.from(tree.loadingPaths).filter((path) => path !== ROOT_PATH));
  const matchedIds = new Set(search.matches.map((match) => match.path));

  // A fresh selection previews the auto-detected mode again, not a stale override from a previous file.
  useEffect(() => {
    setModeOverride(undefined);
  }, [selectedId]);

  // Reveals a search match's ancestor directories, loading whichever levels are not loaded yet (REQ-60).
  useEffect(() => {
    const match = search.matches[search.activeMatchIndex];
    if (!match) return;
    setSelectedId(match.path);
    const segments = match.parentPath === '' ? [] : match.parentPath.split('/');
    let current = '';
    const ancestors: string[] = [];
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      ancestors.push(current);
    }
    setExpandedIds((prev) => {
      const next = new Set(prev);
      ancestors.forEach((id) => next.add(id));
      return next;
    });
    ancestors.forEach((id) => {
      if (!tree.childrenByPath.has(id) && !tree.loadingPaths.has(id)) tree.loadChildren(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.activeMatchIndex, search.matches]);

  function openWarning(force: boolean) {
    setPendingForce(force);
    setWarningOpen(true);
  }

  // The shape, decided on the free read alone and never by starting the work
  // and hiding the surfaces afterwards: nothing kept for this image's content
  // raises the cost warning at once, a kept result raises nothing at all.
  useEffect(() => {
    if (shapeDecided || !kept.answered) return;
    setShapeDecided(true);
    if (!kept.summary) openWarning(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeDecided, kept.answered, kept.summary]);

  // A result answered as kept can stop being kept between that answer and the
  // read of its tree (kept results are operator-clearable): the flow then
  // degrades to the cost warning, never to a dead end (filesystem_browse_direct/REQ-14).
  const rootReadFailed = tree.errorsByPath.has(ROOT_PATH);
  useEffect(() => {
    if (!rootReadFailed || extraction.result || !kept.summary) return;
    kept.discard();
    tree.reset();
    openWarning(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootReadFailed, extraction.result, kept.summary]);

  function startExtraction() {
    setWarningOpen(false);
    setProgressDialogOpen(true);
    // The kept result is superseded by the run about to replace it, so nothing
    // of it is shown against the fresh one.
    kept.discard();
    tree.reset();
    setExpandedIds(new Set());
    setSelectedId(undefined);
    setExtractionUrl(imageFilesystemStreamUrl(image.id, pendingForce));
  }

  /** Declining leaves nothing open (filesystem_browse_direct/REQ-7) — unless there is a result behind the warning, i.e. a declined re-extraction, which simply goes back to it (filesystem_browse_direct/REQ-10). */
  function declineWarning() {
    setWarningOpen(false);
    if (!result) onClose();
  }

  /** Cancelling genuinely stops the work and leaves nothing behind (REQ-54, REQ-55): the intermediate container is still removed server-side, and the operator is back on the images list (filesystem_browse_direct/REQ-8). */
  function cancelExtraction() {
    setProgressDialogOpen(false);
    setExtractionUrl(undefined);
    if (!result) onClose();
  }

  /** Dismissing the report of a failure leaves the operator on the images list, not in an empty surface (filesystem_browse_direct/REQ-9). */
  function closeProgressDialog() {
    setProgressDialogOpen(false);
    if (!extraction.error) return;
    setExtractionUrl(undefined);
    if (!result) onClose();
  }

  /** The retry offered inside the failure report (filesystem_browse_direct/REQ-9): the cost is announced again before anything actually starts (filesystem_browse_direct/REQ-18). */
  function retryExtraction() {
    setProgressDialogOpen(false);
    setExtractionUrl(undefined);
    openWarning(pendingForce);
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

  function downloadFile(path: string) {
    triggerDownload(imageFilesystemEntryDownloadUrl(image.id, path));
  }

  /** Previews what the subtree archive would contain (REQ-61) before triggering the actual browser download. */
  async function downloadSubtree(path: string) {
    setSubtreeExportBusy(true);
    try {
      const summary = await fetchSubtreeExportSummary(image.id, path);
      const refusedNote = summary.refusals.length > 0 ? ` — ${summary.refusals.length} entr${summary.refusals.length === 1 ? 'y' : 'ies'} skipped` : '';
      toast.push({
        title: 'Archive ready',
        message: `${summary.fileCount} file${summary.fileCount === 1 ? '' : 's'}, ${formatBytes(summary.totalBytes)}${refusedNote}`,
        tone: summary.refusals.length > 0 ? 'neutral' : 'success',
      });
      triggerDownload(imageFilesystemSubtreeDownloadUrl(image.id, path));
    } catch (cause) {
      toast.push({ title: 'Could not prepare the archive', message: (cause as Error).message, tone: 'danger' });
    } finally {
      setSubtreeExportBusy(false);
    }
  }

  return (
    <Modal open={open} title={`Filesystem — ${image.tags[0] ?? image.shortId}`} onClose={onClose} size="large">
      {/*
        While the shape is still being decided the operator is asked for nothing (filesystem_browse_direct/REQ-6): a plain
        indication naming the image, with nothing to press behind it — never a prompt, never a
        button, never an empty state.
      */}
      {!result && kept.loading ? <Spinner label={`Opening the filesystem of ${image.tags[0] ?? image.shortId}`} /> : null}

      {result ? (
        /*
          The interior distributes its height by intent: every band above states something and
          takes the height of its own content, and the tree-and-detail region is the single one
          that absorbs whatever is left. No height, no length and no style is stated here — the
          region's bound comes from the dialog through the arrangement, which is why the two pixel
          constants that used to cap the pane and the tree are gone rather than reduced — a smaller
          one would have been the same defect at another number
          (filesystem_browser_layout/REQ-2, REQ-21, REQ-22).
        */
        <BandStack
          bands={[
            <Row key="status" justify="between" align="center">
              <StatusPill
                tone={result.fromCache ? 'neutral' : 'success'}
                action={{ label: 'Re-extract…', onClick: () => openWarning(true) }}
              >
                {result.fromCache ? 'From cache' : 'Freshly extracted'} · {result.entryCount} entries
              </StatusPill>
              <Button variant="secondary" disabled={subtreeExportBusy} onClick={() => downloadSubtree(ROOT_PATH)}>
                Download whole filesystem…
              </Button>
            </Row>,
            <FieldMessage key="scaffolding" tone="muted">
              Includes container-creation scaffolding (e.g. .dockerenv, dev/, etc/hostname, proc/, sys/) written by Docker itself,
              not necessarily shipped by the image.
            </FieldMessage>,
            result.refusedCount > 0 ? (
              <FieldMessage key="refused" tone="danger">
                {result.refusedCount} entr{result.refusedCount === 1 ? 'y was' : 'ies were'} refused because
                {result.refusedCount === 1 ? ' it attempted' : ' they attempted'} to leave the extracted tree (an absolute path, a
                "../" segment, or a symlink target escaping it) and never entered the browsed filesystem.
              </FieldMessage>
            ) : null,
            <StreamSearchField
              key="search"
              value={search.query}
              onChange={search.setQuery}
              matchCount={search.matches.length}
              activeMatchIndex={search.activeMatchIndex}
              onNext={search.next}
              onPrevious={search.previous}
              placeholder="Search files by name or path…"
            />,
            search.truncated ? (
              <FieldMessage key="truncated" tone="muted">
                Showing the first {search.matches.length} of {search.totalMatches} matches.
              </FieldMessage>
            ) : null,
          ]}
          fill={
            <SplitPane
              fill
              start={
                <TreeView
                  rootNodes={rootNodes}
                  childrenById={childrenById}
                  loadingIds={loadingIds}
                  expandedIds={expandedIds}
                  onToggleExpand={toggleExpand}
                  selectedId={selectedId}
                  onSelect={(node) => setSelectedId(node.id)}
                  matchedIds={matchedIds}
                  fill
                  emptyState={<EmptyState title="Empty filesystem"  description={null} action={null} />}
                />
              }
              end={
                selectedId === undefined ? (
                  <EmptyState compact title="No entry selected" description="Select a file, directory or symlink to see its details."  action={null} />
                ) : metadataState.loading ? (
                  <Spinner label="Loading entry metadata" />
                ) : metadataState.error ? (
                  <FailedReadEmptyState compact />
                ) : metadataState.metadata ? (
                  <Stack gap="var(--space-4)">
                    <DefinitionList
                      items={[
                        { label: 'Path', value: `/${metadataState.metadata.path}` },
                        { label: 'Type', value: metadataState.metadata.kind },
                        { label: 'Size', value: metadataState.metadata.sizeBytes !== undefined ? formatBytes(metadataState.metadata.sizeBytes) : '–' },
                        { label: 'Permissions', value: metadataState.metadata.permissions ?? '–' },
                        { label: 'Owner (uid:gid)', value: metadataState.metadata.uid !== undefined ? `${metadataState.metadata.uid}:${metadataState.metadata.gid}` : '–' },
                        { label: 'Modified', value: metadataState.metadata.modifiedAt ? new Date(metadataState.metadata.modifiedAt).toLocaleString() : '–' },
                        ...(metadataState.metadata.kind === 'symlink' ? [{ label: 'Link target', value: metadataState.metadata.linkTarget ?? '–' }] : []),
                      ]}
                    />

                    {metadataState.metadata.kind === 'directory' ? (
                      <Button variant="secondary" disabled={subtreeExportBusy} onClick={() => downloadSubtree(metadataState.metadata!.path)}>
                        Download this folder…
                      </Button>
                    ) : null}

                    {metadataState.metadata.kind === 'file' ? (
                      <Stack gap="var(--space-2)">
                        <Row justify="between" align="center">
                          <SegmentedControl
                            options={[{ id: 'text', label: 'Text' }, { id: 'hex', label: 'Hex' }]}
                            selectedIds={[modeOverride ?? contentState.content?.autoMode ?? 'text']}
                            onChange={(ids) => setModeOverride(ids[0] as FilesystemContentMode)}
                            ariaLabel="Preview mode"
                          />
                          <Button onClick={() => downloadFile(metadataState.metadata!.path)}>Download</Button>
                        </Row>
                        {contentState.loading ? (
                          <Spinner label="Loading content" />
                        ) : contentState.error ? (
                          <FieldMessage tone="muted">{contentState.error}</FieldMessage>
                        ) : contentState.content ? (
                          contentState.content.mode === 'text' ? (
                            <TextViewer content={contentState.content.content} truncated={contentState.content.truncated} totalSizeBytes={contentState.content.totalSizeBytes} />
                          ) : (
                            <HexDumpViewer content={contentState.content.content} truncated={contentState.content.truncated} totalSizeBytes={contentState.content.totalSizeBytes} />
                          )
                        ) : null}
                      </Stack>
                    ) : null}
                  </Stack>
                ) : null
              }
            />
          }
        />
      ) : null}

      <ConfirmDialog
        open={warningOpen}
        targetName={image.tags[0] ?? image.shortId}
        consequence={`Extracting the filesystem creates a container from the image (never started) and copies out about ${formatBytes(image.sizeBytes)}, taking roughly ${estimateExtractionSeconds(image.sizeBytes)}s${image.sizeBytes > LARGE_IMAGE_THRESHOLD_BYTES ? ' or more' : ''}.`}
        confirmLabel="Extract"
        destructive={false}
        onConfirm={startExtraction}
        onCancel={declineWarning}
      />

      <TransferProgressDialog
        open={progressDialogOpen}
        title="Extracting the filesystem"
        description={image.tags[0] ?? image.shortId}
        currentBytes={0}
        status={extraction.error ? 'error' : extraction.done ? 'done' : 'active'}
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
        onRetry={retryExtraction}
        autoCloseOnDone
      />
    </Modal>
  );
}
