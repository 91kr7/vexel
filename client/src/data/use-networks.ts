import { useCallback, useSyncExternalStore } from 'react';
import type { NetworkSummary } from './networks-client';
import { usePushedValue } from './pushed-values';
import { isChannelDelivering, reconnectLiveChannel, subscribeToChannelDelivery } from './live-channel';

/** The name the server gives the network listing on the channel. */
const NETWORKS = 'networks';

/** One reference for every render before the first delivery, so nothing re-renders on it. */
const NONE: NetworkSummary[] = [];

export interface UseNetworksResult {
  networks: NetworkSummary[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/** Reads the network listing from the live channel: no clock, no request of its own (REQ-17, REQ-33, REQ-39). */
export function useNetworks(): UseNetworksResult {
  const networks = usePushedValue<NetworkSummary[]>(NETWORKS);
  const delivering = useSyncExternalStore(subscribeToChannelDelivery, isChannelDelivering);

  // What failed is the channel, so what a retry does is ask for it again (REQ-18).
  const refresh = useCallback(() => {
    if (!isChannelDelivering()) reconnectLiveChannel();
  }, []);

  return {
    networks: networks ?? NONE,
    loaded: networks !== undefined,
    error: delivering ? undefined : 'Could not reach the application server.',
    refresh,
  };
}
