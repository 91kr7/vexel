import { useCallback, useEffect, useState } from 'react';
import {
  ActionButtonGroup,
  BulkActionBar,
  Card,
  DataTable,
  EmptyState,
  FilePicker,
  FormDialog,
  IdentifierCell,
  MetaCell,
  ScreenToolbar,
  SearchField,
  Select,
  Stack,
  StatusDotCell,
  StepProgressList,
  TextField,
  TransferProgressDialog,
  TwoLineCell,
  triggerDownload,
  useToast,
  type DataTableColumn,
  type MenuEntry,
  type ProgressStep,
} from '../ui';
import {
  IMAGE_LOAD_URL,
  imagePullStreamUrl,
  imagePushStreamUrl,
  pruneDanglingImages,
  removeImage,
  saveImagesUrl,
  tagImage,
  untagImage,
  type ImageSaveLoadResult,
  type ImageSummary,
} from '../data/images-client';
import { useFileUpload, useImageTransferStream } from '../data/use-image-transfer';
import { containerImportUploadUrl, type ContainerImportResult } from '../data/container-transfer-client';
import { ContainerCreateForm } from '../containers/ContainerCreateForm';
import { FilesystemBrowser } from './FilesystemBrowser';
import { ImageDetailPanel } from './ImageDetailPanel';
import { ImageDiffView } from './ImageDiffView';
import { LayerEfficiencyView } from './LayerEfficiencyView';
import { LayerExplorer } from './LayerExplorer';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useCrossNavigation } from '../shell/services/CrossNavigationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useFailureReport } from '../shell/services/use-failure-report';
import { FailedReadEmptyState } from '../shell/FailedReadEmptyState';
import { useProgress } from '../shell/services/ProgressService';

const NO_TAGS_TO_UNTAG_REASON = 'This image has no tags to untag.';
const NO_TAGS_TO_PUSH_REASON = 'This image has no tags to push.';
/**
 * Deliberately a fact about the *list*, not about the row's own image: the
 * entry greys out because an unrelated image was removed, and a reason phrased
 * like `Untag`'s or `Push…`'s would read as a fault of this image.
 */
const NO_SECOND_IMAGE_REASON = 'There is no second image in the list to compare with.';

/**
 * Which of an image's four analysis views is on screen, and the image it was
 * opened on. One piece of state rather than four flags: at most one is ever
 * open, and each is bound to the image whose row menu opened it — never to the
 * selection, and never to whatever image an open detail panel is showing.
 */
interface OpenImageFlow {
  kind: 'layers' | 'signals' | 'filesystem' | 'diff';
  imageId: string;
  /** The layer the explorer opens at (a signals finding, or a build-cache cross-reference). */
  layerIndex?: number;
  /** Starts the layer's changeset analysis without the cost warning — set only where the caller knows it is already cached. */
  autoAnalyze?: boolean;
  /** The comparison's second operand, supplied by the two-row bulk path alone. */
  compareWithId?: string;
}

