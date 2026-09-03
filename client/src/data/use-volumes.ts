import { useCallback, useSyncExternalStore } from 'react';
import type { VolumeSummary } from './volumes-client';
import { usePushedValue } from './pushed-values';
import { isChannelDelivering, reconnectLiveChannel, subscribeToChannelDelivery } from './live-channel';

/** The name the server gives the volume listing on the channel. */
const VOLUMES = 'volumes';

/** One reference for every render before the first delivery, so nothing re-renders on it. */
const NONE: VolumeSummary[] = [];

export interface UseVolumesResult {
  volumes: VolumeSummary[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/** Reads the volume listing from the live channel: no clock, no request of its own (REQ-17, REQ-33, REQ-39). */
export function useVolumes(): UseVolumesResult {
  const volumes = usePushedValue<VolumeSummary[]>(VOLUMES);
  const delivering = useSyncExternalStore(subscribeToChannelDelivery, isChannelDelivering);

  // What failed is the channel, so what a retry does is ask for it again (REQ-18).
  const refresh = useCallback(() => {
    if (!isChannelDelivering()) reconnectLiveChannel();
  }, []);

  return {
    volumes: volumes ?? NONE,
    loaded: volumes !== undefined,
    error: delivering ? undefined : 'Could not reach the application server.',
    refresh,
  };
}
