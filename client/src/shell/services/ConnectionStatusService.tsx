import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { subscribeToActiveContextChange } from '../../data/active-context';
import { subscribeToReload } from '../../data/reload-signal';
import { fetchConnectionStatus, type ConnectionStatus } from '../../data/connectivity-client';
import { cadence } from '../../timing/timing-scale';

const POLL_INTERVAL_MS = cadence(5000);

interface ConnectionStatusContextValue extends ConnectionStatus {
  loading: boolean;
  retry: () => void;
}

const ConnectionStatusContext = createContext<ConnectionStatusContextValue | undefined>(undefined);

const initialStatus: ConnectionStatus = {
  daemon: { reachable: false },
  cli: {
    docker: { available: false },
    compose: { available: false },
    buildx: { available: false },
  },
  unavailableCapabilities: [],
};

/**
 * Polls the daemon connectivity endpoint and exposes reachability (with cause
 * on failure), the negotiated Engine API version and CLI availability
 * app-wide (REQ-9, REQ-10, REQ-13, REQ-110).
 */
export function ConnectionStatusProvider({ children }: { children?: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>(initialStatus);
  const [loading, setLoading] = useState(true);

  // `readOnce` returns its promise so the reload signal can wait for it; `refresh` returns
  // nothing, the shape the screens use (plan-docker_management_app-refresh_cache/REQ-21).
  const readOnce = useCallback(() => {
    setLoading(true);
    return fetchConnectionStatus()
      .then((next) => setStatus(next))
      .catch(() =>
        setStatus((previous) => ({
          ...previous,
          daemon: { reachable: false, cause: 'Could not reach the application server.' },
        })),
      )
      .finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(() => {
    void readOnce();
  }, [readOnce]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // The status describes the daemon of the active context: another context is
  // another daemon, re-probed at once instead of at the next poll (REQ-93).
  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  useEffect(() => subscribeToReload(readOnce), [readOnce]);

  const value = useMemo(() => ({ ...status, loading, retry: refresh }), [status, loading, refresh]);

  return <ConnectionStatusContext.Provider value={value}>{children}</ConnectionStatusContext.Provider>;
}

export function useConnectionStatus(): ConnectionStatusContextValue {
  const context = useContext(ConnectionStatusContext);
  if (!context) throw new Error('useConnectionStatus must be used within a ConnectionStatusProvider');
  return context;
}
