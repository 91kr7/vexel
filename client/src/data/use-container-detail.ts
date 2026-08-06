import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchContainerInspect, type ContainerInspect } from './containers-client';
import { onDaemonObjectTypeChanged } from './event-stream';

export interface UseContainerDetailResult {
  inspect?: ContainerInspect;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads a single container's inspect data, re-reading when `id` changes and
 * whenever a `container` daemon event arrives (REQ-24, REQ-25). Returns an
 * empty result when `id` is undefined (no container selected).
 */
export function useContainerDetail(id: string | undefined): UseContainerDetailResult {
  const [inspect, setInspect] = useState<ContainerInspect | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    if (!id) return;
    fetchContainerInspect(id)
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

  useEffect(() => onDaemonObjectTypeChanged('container', refresh), [refresh]);

  return { inspect, loaded, error, refresh };
}
