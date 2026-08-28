import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToReload } from './reload-signal';
import { fetchNetworkInspect, type NetworkInspect } from './networks-client';
import { daemonEventConcerns, subscribeToDaemonEvents, type DaemonEvent } from './event-stream';

export interface UseNetworkInspectResult {
  inspect?: NetworkInspect;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads a single network's inspect data, re-reading when `id` changes, on a
 * `network` event about that same network
 * (plan-docker_management_app-refresh_cache/REQ-7) and on every `container`
 * event, since the containers attached to the network are part of what the
 * view shows. Returns an empty result when `id` is undefined (no network
 * selected).
 */
export function useNetworkInspect(id: string | undefined): UseNetworkInspectResult {
  const [inspect, setInspect] = useState<NetworkInspect | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    if (!id) return;
    return fetchNetworkInspect(id)
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
        if (event.type === 'container') refresh();
        else if (event.type === 'network' && daemonEventConcerns(event, id)) refresh();
      }),
    [id, refresh],
  );

  // The reload signal waits for this read, which is why `refresh` returns its promise (REQ-12).
  useEffect(() => subscribeToReload(refresh), [refresh]);

  return { inspect, loaded, error, refresh };
}
