import { useCallback, useSyncExternalStore } from 'react';
import type { ImageSummary } from './images-client';
import { usePushedValue } from './pushed-values';
import { isChannelDelivering, reconnectLiveChannel, subscribeToChannelDelivery } from './live-channel';

/** The name the server gives the image listing on the channel. */
const IMAGES = 'images';

/** One reference for every render before the first delivery, so nothing re-renders on it. */
const NONE: ImageSummary[] = [];

export interface UseImagesResult {
  images: ImageSummary[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/** Reads the image listing from the live channel: no clock, no request of its own (REQ-17, REQ-33, REQ-39). */
export function useImages(): UseImagesResult {
  const images = usePushedValue<ImageSummary[]>(IMAGES);
  const delivering = useSyncExternalStore(subscribeToChannelDelivery, isChannelDelivering);

  // What failed is the channel, so what a retry does is ask for it again (REQ-18).
  const refresh = useCallback(() => {
    if (!isChannelDelivering()) reconnectLiveChannel();
  }, []);

  return {
    images: images ?? NONE,
    loaded: images !== undefined,
    error: delivering ? undefined : 'Could not reach the application server.',
    refresh,
  };
}
