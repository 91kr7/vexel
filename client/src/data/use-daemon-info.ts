import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { fetchDaemonInfo, type DaemonInfo } from './contexts-client';

export interface UseDaemonInfoResult {
  info?: DaemonInfo;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads the daemon information of the active context (REQ-94), re-reading it
 * whenever another context becomes the active one — the reading belongs to a
 * daemon, not to the screen.
 */
export function useDaemonInfo(): UseDaemonInfoResult {
  const [info, setInfo] = useState<DaemonInfo | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    fetchDaemonInfo()
      .then((next) => {
        if (cancelledRef.current) return;
        setInfo(next);
        setError(undefined);
      })
      .catch((cause: Error) => {
        if (cancelledRef.current) return;
        setInfo(undefined);
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

  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  return { info, loaded, error, refresh };
}
