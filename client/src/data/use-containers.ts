import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { fetchContainers, type ContainerSummary } from './containers-client';
import { subscribeToDaemonEvents, type DaemonEvent } from './event-stream';

const POLL_INTERVAL_MS = 3000;

/**
 * Container actions that fire on every terminal resize or exec lifecycle step
 * (REQ-34, REQ-35) but never change what the container list displays —
 * excluded so an open exec/attach session does not drive a refetch loop.
 */
const ACTIONS_NOT_AFFECTING_LIST = new Set(['resize', 'exec_create', 'exec_start', 'exec_die', 'exec_detach', 'top']);

export interface UseContainersResult {
  containers: ContainerSummary[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads the container list, re-reading on a bounded poll and whenever a
 * `container` daemon event that can change the list arrives (REQ-19, REQ-20,
 * REQ-21, REQ-22) — resize and exec lifecycle events are excluded, since an
 * open exec/attach session (REQ-34, REQ-35) fires those on every terminal
 * resize without changing anything the list displays.
 */
export function useContainers(): UseContainersResult {
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    fetchContainers()
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

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  useEffect(
    () =>
      subscribeToDaemonEvents((event: DaemonEvent) => {
        if (event.type === 'container' && !ACTIONS_NOT_AFFECTING_LIST.has(event.action)) refresh();
      }),
    [refresh],
  );

  // Another context means another daemon: what is held here belongs to
  // the one left behind and is re-read at once (REQ-93).
  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { containers, loaded, error, refresh };
}
