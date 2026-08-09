import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { fetchBuildCache, pruneBuildCache, type BuildCachePruneResult, type BuildCacheRecord } from './builders-client';

const POLL_INTERVAL_MS = 5000;

export interface UseBuildCacheResult {
  records: BuildCacheRecord[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
  prune: () => Promise<BuildCachePruneResult>;
}

/**
 * Reads the build-cache inventory, re-reading on a bounded poll, and drives
 * prune, re-reading the inventory on success (REQ-91).
 */
export function useBuildCache(): UseBuildCacheResult {
  const [records, setRecords] = useState<BuildCacheRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    fetchBuildCache()
      .then((list) => {
        if (cancelledRef.current) return;
        setRecords(list);
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

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const prune = useCallback(async () => {
    const result = await pruneBuildCache();
    refresh();
    return result;
  }, [refresh]);

  return { records, loaded, error, refresh, prune };
}
