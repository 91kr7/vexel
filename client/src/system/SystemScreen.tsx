import { useState } from 'react';
import {
  Button,
  Callout,
  Card,
  DefinitionList,
  EmptyState,
  ErrorBanner,
  Grid,
  ResultSummary,
  SectionHeader,
  Stack,
  StorageUsageRow,
  useToast,
  type CheckboxOption,
  type DefinitionItem,
  type ResultSummaryItem,
} from '../ui';
import type { DaemonInfo } from '../data/contexts-client';
import type { DiskUsageCategory, DiskUsageCategoryId, PruneRunResult } from '../data/system-client';
import { useDaemonInfo } from '../data/use-daemon-info';
import { useDiskUsage } from '../data/use-disk-usage';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';

/**
 * Stated before every prune, in the confirmation itself: the daemon is not
 * this application's own, and a prune reaches whatever any other tool left on
 * it (REQ-97).
 */
const SHARED_DAEMON_WARNING =
  'This daemon is shared: Docker Desktop, the docker CLI and any other tool on this machine work on the same one, so anything of theirs that matches is removed as well.';

const CATEGORY_TITLES: Record<DiskUsageCategoryId, string> = {
  'stopped-containers': 'Stopped containers',
  'dangling-images': 'Dangling images',
  'unused-volumes': 'Unused volumes',
  'unused-networks': 'Unused networks',
  'build-cache': 'Build cache',
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

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/** What the category holds right now, in one line (REQ-95). */
function describe(category: DiskUsageCategory): string {
  if (category.unavailableDetail) return category.unavailableDetail;
  const { itemCount, items } = category;
  switch (category.id) {
    case 'stopped-containers':
      return itemCount === 0 ? 'No container is stopped' : `${plural(itemCount, 'container')} not running`;
    case 'dangling-images':
      return itemCount === 0 ? 'No untagged, unreferenced image' : `${plural(itemCount, 'image')} untagged and unreferenced`;
    case 'unused-volumes':
      if (itemCount === 0) return 'Every volume is attached to a container';
      return itemCount === 1 && items[0] ? `${items[0]} is unattached` : `${plural(itemCount, 'volume')} unattached`;
    case 'unused-networks':
      return itemCount === 0 ? 'Every network has an attached container' : `${plural(itemCount, 'network')} with no attached endpoint`;
    case 'build-cache':
      return itemCount === 0 ? 'No reclaimable BuildKit record' : `${plural(itemCount, 'record')} of BuildKit cache from past builds`;
  }
}

function sizeLabel(category: DiskUsageCategory): string {
  return category.unavailableDetail ? '—' : formatBytes(category.sizeBytes);
}

function daemonItems(info: DaemonInfo): DefinitionItem[] {
  return [
    { label: 'Docker version', value: info.version },
    { label: 'Engine API', value: info.apiVersion },
    { label: 'BuildKit', value: info.buildkitVersion ?? 'not reported' },
    { label: 'Storage driver', value: info.storageDriver },
    { label: 'Cgroup driver', value: info.cgroupVersion ? `${info.cgroupDriver} (v${info.cgroupVersion})` : info.cgroupDriver },
    { label: 'OS / Arch', value: `${info.osType} ${info.kernelVersion} / ${info.architecture}` },
    { label: 'Root directory', value: info.rootDirectory },
    { label: 'Containers (running)', value: `${info.containers.total} (${info.containers.running})` },
  ];
}

function resultItems(result: PruneRunResult): ResultSummaryItem[] {
  return result.categories.map((outcome) => ({
    label: CATEGORY_TITLES[outcome.categoryId],
    value: outcome.error ? `failed — ${outcome.error}` : `${plural(outcome.removedCount, 'item')} · ${formatBytes(outcome.reclaimedBytes)}`,
    failed: outcome.error !== undefined,
  }));
}

/**
 * The System & prune screen (REQ-95, REQ-96, REQ-97): the daemon information
 * of the active context beside the reclaimable-space breakdown, a prune per
 * category and a system prune whose scope is chosen in the confirmation —
 * both stating that the daemon is shared, and both reporting the space the
 * daemon says was actually reclaimed.
 */
export function SystemScreen() {
  const daemon = useDaemonInfo();
  const diskUsage = useDiskUsage();
  const { confirm, confirmScope } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  const [lastRun, setLastRun] = useState<PruneRunResult | undefined>(undefined);
  const [pruning, setPruning] = useState(false);

  const categories = diskUsage.breakdown?.categories ?? [];
  const prunable = categories.filter((category) => category.unavailableDetail === undefined && category.itemCount > 0);

  async function runPrune(label: string, scope: DiskUsageCategoryId[]) {
    setPruning(true);
    try {
      const result = await run(label, () => diskUsage.prune(scope));
      setLastRun(result);
      for (const outcome of result.categories) {
        if (outcome.error) reportError(`Could not prune ${CATEGORY_TITLES[outcome.categoryId].toLowerCase()}`, outcome.error);
      }
      push({
        title: 'Prune finished',
        message: `${formatBytes(result.reclaimedBytes)} reclaimed.`,
        tone: result.categories.some((outcome) => outcome.error) ? 'danger' : 'success',
      });
    } catch (cause) {
      reportError('Could not prune', (cause as Error).message);
    } finally {
      setPruning(false);
    }
  }

  async function handleCategoryPrune(category: DiskUsageCategory) {
    const title = CATEGORY_TITLES[category.id];
    const confirmed = await confirm({
      targetName: `${title} (${describe(category)}, ${sizeLabel(category)})`,
      consequence: `Everything this category holds is removed from the daemon and cannot be brought back. ${SHARED_DAEMON_WARNING}`,
      confirmLabel: 'Prune',
    });
    if (!confirmed) return;
    await runPrune(`Prune ${title.toLowerCase()}`, [category.id]);
  }

  async function handleSystemPrune() {
    const options: CheckboxOption[] = categories.map((category) => ({
      id: category.id,
      label: CATEGORY_TITLES[category.id],
      description: describe(category),
      note: sizeLabel(category),
      disabled: category.unavailableDetail !== undefined,
    }));
    const scope = await confirmScope({
      targetName: 'System prune',
      consequence: `Every category selected below is pruned, in one run, and nothing removed can be brought back. ${SHARED_DAEMON_WARNING}`,
      confirmLabel: 'Prune selected',
      scopeLabel: 'Prune scope',
      options,
      initialSelectedIds: prunable.map((category) => category.id),
    });
    if (!scope || scope.length === 0) return;
    await runPrune('System prune', scope as DiskUsageCategoryId[]);
  }

  return (
    <Grid columns="1fr 1.2fr" gap="var(--space-5)">
      <Card>
        <SectionHeader title="Daemon info" />
        <Stack gap="var(--space-3)">
          {daemon.error ? <ErrorBanner title="Could not read the daemon" detail={daemon.error} onRetry={daemon.refresh} /> : null}
          {daemon.info ? (
            <DefinitionList items={daemonItems(daemon.info)} />
          ) : daemon.error ? null : (
            <EmptyState title={daemon.loaded ? 'The daemon reported nothing' : 'Reading the daemon…'} />
          )}
        </Stack>
      </Card>

      <Card>
        <SectionHeader
          title="Reclaim disk space"
          description={
            diskUsage.breakdown ? `${formatBytes(diskUsage.breakdown.totalReclaimableBytes)} reclaimable in total` : undefined
          }
          trailing={
            <Button variant="destructive" onClick={handleSystemPrune} disabled={pruning || prunable.length === 0}>
              System prune…
            </Button>
          }
        />
        <Stack gap="var(--space-3)">
          {diskUsage.error ? (
            <ErrorBanner title="Could not read the disk usage" detail={diskUsage.error} onRetry={diskUsage.refresh} />
          ) : null}

          {categories.length === 0 ? (
            <EmptyState title={diskUsage.loaded ? 'The daemon reported no disk usage' : 'Reading the disk usage…'} />
          ) : (
            <Stack gap="0">
              {categories.map((category) => (
                <StorageUsageRow
                  key={category.id}
                  label={CATEGORY_TITLES[category.id]}
                  description={describe(category)}
                  sizeLabel={sizeLabel(category)}
                  action={{
                    label: 'Prune',
                    destructive: true,
                    disabled: pruning || category.unavailableDetail !== undefined || category.itemCount === 0,
                    onClick: () => handleCategoryPrune(category),
                  }}
                />
              ))}
            </Stack>
          )}

          {lastRun ? (
            <ResultSummary
              title="Last prune"
              headline={`${formatBytes(lastRun.reclaimedBytes)} reclaimed`}
              items={resultItems(lastRun)}
              tone={lastRun.categories.some((outcome) => outcome.error) ? 'danger' : 'success'}
            />
          ) : null}

          <Callout tone="warning">
            Destructive actions are always confirmed and marked in red. Other tools sharing this daemon are affected.
          </Callout>
        </Stack>
      </Card>
    </Grid>
  );
}
