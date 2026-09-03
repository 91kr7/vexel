import { useCallback, useState, useSyncExternalStore } from 'react';
import type { ComposeProjectSummary } from './compose-client';
import { usePushedValue } from './pushed-values';
import { requestServerReload } from './refresh-client';
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

/** Reads the compose project listing from the live channel: no clock, and no request but the one a press asks for (REQ-17, REQ-33, REQ-39). */
export function useComposeProjects(): UseComposeProjectsResult {
  const projects = usePushedValue<ComposeProjectSummary[]>(COMPOSE_PROJECTS);
  const delivering = useSyncExternalStore(subscribeToChannelDelivery, isChannelDelivering);
  const [askFailure, setAskFailure] = useState<string | undefined>(undefined);

  // Reading again means asking the server, the listing being pushed and not fetched: what it reads
  // arrives on the channel. With the channel down there is nothing to read again — ask for it
  // instead (REQ-18, REQ-23, REQ-39).
  const refresh = useCallback(() => {
    if (!isChannelDelivering()) {
      reconnectLiveChannel();
      return;
    }
    setAskFailure(undefined);
    void requestServerReload()
      .then((report) => setAskFailure(report.failed.find((one) => one.key === COMPOSE_PROJECTS)?.error))
      .catch((cause: Error) => setAskFailure(cause.message));
  }, []);

  return {
    projects: projects ?? NONE,
    loaded: projects !== undefined,
    error: delivering ? askFailure : 'Could not reach the application server.',
    refresh,
  };
}
