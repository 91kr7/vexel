import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { subscribeToReload } from './reload-signal';
import {
  fetchDiskUsage,
  pruneScope,
  type DiskUsageBreakdown,
  type DiskUsageCategoryId,
  type PruneRunResult,
} from './system-client';

export interface UseDiskUsageResult {
  breakdown?: DiskUsageBreakdown;
  loaded: boolean;
  error?: string;
  refresh: () => void;
  prune: (scope: DiskUsageCategoryId[]) => Promise<PruneRunResult>;
}

/**
 * Reads the reclaimable-space breakdown and drives the prunes over it (REQ-95, REQ-96), re-reading
 * it after every prune. `/system/df` is an expensive reading on a large host, so unlike the list
 * hooks this one does not poll.
 */
export function useDiskUsage(): UseDiskUsageResult {
  const [breakdown, setBreakdown] = useState<DiskUsageBreakdown | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  // `readOnce` returns its promise so the reload signal can wait for it; `refresh` returns
  // nothing, the shape the screens use (plan-docker_management_app-refresh_cache/REQ-21).
  const readOnce = useCallback(() => {
    return fetchDiskUsage()
      .then((next) => {
        if (cancelledRef.current) return;
        setBreakdown(next);
        setError(undefined);
      })
      .catch((cause: Error) => {
        if (cancelledRef.current) return;
        setError(cause.message);
      })
      .finally(() => {
        if (cancelledRef.current) return;
        setLoaded(true);
      });
  }, []);

  const refresh = useCallback(() => {
    void readOnce();
  }, [readOnce]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  // Another context means another daemon: what is held here belongs to
  // the one left behind and is re-read at once (REQ-93).
  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  useEffect(() => subscribeToReload(readOnce), [readOnce]);

  const prune = useCallback(
    async (scope: DiskUsageCategoryId[]) => {
      const result = await pruneScope(scope);
      refresh();
      return result;
    },
    [refresh],
  );

  return { breakdown, loaded, error, refresh, prune };
}
