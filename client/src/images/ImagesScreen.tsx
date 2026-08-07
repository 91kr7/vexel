import { useCallback, useEffect, useState } from 'react';
import {
  ActionButtonGroup,
  Badge,
  Card,
  CardList,
  EmptyState,
  ErrorBanner,
  FormDialog,
  MetaCell,
  ScreenToolbar,
  SearchField,
  Select,
  Stack,
  StepProgressList,
  TextField,
  useToast,
  type CardListRowContent,
  type ProgressStep,
  type RowAction,
} from '../ui';
import {
  imagePullStreamUrl,
  imagePushStreamUrl,
  pruneDanglingImages,
  removeImage,
  tagImage,
  untagImage,
  type ImageSummary,
} from '../data/images-client';
import { useImageTransferStream } from '../data/use-image-transfer';
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
 * Images screen (REQ-37–41): toolbar with pull and prune-dangling (build and
 * load are wired by batches 11 and 12), a searchable card list of local
 * images, per-image tag/untag/push/remove actions with destructive
 * confirmation for remove, and an inspect surface with the raw payload.
 */
export function ImagesScreen({ images, loaded, error, onRefresh }: ImagesScreenProps) {
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const [pullOpen, setPullOpen] = useState(false);
  const [pullReference, setPullReference] = useState('');
  const [pullPlatform, setPullPlatform] = useState('');
  const [pullStreamUrl, setPullStreamUrl] = useState<string | undefined>(undefined);

  const [tagTarget, setTagTarget] = useState<ImageSummary | null>(null);
  const [tagReference, setTagReference] = useState('');
  const [tagSaving, setTagSaving] = useState(false);

  const [pushTarget, setPushTarget] = useState<ImageSummary | null>(null);
  const [pushReference, setPushReference] = useState('');
  const [pushStreamUrl, setPushStreamUrl] = useState<string | undefined>(undefined);

  const pullTransfer = useImageTransferStream(pullStreamUrl);
  const pushTransfer = useImageTransferStream(pushStreamUrl);

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

  function actionsFor(image: ImageSummary): RowAction[] {
    const actions: RowAction[] = [
      { id: 'tag', label: 'tag', onClick: () => openTagDialog(image) },
      { id: 'push', label: 'push', onClick: () => openPushDialog(image), disabled: image.tags.length === 0 },
      { id: 'remove', label: 'remove', destructive: true, onClick: () => handleRemove(image) },
    ];
    if (image.tags.length === 1) {
      actions.splice(1, 0, { id: 'untag', label: 'untag', onClick: () => handleUntag(image.tags[0]) });
    } else if (image.tags.length > 1) {
      // Multiple tags: untag each individually so the choice is unambiguous.
      image.tags.forEach((tag, index) =>
        actions.splice(1 + index, 0, { id: `untag-${tag}`, label: `untag ${tag}`, onClick: () => handleUntag(tag) }),
      );
    }
    return actions;
  }

  function renderRow(image: ImageSummary): CardListRowContent {
    return {
      title: displayTitle(image),
      subtitle: `${image.digest ?? image.shortId}${image.platforms.length > 0 ? ` · ${image.platforms.join(', ')}` : ''}`,
      badges: image.tags.length === 0 ? <Badge tone="warning">dangling</Badge> : undefined,
      meta: (
        <Stack gap="var(--space-1)">
          <MetaCell>{formatAge(image.createdAt)}</MetaCell>
          <MetaCell>{formatBytes(image.sizeBytes)}</MetaCell>
        </Stack>
      ),
    };
  }

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

  return (
    <Stack gap="var(--space-4)">
      <ScreenToolbar
        primaryAction={{ label: 'Pull image…', onClick: openPullDialog }}
        secondaryActions={[
          { label: 'Build from Dockerfile…', onClick: () => undefined, disabled: true },
          { label: 'Load tarball', onClick: () => undefined, disabled: true },
        ]}
        destructiveAction={{ label: 'Prune dangling', onClick: handlePruneDangling, disabled: !hasDangling }}
        filters={<SearchField value={search} onChange={setSearch} placeholder="Search reference or digest…" />}
      />
      {error ? <ErrorBanner title="Could not load images" detail={error} onRetry={onRefresh} /> : null}
      <Card padding="none">
        <CardList
          items={filtered}
          itemKey={(image) => image.id}
          renderRow={renderRow}
          selectedKey={selectedId}
          onSelect={toggleSelection}
          expandedKey={selectedId}
          renderExpanded={(image) => (
            <Stack gap="var(--space-3)">
              <ActionButtonGroup actions={actionsFor(image)} />
              <ImageDetailPanel image={image} onClose={() => setSelectedId(undefined)} />
            </Stack>
          )}
          emptyState={<EmptyState title={loaded ? 'No images match' : 'Loading images…'} description={loaded ? 'Try a different search.' : undefined} />}
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
    </Stack>
  );
}
