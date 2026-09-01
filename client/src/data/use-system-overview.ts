import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { subscribeToReload } from './reload-signal';
import { fetchSystemOverview, type SystemOverview } from './system-client';

export interface UseSystemOverviewResult {
  overview?: SystemOverview;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Holds the dashboard's overview of the host (REQ-14, REQ-16). It does not poll: the reading behind
 * it is the daemon's own disk-usage accounting, expensive on a large host, and a dashboard left
 * open all day must not keep the daemon busy computing it.
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

  return { overview, loaded, error, refresh };
}
