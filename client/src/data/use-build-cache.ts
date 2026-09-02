import { useCallback, useSyncExternalStore } from 'react';
import { pruneBuildCache, type BuildCachePruneResult, type BuildCacheRecord } from './builders-client';
import { usePushedValue } from './pushed-values';
import { isChannelDelivering, reconnectLiveChannel, subscribeToChannelDelivery } from './live-channel';

/** The name the server gives the build-cache inventory on the channel. */
const BUILD_CACHE = 'build-cache';

/** One reference for every render before the first delivery, so nothing re-renders on it. */
const NONE: BuildCacheRecord[] = [];

export interface UseBuildCacheResult {
  records: BuildCacheRecord[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
  prune: () => Promise<BuildCachePruneResult>;
}

/**
 * Reads the build-cache inventory from the live channel — no clock, no request of its own
 * (REQ-17, REQ-33, REQ-39) — and drives prune, whose result reaches the inventory as the push the
 * server's own operation causes (REQ-25).
 */
export function useBuildCache(): UseBuildCacheResult {
  const records = usePushedValue<BuildCacheRecord[]>(BUILD_CACHE);
  const delivering = useSyncExternalStore(subscribeToChannelDelivery, isChannelDelivering);

  // What failed is the channel, so what a retry does is ask for it again (REQ-18).
  const refresh = useCallback(() => {
    if (!isChannelDelivering()) reconnectLiveChannel();
  }, []);

  return {
    records: records ?? NONE,
    loaded: records !== undefined,
    error: delivering ? undefined : 'Could not reach the application server.',
    refresh,
    prune: pruneBuildCache,
  };
}
