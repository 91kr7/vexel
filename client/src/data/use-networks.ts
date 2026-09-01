import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { subscribeToReload } from './reload-signal';
import { fetchNetworks, type NetworkSummary } from './networks-client';
import { useKeptReading } from './use-kept-reading';
import { cadence } from '../timing/timing-scale';

const POLL_INTERVAL_MS = cadence(3000);

export interface UseNetworksResult {
  networks: NetworkSummary[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/** Reads the network list, re-reading on a bounded poll (REQ-72). */
export function useNetworks(): UseNetworksResult {
  const [networks, keepNetworks] = useKeptReading<NetworkSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  // `readOnce` returns its promise so the reload signal can wait for it; `refresh` returns
  // nothing, the shape the screens use (plan-docker_management_app-refresh_cache/REQ-21).
  const readOnce = useCallback(() => {
    return fetchNetworks()
      .then((list) => {
        if (cancelledRef.current) return;
        keepNetworks(list);
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
  }, [keepNetworks]);

  const refresh = useCallback(() => {
    void readOnce();
  }, [readOnce]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  // Another context means another daemon: what is held here belongs to
  // the one left behind and is re-read at once (REQ-93).
  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  useEffect(() => subscribeToReload(readOnce), [readOnce]);

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { networks, loaded, error, refresh };
}
