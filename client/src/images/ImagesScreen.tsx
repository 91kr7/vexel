import { useCallback, useEffect, useState } from 'react';
import {
  ActionButtonGroup,
  BadgeListCell,
  BulkActionBar,
  Card,
  DataTable,
  EmptyState,
  ErrorBanner,
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
  type ProgressStep,
  type RowAction,
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
import { ImageDetailPanel } from './ImageDetailPanel';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';

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

/** The reference shown as the row's primary line; a dangling image has none. */
function primaryReference(image: ImageSummary): string {
  return image.tags[0] ?? '<none>';
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
 * selected images, and an inspect surface with the raw payload.
 */
export function ImagesScreen({ images, loaded, error, onRefresh }: ImagesScreenProps) {
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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

  function toggleSelection(image: ImageSummary) {
    setSelectedId((current) => (current === image.id ? undefined : image.id));
  }

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
   * reference to drop, so the choice moves to a dialog rather than to one row
   * button per tag (the row's action column holds a fixed number of actions).
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

  /** Fixed set of six actions, sized to fit the row's action column. */
  function actionsFor(image: ImageSummary): RowAction[] {
    return [
      { id: 'run', label: 'run', onClick: () => setRunReference(image.tags[0] ?? image.shortId) },
      { id: 'tag', label: 'tag', onClick: () => openTagDialog(image) },
      { id: 'untag', label: 'untag', onClick: () => startUntag(image), disabled: image.tags.length === 0 },
      { id: 'push', label: 'push', onClick: () => openPushDialog(image), disabled: image.tags.length === 0 },
      { id: 'save', label: 'save', onClick: () => startSave([image.tags[0] ?? image.id]) },
      { id: 'remove', label: 'remove', destructive: true, onClick: () => handleRemove(image) },
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
      header: 'REPOSITORY:TAG',
      width: '1.8fr',
      render: (image) => <TwoLineCell title={primaryReference(image)} subtitle={image.shortId} />,
    },
    {
      id: 'tags',
      header: 'TAGS',
      width: '1.2fr',
      render: (image) => <BadgeListCell labels={image.tags} maxVisible={2} emptyLabel="dangling" emptyTone="warning" />,
    },
    { id: 'digest', header: 'DIGEST', width: '1fr', render: (image) => <IdentifierCell value={image.digest ?? image.id} maxChars={19} /> },
    {
      id: 'platform',
      header: 'PLATFORM',
      width: '1fr',
      render: (image) => <MetaCell>{image.platforms.length > 0 ? image.platforms.join(', ') : undefined}</MetaCell>,
    },
    { id: 'size', header: 'SIZE', align: 'end', width: '0.6fr', render: (image) => <MetaCell>{formatBytes(image.sizeBytes)}</MetaCell> },
    { id: 'created', header: 'CREATED', width: '1fr', render: (image) => <MetaCell>{formatAge(image.createdAt)}</MetaCell> },
    {
      id: 'actions',
      header: 'ACTIONS',
      width: 'var(--data-table-action-column-width)',
      render: (image) => <ActionButtonGroup actions={actionsFor(image)} />,
    },
  ];

  const filtered = images.filter((image) => matchesSearch(image, search));
  const hasDangling = images.some((image) => image.tags.length === 0);

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
      {error ? <ErrorBanner title="Could not load images" detail={error} onRetry={onRefresh} /> : null}
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
          emptyState={<EmptyState title={loaded ? 'No images match' : 'Loading images…'} description={loaded ? 'Try a different search.' : undefined} />}
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
          {pullTransfer.error ? <ErrorBanner title="Pull failed" detail={pullTransfer.error} /> : null}
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
          {pushTransfer.error ? <ErrorBanner title="Push failed" detail={pushTransfer.error} /> : null}
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
        errorMessage={loadUpload.error}
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
        errorMessage={importUpload.error}
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
    </Stack>
  );
}
