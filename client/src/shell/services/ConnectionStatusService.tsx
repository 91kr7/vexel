import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { isChannelDelivering, reconnectLiveChannel, subscribeToChannelDelivery } from '../../data/live-channel';
import { usePushedValue } from '../../data/pushed-values';

/** The name the server gives the connection status on the channel. */
const CONNECTION_STATUS = 'connection-status';

export interface CliToolStatus {
  available: boolean;
  version?: string;
}

export interface CliAvailability {
  docker: CliToolStatus;
  compose: CliToolStatus;
  buildx: CliToolStatus;
}

export interface ConnectionStatus {
  daemon: { reachable: boolean; cause?: string };
  apiVersion?: string;
  engineVersion?: string;
  cli: CliAvailability;
  unavailableCapabilities: string[];
}

interface ConnectionStatusContextValue extends ConnectionStatus {
  loading: boolean;
  retry: () => void;
}

const ConnectionStatusContext = createContext<ConnectionStatusContextValue | undefined>(undefined);

// Nothing delivered yet: unreachable without a cause, so nothing is claimed to have failed.
const initialStatus: ConnectionStatus = {
  daemon: { reachable: false },
  cli: {
    docker: { available: false },
    compose: { available: false },
    buildx: { available: false },
  },
  unavailableCapabilities: [],
};

const CHANNEL_DOWN = { reachable: false, cause: 'Could not reach the application server.' };

/**
 * Exposes daemon reachability (with cause), the negotiated Engine API version
 * and CLI availability app-wide, read from the live channel: no clock and no
 * request of its own (REQ-9, REQ-10, REQ-13, REQ-110, …-multiplexed_sse/REQ-17,
 * /REQ-19, /REQ-39).
 */
export function ConnectionStatusProvider({ children }: { children?: ReactNode }) {
  const status = usePushedValue<ConnectionStatus>(CONNECTION_STATUS);
  const delivering = useSyncExternalStore(subscribeToChannelDelivery, isChannelDelivering);

  // What failed is the channel, so what a retry does is ask for it again (REQ-18).
  const retry = useCallback(() => {
    if (!isChannelDelivering()) reconnectLiveChannel();
  }, []);

  // A channel that is not delivering is told through the indication this service already
  // exposes — no element and no wording of its own (REQ-11, REQ-35).
  const value = useMemo(() => {
    const held = status ?? initialStatus;
    return {
      ...held,
      daemon: delivering ? held.daemon : CHANNEL_DOWN,
      loading: status === undefined,
      retry,
    };
  }, [status, delivering, retry]);

  return <ConnectionStatusContext.Provider value={value}>{children}</ConnectionStatusContext.Provider>;
}

export function useConnectionStatus(): ConnectionStatusContextValue {
  const context = useContext(ConnectionStatusContext);
  if (!context) throw new Error('useConnectionStatus must be used within a ConnectionStatusProvider');
  return context;
}
