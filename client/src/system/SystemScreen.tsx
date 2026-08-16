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
  ScreenToolbar,
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

/**
 * The eight properties **this screen keeps**
 * (plan-ui-coherence-optimisation/REQ-45, REQ-75): they were listed here and on
 * Contexts, and they describe *the daemon* rather than *a context* — they do not
 * change as the operator looks down a list of contexts, only when the active
 * context switches. Contexts lost the block in batch 9; the words, the values
 * and the order below are the delivered ones and are not this screen's to
 * revise.
 */
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
 *
 * **This is the screen that keeps the daemon properties**
 * (plan-ui-coherence-optimisation/REQ-45, REQ-75), and what changed here is how
 * this screen states what it already stated: the pair collapses, the two empty
 * results carry their explanation and their way out, and the system prune is a
 * control of the toolbar under the header. **What no change may reach** is what
 * each prune prunes, when it is enabled, the confirmation it demands or the
 * figure it reports back (REQ-73) — and the standing warning below the rows,
 * one style used twice in the product and correct as delivered (REQ-74).
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
    // The pair collapses to one column when the content column cannot carry
    // both cards, instead of dividing a phone's width between them: the fixed
    // `1fr 1.2fr` template this call site used to hand `Grid` collapsed at no
    // width, and at 375×812 it left the daemon card drawing its values one
    // character per line — the pin batches 4 and 5 left here
    // (plan-ui-coherence-optimisation/REQ-75).
    <Grid arrangement="pair">
      <Card>
        <SectionHeader title="Daemon info" />
        <Stack gap="var(--space-3)">
          {daemon.error ? <ErrorBanner title="Could not read the daemon" detail={daemon.error} onRetry={daemon.refresh} /> : null}
          {daemon.info ? (
            // The product's one property block, stated as every other property
            // block states it: label → value bands whose column count the grid
            // derives from the card's own width. `short-scalar` is what these
            // eight values are — versions, driver names, a path, a count — and
            // it is the class they already resolved under, so no count moves at
            // any width.
            <DefinitionList contentClass="short-scalar" items={daemonItems(daemon.info)} />
          ) : daemon.error ? null : daemon.loaded ? (
            <EmptyState
              title="The daemon reported nothing"
              description="The daemon answered without the version, driver and root directory this block states. Reading it again asks the active context's daemon once more."
              action={<Button onClick={daemon.refresh}>Read again</Button>}
            />
          ) : (
            <EmptyState title="Reading the daemon…" description={null} action={null} />
          )}
        </Stack>
      </Card>

      <Card>
        <SectionHeader
          title="Reclaim disk space"
          description={
            diskUsage.breakdown ? `${formatBytes(diskUsage.breakdown.totalReclaimableBytes)} reclaimable in total` : undefined
          }
        />
        {/* The screen's own action, in the action bar under the header rather
            than inside it (plan-ui-coherence-optimisation/REQ-41's rule, adopted
            here by REQ-75). Its label, its scope, its confirmation and the
            conditions that disable it are the delivered ones (REQ-73). */}
        <ScreenToolbar
          destructiveAction={{
            label: 'System prune…',
            onClick: handleSystemPrune,
            disabled: pruning || prunable.length === 0,
          }}
        />
        <Stack gap="var(--space-3)">
          {diskUsage.error ? (
            <ErrorBanner title="Could not read the disk usage" detail={diskUsage.error} onRetry={diskUsage.refresh} />
          ) : null}

          {categories.length === 0 ? (
            diskUsage.loaded ? (
              <EmptyState
                title="The daemon reported no disk usage"
                description="Docker breaks the reclaimable space into the five categories this panel prunes; with none of them reported there is nothing here to reclaim."
                action={<Button onClick={diskUsage.refresh}>Read again</Button>}
              />
            ) : (
              <EmptyState title="Reading the disk usage…" description={null} action={null} />
            )
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
