import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchVolumes, type VolumeSummary } from './volumes-client';
import { subscribeToDaemonEvents, type DaemonEvent } from './event-stream';

const POLL_INTERVAL_MS = 3000;

export interface UseVolumesResult {
  volumes: VolumeSummary[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads the volume list, re-reading on a bounded poll, on every `volume`
 * daemon event, and on a `container` daemon event (a container's own mounts
 * change which volumes it mounts) (REQ-70).
 */
export function useVolumes(): UseVolumesResult {
  const [volumes, setVolumes] = useState<VolumeSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    fetchVolumes()
      .then((list) => {
        if (cancelledRef.current) return;
        setVolumes(list);
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
        if (event.type === 'volume' || event.type === 'container') refresh();
      }),
    [refresh],
  );

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { volumes, loaded, error, refresh };
}
