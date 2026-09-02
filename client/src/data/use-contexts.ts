import { useCallback, useSyncExternalStore } from 'react';
import { notifyActiveContextChanged } from './active-context';
import {
  activateContext,
  createContext,
  removeContext,
  type ContextSummary,
  type CreateContextInput,
} from './contexts-client';
import { usePushedValue } from './pushed-values';
import { isChannelDelivering, reconnectLiveChannel, subscribeToChannelDelivery } from './live-channel';

/** The name the server gives the context inventory on the channel. */
const CONTEXTS = 'contexts';

/** One reference for every render before the first delivery, so nothing re-renders on it. */
const NONE: ContextSummary[] = [];

export interface UseContextsResult {
  contexts: ContextSummary[];
  /** The context every screen currently talks to; undefined until the inventory has been delivered. */
  active?: ContextSummary;
  loaded: boolean;
  error?: string;
  refresh: () => void;
  create: (input: CreateContextInput) => Promise<ContextSummary>;
  remove: (name: string) => Promise<void>;
  use: (name: string) => Promise<ContextSummary>;
}

/**
 * Reads the Docker context inventory from the live channel — no clock, no request of its own
 * (REQ-17, REQ-33, REQ-39) — and drives create/remove/select-active. A successful switch is
 * announced to the views that still read on demand; the inventory itself, and every other converted
 * value, is discarded and delivered again by the server (REQ-24, REQ-25).
 */
export function useContexts(): UseContextsResult {
  const delivered = usePushedValue<ContextSummary[]>(CONTEXTS);
  const delivering = useSyncExternalStore(subscribeToChannelDelivery, isChannelDelivering);
  // A delivery that is not a list is reported and never shown, so no consumer is handed a non-list.
  const malformed = delivered !== undefined && !Array.isArray(delivered);

  // What failed is the channel, so what a retry does is ask for it again (REQ-18).
  const refresh = useCallback(() => {
    if (!isChannelDelivering()) reconnectLiveChannel();
  }, []);

  const use = useCallback(async (name: string) => {
    const activated = await activateContext(name);
    notifyActiveContextChanged();
    return activated;
  }, []);

  const contexts = malformed || delivered === undefined ? NONE : delivered;

  return {
    contexts,
    active: contexts.find((context) => context.active),
    loaded: delivered !== undefined,
    error: !delivering
      ? 'Could not reach the application server.'
      : malformed
        ? 'The server did not answer with a list of contexts.'
        : undefined,
    refresh,
    create: createContext,
    remove: removeContext,
    use,
  };
}
