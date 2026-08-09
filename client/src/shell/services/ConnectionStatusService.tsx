import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { subscribeToActiveContextChange } from '../../data/active-context';
import { fetchConnectionStatus, type ConnectionStatus } from '../../data/connectivity-client';

const POLL_INTERVAL_MS = 5000;

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

  const refresh = useCallback(() => {
    setLoading(true);
    fetchConnectionStatus()
      .then((next) => setStatus(next))
      .catch(() =>
        setStatus((previous) => ({
          ...previous,
          daemon: { reachable: false, cause: 'Could not reach the application server.' },
        })),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // The status describes the daemon of the active context: another context is
  // another daemon, re-probed at once instead of at the next poll (REQ-93).
  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  const value = useMemo(() => ({ ...status, loading, retry: refresh }), [status, loading, refresh]);

  return <ConnectionStatusContext.Provider value={value}>{children}</ConnectionStatusContext.Provider>;
}

export function useConnectionStatus(): ConnectionStatusContextValue {
  const context = useContext(ConnectionStatusContext);
  if (!context) throw new Error('useConnectionStatus must be used within a ConnectionStatusProvider');
  return context;
}
