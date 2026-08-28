import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToReload } from './reload-signal';
import { fetchVolumeInspect, type VolumeInspect } from './volumes-client';
import { daemonEventConcerns, subscribeToDaemonEvents, type DaemonEvent } from './event-stream';

export interface UseVolumeInspectResult {
  inspect?: VolumeInspect;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads a single volume's inspect data, re-reading when `name` changes, on a
 * `volume` event about that same volume
 * (plan-docker_management_app-refresh_cache/REQ-7) and on every `container`
 * event, since the containers mounting the volume are part of what the view
 * shows. Returns an empty result when `name` is undefined (no volume
 * selected).
 */
export function useVolumeInspect(name: string | undefined): UseVolumeInspectResult {
  const [inspect, setInspect] = useState<VolumeInspect | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
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
        if (event.type === 'container') refresh();
        else if (event.type === 'volume' && daemonEventConcerns(event, name)) refresh();
      }),
    [name, refresh],
  );

  // The reload signal waits for this read, which is why `refresh` returns its promise (REQ-12).
  useEffect(() => subscribeToReload(refresh), [refresh]);

  return { inspect, loaded, error, refresh };
}
