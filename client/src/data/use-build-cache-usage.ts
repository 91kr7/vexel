import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBuildCacheUsage, type BuildCacheUsage } from './builders-client';

export interface UseBuildCacheUsageResult {
  usage?: BuildCacheUsage;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads the images and layers one build-cache record relates to (REQ-69),
 * re-reading when `recordId` changes. Returns an empty result when
 * `recordId` is undefined (no record selected). A record with no association
 * is not an error: it arrives carrying its own reason.
 */
export function useBuildCacheUsage(recordId: string | undefined): UseBuildCacheUsageResult {
  const [usage, setUsage] = useState<BuildCacheUsage | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);

  const refresh = useCallback(() => {
    if (!recordId) return;
    // Each read owns its controller and aborts the one it supersedes, so a
    // slower answer for a previous record can neither arrive nor overwrite the
    // current one. A boolean shared across reads cannot express that.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchBuildCacheUsage(recordId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setUsage(result);
        setError(undefined);
        setLoaded(true);
      })
      .catch((cause: Error) => {
        if (controller.signal.aborted) return;
        setError(cause.message);
        setLoaded(true);
      });
  }, [recordId]);

  useEffect(() => {
    setUsage(undefined);
    setLoaded(false);
    setError(undefined);
    if (recordId) refresh();
    return () => {
      abortRef.current?.abort();
    };
  }, [recordId, refresh]);

  return { usage, loaded, error, refresh };
}
