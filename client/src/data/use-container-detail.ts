import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToReload } from './reload-signal';
import { fetchContainerInspect, type ContainerInspect } from './containers-client';
import { daemonEventConcerns, subscribeToDaemonEvents, type DaemonEvent } from './event-stream';

/**
 * Container actions that fire on every terminal resize or exec lifecycle step
 * (REQ-34, REQ-35) but never change the inspect payload — excluded so an open
 * exec/attach session does not drive a refetch loop.
 */
const ACTIONS_NOT_AFFECTING_INSPECT = new Set(['resize', 'exec_create', 'exec_start', 'exec_die', 'exec_detach', 'top']);

export interface UseContainerDetailResult {
  inspect?: ContainerInspect;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads a single container's inspect data, re-reading when `id` changes and
 * whenever a `container` daemon event about that same container arrives
 * (REQ-24, REQ-25, plan-docker_management_app-refresh_cache/REQ-7) — an event
 * about another container changes nothing here. Resize and exec lifecycle
 * events are excluded, since an open exec/attach session (REQ-34, REQ-35)
 * fires those on every terminal resize without changing anything inspect
 * reports. Returns an empty result when `id` is undefined (no container
 * selected).
 */
export function useContainerDetail(id: string | undefined): UseContainerDetailResult {
  const [inspect, setInspect] = useState<ContainerInspect | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    if (!id) return;
    return fetchContainerInspect(id)
      .then((result) => {
        if (cancelledRef.current) return;
        setInspect(result);
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

  useEffect(() => {
    cancelledRef.current = false;
    setInspect(undefined);
    setLoaded(false);
    setError(undefined);
    if (id) refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [id, refresh]);

  useEffect(
    () =>
      subscribeToDaemonEvents((event: DaemonEvent) => {
        if (event.type !== 'container') return;
        if (ACTIONS_NOT_AFFECTING_INSPECT.has(event.action)) return;
        if (daemonEventConcerns(event, id)) refresh();
      }),
    [id, refresh],
  );

  // The reload signal waits for this read, which is why `refresh` returns its promise (REQ-12).
  useEffect(() => subscribeToReload(refresh), [refresh]);

  return { inspect, loaded, error, refresh };
}
