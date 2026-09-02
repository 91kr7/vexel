import { useCallback, useSyncExternalStore } from 'react';
import type { ContainerSummary } from './containers-client';
import { usePushedValue } from './pushed-values';
import { isChannelDelivering, reconnectLiveChannel, subscribeToChannelDelivery } from './live-channel';

/** The name the server gives the container listing on the channel. */
const CONTAINERS = 'containers';

/** One reference for every render before the first delivery, so nothing re-renders on it. */
const NONE: ContainerSummary[] = [];

export interface UseContainersResult {
  containers: ContainerSummary[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/** Reads the container listing from the live channel: no clock, no request of its own (REQ-8, REQ-17, REQ-39). */
export function useContainers(): UseContainersResult {
  const containers = usePushedValue<ContainerSummary[]>(CONTAINERS);
  const delivering = useSyncExternalStore(subscribeToChannelDelivery, isChannelDelivering);

  // What failed is the channel, so what a retry does is ask for it again (REQ-18).
  const refresh = useCallback(() => {
    if (!isChannelDelivering()) reconnectLiveChannel();
  }, []);

  return {
    containers: containers ?? NONE,
    loaded: containers !== undefined,
    error: delivering ? undefined : 'Could not reach the application server.',
    refresh,
  };
}
