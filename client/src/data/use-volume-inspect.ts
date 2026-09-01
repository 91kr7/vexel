import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToReload } from './reload-signal';
import { fetchVolumeInspect, type VolumeInspect } from './volumes-client';

export interface UseVolumeInspectResult {
  inspect?: VolumeInspect;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads a single volume's inspect data, re-reading when `name` changes. Returns an empty result
 * when `name` is undefined (no volume selected).
 */
export function useVolumeInspect(name: string | undefined): UseVolumeInspectResult {
  const [inspect, setInspect] = useState<VolumeInspect | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  // `readOnce` returns its promise so the reload signal can wait for it; `refresh` returns
  // nothing, the shape the screens use (plan-docker_management_app-refresh_cache/REQ-21).
  const readOnce = useCallback(() => {
    if (!name) return;
    return fetchVolumeInspect(name)
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

  const refresh = useCallback(() => {
    void readOnce();
  }, [readOnce]);

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

  useEffect(() => subscribeToReload(readOnce), [readOnce]);

  return { inspect, loaded, error, refresh };
}
