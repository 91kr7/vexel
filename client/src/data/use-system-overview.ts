import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { subscribeToReload } from './reload-signal';
import { fetchSystemOverview, type SystemOverview } from './system-client';
import { cadence } from '../timing/timing-scale';

const POLL_INTERVAL_MS = cadence(3000);

export interface UseSystemOverviewResult {
  overview?: SystemOverview;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Holds the dashboard's overview of the host (REQ-14, REQ-16), re-reading it on the same 3 s clock
 * as the container list under the tiles. The server assembles the payload from what it already
 * holds, so a tick costs the daemon nothing
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-16, REQ-22).
 */
export function useSystemOverview(): UseSystemOverviewResult {
  const [overview, setOverview] = useState<SystemOverview | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  // `readOnce` returns its promise so the reload signal can wait for it; `refresh` returns
  // nothing, the shape the screens use (plan-docker_management_app-refresh_cache/REQ-21).
  const readOnce = useCallback(() => {
    return fetchSystemOverview()
      .then((next) => {
        if (cancelledRef.current) return;
        setOverview(next);
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

  return { overview, loaded, error, refresh };
}
