import { useCallback, useSyncExternalStore } from 'react';
import type { ComposeProjectSummary } from './compose-client';
import { usePushedValue } from './pushed-values';
import { isChannelDelivering, reconnectLiveChannel, subscribeToChannelDelivery } from './live-channel';

/** The name the server gives the compose project listing on the channel. */
const COMPOSE_PROJECTS = 'compose-projects';

/** One reference for every render before the first delivery, so nothing re-renders on it. */
const NONE: ComposeProjectSummary[] = [];

export interface UseComposeProjectsResult {
  projects: ComposeProjectSummary[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/** Reads the compose project listing from the live channel: no clock, no request of its own (REQ-17, REQ-33, REQ-39). */
export function useComposeProjects(): UseComposeProjectsResult {
  const projects = usePushedValue<ComposeProjectSummary[]>(COMPOSE_PROJECTS);
  const delivering = useSyncExternalStore(subscribeToChannelDelivery, isChannelDelivering);

  // What failed is the channel, so what a retry does is ask for it again (REQ-18).
  const refresh = useCallback(() => {
    if (!isChannelDelivering()) reconnectLiveChannel();
  }, []);

  return {
    projects: projects ?? NONE,
    loaded: projects !== undefined,
    error: delivering ? undefined : 'Could not reach the application server.',
    refresh,
  };
}