export interface ImagesScreenProps {
  images: ImageSummary[];
  loaded: boolean;
  error?: string;
  onRefresh: () => void;
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

function formatAge(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

function displayTitle(image: ImageSummary): string {
  return image.tags.length > 0 ? image.tags.join(', ') : `<none> (${image.shortId})`;
}

/**
 * The row's one reference line: every tag the image carries, stated once
 * (REQ-57). The delivered row printed the first tag here and the whole tag list
 * again as pills in a column beside it — the identical string on every
 * single-tagged image, which is every row on an ordinary daemon. A dangling
 * image has no reference at all; the leading status dot is what says so.
 */
function referenceLine(image: ImageSummary): string {
  return image.tags.length > 0 ? image.tags.join(', ') : '<none>';
}

/**
 * The repository digest, and only when it is one (REQ-58). Two things make the
 * column repeat another field otherwise: an image with no `RepoDigests` at all,
 * where the delivered code fell back to the image id, and a containerd-backed
 * image store, where the daemon reports the *same* digest as `Id` and as
 * `RepoDigests[0]` (measured on this daemon, 2026-08-15: `alpine:3.20`
 * `sha256:d9e853e87e55…` under both). The row already states that value as the
 * short id under the reference, so what is missing here is stated as missing.
 */
function repositoryDigest(image: ImageSummary): string | undefined {
  return image.digest !== undefined && image.digest !== image.shortId ? image.digest : undefined;
}

function matchesSearch(image: ImageSummary, term: string): boolean {
  if (!term.trim()) return true;
  const needle = term.trim().toLowerCase();
  return (
    image.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
    (image.digest ?? '').toLowerCase().includes(needle) ||
    image.id.toLowerCase().includes(needle)
  );
}

function stepStatus(step: { status: string }): ProgressStep['status'] {
  const normalized = step.status.toLowerCase();
  if (normalized.includes('complete') || normalized.includes('exists') || normalized.startsWith('status:')) return 'done';
  return 'active';
}

/**
 * Images screen (REQ-37–42): toolbar with pull, load tarball and
 * prune-dangling, a searchable table of local images with multi-select,
 * per-image tag/untag/push/save/remove actions with destructive confirmation
 * for remove, save-to-tarball (a browser download) for one or several
 * selected images, an inspect surface with the raw payload, and the image's
 * four analysis views — the layer explorer, the efficiency and signals view,
 * the filesystem browser and the comparison — opened from the row's menu and
 * presented here rather than by the panel, so none of them needs one open.
 */
export function ImagesScreen({ images, loaded, error, onRefresh }: ImagesScreenProps) {
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();
  const { request, consumeRequest } = useCrossNavigation();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [flow, setFlow] = useState<OpenImageFlow | undefined>(undefined);
  /**
   * The last findings map the efficiency and signals view reported, kept with
   * the image it was computed for so the layer explorer marks the layers
   * carrying findings for that image alone (REQ-65, REQ-67).
   */
  const [findings, setFindings] = useState<{ imageId: string; layers: Map<number, number> } | undefined>(undefined);

  const [pullOpen, setPullOpen] = useState(false);
  const [pullReference, setPullReference] = useState('');
  const [pullPlatform, setPullPlatform] = useState('');
  const [pullStreamUrl, setPullStreamUrl] = useState<string | undefined>(undefined);

  const [tagTarget, setTagTarget] = useState<ImageSummary | null>(null);
  const [tagReference, setTagReference] = useState('');
  const [tagSaving, setTagSaving] = useState(false);

  const [untagTarget, setUntagTarget] = useState<ImageSummary | null>(null);
  const [untagReference, setUntagReference] = useState('');

  const [runReference, setRunReference] = useState<string | undefined>(undefined);

  const [pushTarget, setPushTarget] = useState<ImageSummary | null>(null);
  const [pushReference, setPushReference] = useState('');
  const [pushStreamUrl, setPushStreamUrl] = useState<string | undefined>(undefined);

  const [loadOpen, setLoadOpen] = useState(false);
  const [loadFile, setLoadFile] = useState<File | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTargetReference, setImportTargetReference] = useState('');

  const pullTransfer = useImageTransferStream(pullStreamUrl);
  const pushTransfer = useImageTransferStream(pushStreamUrl);
  const loadUpload = useFileUpload<ImageSaveLoadResult>();
  const importUpload = useFileUpload<ContainerImportResult>();

  useFailureReport('Could not pull the image', pullTransfer.error);
  useFailureReport('Could not push the image', pushTransfer.error);
  useFailureReport('Could not load the tarball', loadUpload.error);
  useFailureReport('Could not import the filesystem tarball', importUpload.error);

  const closePullDialog = useCallback(() => {
    setPullOpen(false);
    setPullStreamUrl(undefined);
    onRefresh();
  }, [onRefresh]);

  const closePushDialog = useCallback(() => {
    setPushTarget(null);
    setPushStreamUrl(undefined);
    onRefresh();
  }, [onRefresh]);

  // A completed transfer (no error) closes its dialog and refreshes the list
  // on its own — the operator does not have to dismiss it by hand.
  useEffect(() => {
    if (pullStreamUrl && pullTransfer.done && !pullTransfer.error) closePullDialog();
  }, [pullStreamUrl, pullTransfer.done, pullTransfer.error, closePullDialog]);

  useEffect(() => {
    if (pushStreamUrl && pushTransfer.done && !pushTransfer.error) closePushDialog();
  }, [pushStreamUrl, pushTransfer.done, pushTransfer.error, closePushDialog]);

  // A cross-reference followed from a build-cache record arrives here naming an
  // image and one of its layers (REQ-69): select the image — its panel opens as
  // it always did, this route being a different door from the row's menu — and
  // open the layer explorer on it at the named layer, on arrival and again on
  // every later request. Changesets stay behind their cost warning: nothing
  // here says they are already cached.
  useEffect(() => {
    if (request?.screenId !== 'images-layers' || !request.objectId) return;
    setSelectedId(request.objectId);
    setFlow({ kind: 'layers', imageId: request.objectId, layerIndex: request.position, autoAnalyze: false });
    consumeRequest();
  }, [request, consumeRequest]);

  /**
   * The selection does not outlive its image. Compared against the unfiltered
   * list on purpose: an image merely hidden by the search has not left the list
   * and keeps both its selection and its panel, which come back together when
   * the search is cleared. An image that is gone from the daemon — removed from
   * its own row's menu, pruned, or removed from the operator's terminal — takes
   * the selection with it, because an image id is a digest of its content, so
   * pulling or building the same content again reproduces the id and a selection
   * that outlived the removal would open the panel unasked. A list that has not
   * been read yet says nothing about either, so nothing is cleared before it is:
   * a cross-navigation (REQ-69) selects its image on arrival, possibly ahead of
   * the first read.
   */
  useEffect(() => {
    if (loaded && selectedId && !images.some((image) => image.id === selectedId)) setSelectedId(undefined);
  }, [images, loaded, selectedId]);

  /**
   * None of the four views outlives its image. It used to be free: the four
   * were rendered by the detail panel, which is the table's expanded region
   * under a row that stops existing. Hosted by the screen they are not, and a
   * view left standing keeps showing an image the daemon no longer has — from
   * its own menu's `Remove`, from a prune, or from a `docker rmi` elsewhere on
   * the machine. Compared against the unfiltered list and only once it has been
   * read, exactly as the selection above: an image hidden by the search has not
   * left the list, and a list not yet read says nothing about either.
   */
  useEffect(() => {
    if (loaded && flow && !images.some((image) => image.id === flow.imageId)) setFlow(undefined);
  }, [images, loaded, flow]);

  /**
   * The row is the panel's only pointer route now that the panel has no close
   * control: selecting the selected row closes it, selecting another one leaves
   * it open and re-points it at that image.
   */
  function toggleSelection(image: ImageSummary) {
    setSelectedId((current) => (current === image.id ? undefined : image.id));
  }

  /**
   * Opens one of the image's four analysis views on the image whose row menu
   * was used. It touches neither the selection nor the panel: with none open,
   * none appears; with one open on another image, it stays open on that other
   * image and this view is still the invoked row's.
   */
  function openImageFlow(kind: OpenImageFlow['kind'], image: ImageSummary) {
    setFlow({ kind, imageId: image.id });
  }

  const closeImageFlow = useCallback(() => setFlow(undefined), []);

  /** A signals finding closes the signals view and opens the layer explorer at the layer it concerns, already cached so analysis starts without the cost warning (REQ-65, REQ-67). */
  const navigateToLayer = useCallback((layerIndex: number) => {
    setFlow((current) => (current ? { kind: 'layers', imageId: current.imageId, layerIndex, autoAnalyze: true } : current));
  }, []);

  function openPullDialog() {
    setPullReference('');
    setPullPlatform('');
    setPullStreamUrl(undefined);
    setPullOpen(true);
  }

  function startPull() {
    if (!pullReference.trim()) return;
    setPullStreamUrl(imagePullStreamUrl(pullReference.trim(), pullPlatform.trim() || undefined));
  }

  function openTagDialog(image: ImageSummary) {
    setTagTarget(image);
    setTagReference(image.tags[0] ?? '');
  }

  async function submitTag() {
    if (!tagTarget || !tagReference.trim()) return;
    setTagSaving(true);
    try {
      await run(`Tag ${displayTitle(tagTarget)}`, () => tagImage(tagTarget.id, tagReference.trim()));
      push({ title: 'Image tagged', message: tagReference.trim(), tone: 'success' });
      setTagTarget(null);
      onRefresh();
    } catch (cause) {
      reportError(`Could not tag ${displayTitle(tagTarget)}`, (cause as Error).message);
    } finally {
      setTagSaving(false);
    }
  }

  async function handleUntag(reference: string) {
    try {
      await run(`Untag ${reference}`, () => untagImage(reference));
      onRefresh();
    } catch (cause) {
      reportError(`Could not untag ${reference}`, (cause as Error).message);
    }
  }

  /**
   * One tag untags straight away; several tags need the operator to say which
   * reference to drop, so the choice moves to a dialog rather than to one entry
   * per tag (the row's menu holds a fixed set of entries).
   */
  function startUntag(image: ImageSummary) {
    if (image.tags.length === 1) {
      void handleUntag(image.tags[0]);
      return;
    }
    setUntagTarget(image);
    setUntagReference(image.tags[0] ?? '');
  }

  async function submitUntag() {
    if (!untagTarget || !untagReference) return;
    const reference = untagReference;
    setUntagTarget(null);
    await handleUntag(reference);
  }

  function openPushDialog(image: ImageSummary) {
    setPushTarget(image);
    setPushReference(image.tags[0] ?? '');
    setPushStreamUrl(undefined);
  }

  function startPush() {
    if (!pushTarget || !pushReference.trim()) return;
    setPushStreamUrl(imagePushStreamUrl(pushTarget.id, pushReference.trim()));
  }

  async function handleRemove(image: ImageSummary) {
    const confirmed = await confirm({
      targetName: displayTitle(image),
      consequence: 'This will permanently remove the image.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    try {
      await run(`Remove ${displayTitle(image)}`, () => removeImage(image.id));
      onRefresh();
    } catch (cause) {
      reportError(`Could not remove ${displayTitle(image)}`, (cause as Error).message);
    }
  }

  /** Downloads a tarball of `references` straight to the operator's own machine (REQ-42): the browser owns the transfer, so the app only announces it. */
  function startSave(references: string[]) {
    if (references.length === 0) return;
    const filename = references.length === 1 ? `${references[0]}.tar` : `${references.length}-images.tar`;
    triggerDownload(saveImagesUrl(references, filename));
    push({ title: 'Download started', message: filename, tone: 'success' });
  }

  function openLoadDialog() {
    setLoadFile(null);
    loadUpload.reset();
    setLoadOpen(true);
  }

  function startLoad() {
    if (!loadFile) return;
    setLoadOpen(false);
    loadUpload.start(IMAGE_LOAD_URL, loadFile);
  }

  function closeLoadTransfer() {
    const wasDone = loadUpload.status === 'done';
    loadUpload.reset();
    if (wasDone) onRefresh();
  }

  function openImportDialog() {
    setImportFile(null);
    setImportTargetReference('');
    importUpload.reset();
    setImportOpen(true);
  }

  function startImport() {
    if (!importFile) return;
    setImportOpen(false);
    importUpload.start(containerImportUploadUrl(importTargetReference.trim() || undefined), importFile);
  }

  function closeImportTransfer() {
    const wasDone = importUpload.status === 'done';
    importUpload.reset();
    if (wasDone) onRefresh();
  }

  function toggleSelectImage(image: ImageSummary) {
    setSelectedIds((current) => (current.includes(image.id) ? current.filter((id) => id !== image.id) : [...current, image.id]));
  }

  /** Starts a comparison from a two-image bulk selection (REQ-63): the one comparison view, opened with both operands rather than one. */
  function startCompareSelected() {
    if (selectedIds.length !== 2) return;
    setFlow({ kind: 'diff', imageId: selectedIds[0], compareWithId: selectedIds[1] });
    setSelectedIds([]);
  }

  async function handlePruneDangling() {
    const confirmed = await confirm({
      targetName: 'dangling images',
      consequence: 'This will permanently remove every untagged image.',
      confirmLabel: 'Prune dangling',
    });
    if (!confirmed) return;
    try {
      const result = await run('Prune dangling images', () => pruneDanglingImages());
      push({
        title: `${result.removedCount} image${result.removedCount === 1 ? '' : 's'} removed`,
        message: `${formatBytes(result.reclaimedBytes)} reclaimed`,
        tone: 'success',
      });
      onRefresh();
    } catch (cause) {
      reportError('Could not prune dangling images', (cause as Error).message);
    }
  }

  /**
   * Every action of a row, behind its overflow control: the same ten entries in
   * the same order on every image whatever its tags, an inapplicable one
   * disabled with its reason rather than removed. Three groups, marked by
   * separation and tone alone — the image's four analyses, then the operations
   * on it, then `Remove`, destructive and set apart. The ellipsis marks what
   * asks for something before anything happens: the four views, `Run…`, `Tag…`
   * and `Push…`; `Untag` on a single-tag image, `Save` and `Remove` act at once
   * or only confirm. The handlers are bound to this image, so a list that
   * re-sorts or re-reads under an open menu can never redirect an entry at
   * another one. `Compare with…` is the one arrival that can be unavailable,
   * and on a condition of the list rather than of this image; it follows the
   * live list, the entries being rebuilt on every render.
   */
  function overflowEntriesFor(image: ImageSummary): MenuEntry[] {
    const tagless = image.tags.length === 0;
    const noSecondImage = images.length < 2;
    return [
      { id: 'layers', label: 'Explore layers…', onSelect: () => openImageFlow('layers', image) },
      { id: 'signals', label: 'Efficiency & signals…', onSelect: () => openImageFlow('signals', image) },
      { id: 'filesystem', label: 'Browse filesystem…', onSelect: () => openImageFlow('filesystem', image) },
      {
        id: 'compare',
        label: 'Compare with…',
        disabled: noSecondImage,
        disabledReason: noSecondImage ? NO_SECOND_IMAGE_REASON : undefined,
        onSelect: () => openImageFlow('diff', image),
      },
      { id: 'run', label: 'Run…', separated: true, onSelect: () => setRunReference(image.tags[0] ?? image.shortId) },
      { id: 'tag', label: 'Tag…', onSelect: () => openTagDialog(image) },
      { id: 'untag', label: 'Untag', disabled: tagless, disabledReason: tagless ? NO_TAGS_TO_UNTAG_REASON : undefined, onSelect: () => startUntag(image) },
      { id: 'push', label: 'Push…', disabled: tagless, disabledReason: tagless ? NO_TAGS_TO_PUSH_REASON : undefined, onSelect: () => openPushDialog(image) },
      { id: 'save', label: 'Save', onSelect: () => startSave([image.tags[0] ?? image.id]) },
      { id: 'remove', label: 'Remove', hint: 'rmi', destructive: true, separated: true, onSelect: () => handleRemove(image) },
    ];
  }

  const columns: DataTableColumn<ImageSummary>[] = [
    {
      id: 'status',
      header: '',
      width: '20px',
      render: (image) => <StatusDotCell tone={image.tags.length > 0 ? 'success' : 'warning'} />,
    },
    {
      id: 'repository',
      // The width the tag pills held comes back to the reference itself, which
      // now carries every tag of a multi-tagged image instead of the first one.
      header: 'REPOSITORY:TAG',
      width: '2.4fr',
      render: (image) => <TwoLineCell title={referenceLine(image)} subtitle={image.shortId} />,
    },
    { id: 'digest', header: 'DIGEST', width: '1fr', render: (image) => <IdentifierCell value={repositoryDigest(image)} maxChars={19} /> },
    {
      id: 'platform',
      header: 'PLATFORM',
      width: '1fr',
      render: (image) => <MetaCell>{image.platforms.length > 0 ? image.platforms.join(', ') : undefined}</MetaCell>,
    },
    {
      id: 'size',
      // What the *listing* reports (`GET /images/json` → `Size`): on a
      // containerd-backed daemon the image's content plus its unpacked
      // snapshots, which is why it is larger than the panel's `Content size`
      // (`GET /images/{id}/json` → `Size`). Measured on this daemon, 2026-08-15,
      // `alpine:3.20`: 13,660,215 here, 4,103,199 in the panel, the difference
      // being the 9,486,336-byte unpacked layer its own history reports. Two
      // measurements, so two names — never one word over two numbers (REQ-59).
      header: 'DISK USAGE',
      align: 'end',
      width: '0.8fr',
      render: (image) => <MetaCell>{formatBytes(image.sizeBytes)}</MetaCell>,
    },
    { id: 'created', header: 'CREATED', width: '1fr', render: (image) => <MetaCell>{formatAge(image.createdAt)}</MetaCell> },
    {
      id: 'actions',
      header: 'ACTIONS',
      // The column holds the overflow control and nothing else, so it is sized
      // for that one trigger: the width the six buttons held goes to the data
      // columns beside it.
      width: 'var(--data-table-menu-action-column-width)',
      render: (image) => <ActionButtonGroup actions={[]} overflow={{ label: `More actions for ${displayTitle(image)}`, entries: overflowEntriesFor(image) }} />,
    },
  ];

  const filtered = images.filter((image) => matchesSearch(image, search));
  const hasDangling = images.some((image) => image.tags.length === 0);
  // Resolved from the live list by id, never captured when the menu entry was
  // chosen: a re-sort or a re-read cannot re-point an open view at another
  // image, and the search — which the flow does not follow — cannot hide it.
  const flowImage = flow ? images.find((image) => image.id === flow.imageId) : undefined;

  const pullSteps: ProgressStep[] = pullTransfer.steps.map((step) => ({
    id: step.id,
    label: step.id === 'overall' ? step.status : `${step.id} — ${step.status}`,
    status: pullTransfer.error ? 'error' : pullTransfer.done ? 'done' : stepStatus(step),
    percent: step.totalBytes ? Math.round(((step.currentBytes ?? 0) / step.totalBytes) * 100) : undefined,
  }));

  const pushSteps: ProgressStep[] = pushTransfer.steps.map((step) => ({
    id: step.id,
    label: step.id === 'overall' ? step.status : `${step.id} — ${step.status}`,
    status: pushTransfer.error ? 'error' : pushTransfer.done ? 'done' : stepStatus(step),
    percent: step.totalBytes ? Math.round(((step.currentBytes ?? 0) / step.totalBytes) * 100) : undefined,
  }));

  const selectedImages = images.filter((image) => selectedIds.includes(image.id));

  return (
    <Stack gap="var(--space-4)">
      <ScreenToolbar
        primaryAction={{ label: 'Pull image…', onClick: openPullDialog }}
        secondaryActions={[
          { label: 'Load tarball…', onClick: openLoadDialog },
          { label: 'Import filesystem…', onClick: openImportDialog },
        ]}
        destructiveAction={{ label: 'Prune dangling', onClick: handlePruneDangling, disabled: !hasDangling }}
        filters={<SearchField value={search} onChange={setSearch} placeholder="Search reference or digest…" />}
      />
      <BulkActionBar
        count={selectedIds.length}
        actions={[
          {
            id: 'save',
            label: 'Save to tarball…',
            onClick: () => {
              startSave(selectedImages.map((image) => image.tags[0] ?? image.id));
              setSelectedIds([]);
            },
          },
          {
            id: 'compare',
            label: 'Compare filesystems…',
            onClick: startCompareSelected,
            disabled: selectedIds.length !== 2,
          },
        ]}
        onClear={() => setSelectedIds([])}
      />
      <Card padding="none">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(image) => image.id}
          maxHeight="60vh"
          selectedRowKey={selectedId}
          onRowSelect={toggleSelection}
          expandedRowKey={selectedId}
          renderExpanded={(image) => <ImageDetailPanel image={image} onClose={() => setSelectedId(undefined)} />}
          emptyState={
            error && images.length === 0 ? (
              <FailedReadEmptyState />
            ) : (
              <EmptyState title={loaded ? 'No images match' : 'Loading images…'} description={loaded ? 'Try a different search.' : null} action={null} />
            )
          }
          selection={{
            selectedKeys: selectedIds,
            onToggle: toggleSelectImage,
            onToggleAll: () => setSelectedIds((current) => (current.length === filtered.length ? [] : filtered.map((image) => image.id))),
            allSelected: filtered.length > 0 && selectedIds.length === filtered.length,
          }}
        />
      </Card>

      <FormDialog
        open={pullOpen}
        title="Pull image"
        description="Pulls an image by reference, with per-layer download progress."
        submitLabel="Pull"
        submitting={Boolean(pullStreamUrl) && !pullTransfer.done}
        submitDisabled={!pullReference.trim() || Boolean(pullStreamUrl)}
        onSubmit={startPull}
        onCancel={closePullDialog}
      >
        <Stack gap="var(--space-3)">
          <TextField ariaLabel="Image reference" placeholder="e.g. nginx:1.27" value={pullReference} onChange={setPullReference} autoFocus />
          <TextField ariaLabel="Platform (optional)" placeholder="Platform (optional, e.g. linux/amd64)" value={pullPlatform} onChange={setPullPlatform} />
          {pullStreamUrl ? (
            pullSteps.length === 0 ? (
              <StepProgressList steps={[{ id: 'overall', label: 'Starting…', status: 'active' }]} />
            ) : (
              <StepProgressList steps={pullSteps} />
            )
          ) : null}
        </Stack>
      </FormDialog>

      <FormDialog
        open={tagTarget !== null}
        title={tagTarget ? `Tag ${displayTitle(tagTarget)}` : 'Tag image'}
        description="Adds a new repository:tag reference to this image."
        submitLabel="Tag"
        submitting={tagSaving}
        submitDisabled={!tagReference.trim()}
        onSubmit={submitTag}
        onCancel={() => setTagTarget(null)}
      >
        <TextField ariaLabel="New reference" placeholder="e.g. myrepo/name:tag" value={tagReference} onChange={setTagReference} autoFocus />
      </FormDialog>

      <FormDialog
        open={untagTarget !== null}
        title={untagTarget ? `Untag ${displayTitle(untagTarget)}` : 'Untag image'}
        description="Removes one repository:tag reference from this image."
        submitLabel="Untag"
        submitDisabled={!untagReference}
        onSubmit={submitUntag}
        onCancel={() => setUntagTarget(null)}
      >
        <Select
          ariaLabel="Reference to untag"
          value={untagReference}
          options={(untagTarget?.tags ?? []).map((tag) => ({ value: tag, label: tag }))}
          onChange={setUntagReference}
        />
      </FormDialog>

      <FormDialog
        open={pushTarget !== null}
        title={pushTarget ? `Push ${displayTitle(pushTarget)}` : 'Push image'}
        description="Pushes the selected reference to its registry, with per-layer upload progress."
        submitLabel="Push"
        submitting={Boolean(pushStreamUrl) && !pushTransfer.done}
        submitDisabled={!pushReference.trim() || Boolean(pushStreamUrl)}
        onSubmit={startPush}
        onCancel={closePushDialog}
      >
        <Stack gap="var(--space-3)">
          {pushTarget && pushTarget.tags.length > 1 ? (
            <Select
              ariaLabel="Reference to push"
              value={pushReference}
              options={pushTarget.tags.map((tag) => ({ value: tag, label: tag }))}
              onChange={setPushReference}
            />
          ) : (
            <TextField ariaLabel="Reference to push" value={pushReference} onChange={setPushReference} />
          )}
          {pushStreamUrl ? (
            pushSteps.length === 0 ? (
              <StepProgressList steps={[{ id: 'overall', label: 'Starting…', status: 'active' }]} />
            ) : (
              <StepProgressList steps={pushSteps} />
            )
          ) : null}
        </Stack>
      </FormDialog>

      <FormDialog
        open={loadOpen}
        title="Load tarball"
        description="Loads images from a tarball on your own machine, uploaded with progress."
        submitLabel="Load"
        submitDisabled={!loadFile}
        onSubmit={startLoad}
        onCancel={() => setLoadOpen(false)}
      >
        <FilePicker label="Tarball" ariaLabel="Tarball to load" accept=".tar" file={loadFile} onChange={setLoadFile} />
      </FormDialog>

      <TransferProgressDialog
        open={loadUpload.status !== 'idle'}
        title="Loading tarball"
        description={loadFile?.name}
        currentBytes={loadUpload.currentBytes}
        totalBytes={loadUpload.totalBytes}
        status={loadUpload.status === 'error' ? 'error' : loadUpload.status === 'done' ? 'done' : 'active'}
        onCancel={() => loadUpload.cancel()}
        onClose={closeLoadTransfer}
      >
        <Stack gap="var(--space-1)">
          {(loadUpload.result?.references ?? []).map((reference) => (
            <MetaCell key={reference}>{reference}</MetaCell>
          ))}
        </Stack>
      </TransferProgressDialog>

      <FormDialog
        open={importOpen}
        title="Import filesystem tarball"
        description="Imports an image from a filesystem tarball (docker import) on your own machine, uploaded with progress."
        submitLabel="Import"
        submitDisabled={!importFile}
        onSubmit={startImport}
        onCancel={() => setImportOpen(false)}
      >
        <Stack gap="var(--space-3)">
          <FilePicker label="Filesystem tarball" ariaLabel="Filesystem tarball to import" accept=".tar" file={importFile} onChange={setImportFile} />
          <TextField
            ariaLabel="Target reference (optional)"
            placeholder="Target reference (optional, e.g. myrepo/name:tag)"
            value={importTargetReference}
            onChange={setImportTargetReference}
          />
        </Stack>
      </FormDialog>

      <TransferProgressDialog
        open={importUpload.status !== 'idle'}
        title="Importing filesystem tarball"
        description={importFile?.name}
        currentBytes={importUpload.currentBytes}
        totalBytes={importUpload.totalBytes}
        status={importUpload.status === 'error' ? 'error' : importUpload.status === 'done' ? 'done' : 'active'}
        onCancel={() => importUpload.cancel()}
        onClose={closeImportTransfer}
      >
        <MetaCell>{importUpload.result?.reference ?? importUpload.result?.id ?? '–'}</MetaCell>
      </TransferProgressDialog>

      <ContainerCreateForm
        open={runReference !== undefined}
        images={images}
        imagesLoaded={loaded}
        initialImage={runReference}
        onCancel={() => setRunReference(undefined)}
        onCreated={() => setRunReference(undefined)}
      />

      {/*
        The image's four analysis views, presented by the screen rather than by
        the detail panel: each opens on the image whose row menu named it, with
        or without a panel open, and only the open one is rendered — so two are
        never on screen at once and none can hold state belonging to another
        image. `Escape` needs nothing here: each is a `Modal`, and an open one
        claims the key through the library's one arbitration registry and
        consumes it, so nothing underneath is dismissed behind it.
      */}
      {flow && flowImage ? (
        <>
          {flow.kind === 'layers' ? (
            <LayerExplorer
              image={flowImage}
              open
              onClose={closeImageFlow}
              initialSelectedLayerIndex={flow.layerIndex}
              autoAnalyze={flow.autoAnalyze}
              layersWithFindings={findings?.imageId === flowImage.id ? findings.layers : undefined}
            />
          ) : null}
          {flow.kind === 'signals' ? (
            <LayerEfficiencyView
              image={flowImage}
              open
              onClose={closeImageFlow}
              onNavigateToLayer={navigateToLayer}
              onFindingsChange={(layers) => setFindings({ imageId: flow.imageId, layers })}
            />
          ) : null}
          {flow.kind === 'filesystem' ? <FilesystemBrowser image={flowImage} open onClose={closeImageFlow} /> : null}
          {flow.kind === 'diff' ? (
            <ImageDiffView
              images={images}
              initialImageAId={flow.imageId}
              initialImageBId={flow.compareWithId}
              open
              onClose={closeImageFlow}
            />
          ) : null}
        </>
      ) : null}
    </Stack>
  );
}
