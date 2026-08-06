import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchContainers, type ContainerSummary } from './containers-client';
import { onDaemonObjectTypeChanged } from './event-stream';

const POLL_INTERVAL_MS = 3000;

export interface UseContainersResult {
  containers: ContainerSummary[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads the container list, re-reading on a bounded poll and whenever a
 * `container` daemon event arrives (REQ-19, REQ-20, REQ-21, REQ-22).
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

  useEffect(() => onDaemonObjectTypeChanged('container', refresh), [refresh]);

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { containers, loaded, error, refresh };
}
