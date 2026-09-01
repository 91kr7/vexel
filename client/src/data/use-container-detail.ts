import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToReload } from './reload-signal';
import { fetchContainerInspect, type ContainerInspect } from './containers-client';

export interface UseContainerDetailResult {
  inspect?: ContainerInspect;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads a single container's inspect data, re-reading when `id` changes (REQ-24, REQ-25). Returns
 * an empty result when `id` is undefined (no container selected).
 */
export function useContainerDetail(id: string | undefined): UseContainerDetailResult {
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

  const refresh = useCallback(() => {
    void readOnce();
  }, [readOnce]);

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

  useEffect(() => subscribeToReload(readOnce), [readOnce]);

  return { inspect, loaded, error, refresh };
}
