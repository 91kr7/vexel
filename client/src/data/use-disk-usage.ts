import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { subscribeToReload } from './reload-signal';
import { subscribeToDaemonEvents, type DaemonEvent } from './event-stream';
import {
  fetchDiskUsage,
  pruneScope,
  type DiskUsageBreakdown,
  type DiskUsageCategoryId,
  type PruneRunResult,
} from './system-client';

/** The object types whose appearance or removal changes what is reclaimable. */
const RELEVANT_EVENT_TYPES = new Set(['container', 'image', 'volume', 'network']);

/** A prune emits one event per removed object: they are coalesced into a single re-read. */
const EVENT_COALESCE_MS = 750;

export interface UseDiskUsageResult {
  breakdown?: DiskUsageBreakdown;
  loaded: boolean;
  error?: string;
  refresh: () => void;
  prune: (scope: DiskUsageCategoryId[]) => Promise<PruneRunResult>;
}

/**
 * Reads the reclaimable-space breakdown and drives the prunes over it
 * (REQ-95, REQ-96). The breakdown is re-read after every prune, and whenever a
 * daemon event says the host's objects have changed — which is also how the
 * container, image, volume and network lists of the other screens follow a
 * prune, each already subscribing to that same stream.
 *
 * `/system/df` is an expensive reading on a large host, so unlike the list
 * hooks this one does not poll: it re-reads on the events that can change it.
 */
export function useDiskUsage(): UseDiskUsageResult {
  const [breakdown, setBreakdown] = useState<DiskUsageBreakdown | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
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

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = subscribeToDaemonEvents((event: DaemonEvent) => {
      if (!RELEVANT_EVENT_TYPES.has(event.type)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, EVENT_COALESCE_MS);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [refresh]);

  // Another context means another daemon: what is held here belongs to
  // the one left behind and is re-read at once (REQ-93).
  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  // The reload signal waits for this read, which is why `refresh` returns its promise (REQ-11).
  useEffect(() => subscribeToReload(refresh), [refresh]);

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
