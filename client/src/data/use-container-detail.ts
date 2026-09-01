import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToReload } from './reload-signal';
import { fetchContainerInspect, type ContainerInspect } from './containers-client';
import { cadence } from '../timing/timing-scale';

const POLL_INTERVAL_MS = cadence(3000);

export interface UseContainerDetailOptions {
  /** Whether a tab showing the inspect data is the one on screen. */
  shown?: boolean;
}

export interface UseContainerDetailResult {
  inspect?: ContainerInspect;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads a single container's inspect data, on the same 3 s clock as the container summary the
 * detail's header is built from, so the two never describe different moments
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-25, REQ-26). Returns
 * an empty result when `id` is undefined (no container selected).
 */
export function useContainerDetail(id: string | undefined, { shown = true }: UseContainerDetailOptions = {}): UseContainerDetailResult {
  const [inspect, setInspect] = useState<ContainerInspect | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  // `readOnce` returns its promise so the reload signal can wait for it; `refresh` returns
  // nothing, the shape the screens use (plan-docker_management_app-refresh_cache/REQ-21).
  const readOnce = useCallback(() => {
    if (!id) return;
    return fetchContainerInspect(id)
      .then((result) => {
        if (cancelledRef.current) return;
        // Keeping the reading that has not changed is what leaves the sections the operator
        // opened, the find and the selection alone
        // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-29).
        setInspect((current) => (current && JSON.stringify(current) === JSON.stringify(result) ? current : result));
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
  }, [id]);

  const refresh = useCallback(() => {
    void readOnce();
  }, [readOnce]);

  useEffect(() => {
    cancelledRef.current = false;
    setInspect(undefined);
    setLoaded(false);
    setError(undefined);
    return () => {
      cancelledRef.current = true;
    };
  }, [id]);

  // The clock and the read that opens it, both scoped to the tab showing the data: a tab nobody is
  // looking at costs the daemon nothing
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-28).
  useEffect(() => {
    if (!id || !shown) return;
    refresh();
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [id, shown, refresh]);

  useEffect(() => subscribeToReload(readOnce), [readOnce]);

  return { inspect, loaded, error, refresh };
}
