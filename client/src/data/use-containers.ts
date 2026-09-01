import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { subscribeToReload } from './reload-signal';
import { fetchContainers, type ContainerSummary } from './containers-client';
import { cadence } from '../timing/timing-scale';

const POLL_INTERVAL_MS = cadence(3000);

export interface UseContainersResult {
  containers: ContainerSummary[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/** Reads the container list, re-reading on a bounded poll (REQ-19, REQ-20, REQ-21, REQ-22). */
export function useContainers(): UseContainersResult {
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  // `readOnce` returns its promise so the reload signal can wait for it; `refresh` returns
  // nothing, the shape the screens use (plan-docker_management_app-refresh_cache/REQ-21).
  const readOnce = useCallback(() => {
    return fetchContainers()
      .then((list) => {
        if (cancelledRef.current) return;
        setContainers(list);
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

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { containers, loaded, error, refresh };
}
