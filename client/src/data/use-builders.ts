import { useCallback, useSyncExternalStore } from 'react';
import {
  activateBuilder,
  createBuilder,
  removeBuilder,
  type BuilderSummary,
  type CreateBuilderInput,
} from './builders-client';
import { usePushedValue } from './pushed-values';
import { isChannelDelivering, reconnectLiveChannel, subscribeToChannelDelivery } from './live-channel';

/** The name the server gives the builder listing on the channel. */
const BUILDERS = 'builders';

/** One reference for every render before the first delivery, so nothing re-renders on it. */
const NONE: BuilderSummary[] = [];

export interface UseBuildersResult {
  builders: BuilderSummary[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
  create: (input: CreateBuilderInput) => Promise<BuilderSummary>;
  remove: (name: string) => Promise<void>;
  use: (name: string) => Promise<BuilderSummary>;
}

/**
 * Reads the buildx builder listing from the live channel — no clock, no request of its own
 * (REQ-17, REQ-33, REQ-39) — and drives create/remove/select-active, whose results reach the
 * listing as the pushes the server's own operations cause (REQ-25).
 */
export function useBuilders(): UseBuildersResult {
  const builders = usePushedValue<BuilderSummary[]>(BUILDERS);
  const delivering = useSyncExternalStore(subscribeToChannelDelivery, isChannelDelivering);

  // What failed is the channel, so what a retry does is ask for it again (REQ-18).
  const refresh = useCallback(() => {
    if (!isChannelDelivering()) reconnectLiveChannel();
  }, []);

  return {
    builders: builders ?? NONE,
    loaded: builders !== undefined,
    error: delivering ? undefined : 'Could not reach the application server.',
    refresh,
    create: createBuilder,
    remove: removeBuilder,
    use: activateBuilder,
  };
}
