import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchVolumeInspect, type VolumeInspect } from './volumes-client';
import { subscribeToDaemonEvents, type DaemonEvent } from './event-stream';

export interface UseVolumeInspectResult {
  inspect?: VolumeInspect;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads a single volume's inspect data, re-reading when `name` changes and
 * on every `volume`/`container` daemon event. Returns an empty result when
 * `name` is undefined (no volume selected).
 */
export function useVolumeInspect(name: string | undefined): UseVolumeInspectResult {
  const [inspect, setInspect] = useState<VolumeInspect | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    if (!name) return;
    fetchVolumeInspect(name)
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
  }, [name]);

  useEffect(() => {
    cancelledRef.current = false;
    setInspect(undefined);
    setLoaded(false);
    setError(undefined);
    if (name) refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [name, refresh]);

  useEffect(
    () =>
      subscribeToDaemonEvents((event: DaemonEvent) => {
        if (event.type === 'volume' || event.type === 'container') refresh();
      }),
    [refresh],
  );

  return { inspect, loaded, error, refresh };
}
