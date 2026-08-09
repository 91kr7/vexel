import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyActiveContextChanged, subscribeToActiveContextChange } from './active-context';
import {
  activateContext,
  createContext,
  fetchContexts,
  removeContext,
  type ContextSummary,
  type CreateContextInput,
} from './contexts-client';

// Contexts live in the local Docker configuration and change only when
// somebody edits it, so this poll is deliberately slower than a daemon-object
// one: it exists to notice a `docker context` command run from a terminal.
const POLL_INTERVAL_MS = 15000;

/**
 * Every mounted instance of the hook — the Contexts screen's and the shell's —
 * re-reads the inventory as soon as any of them changes it. Without this, the
 * screen that acted would be the only one to know, and the rail would name the
 * context left behind until the next poll (REQ-92, REQ-93).
 */
const inventoryListeners = new Set<() => void>();

function announceInventoryChange(): void {
  inventoryListeners.forEach((listener) => listener());
}

export interface UseContextsResult {
  contexts: ContextSummary[];
  /** The context every screen currently talks to; undefined until the list has been read. */
  active?: ContextSummary;
  loaded: boolean;
  error?: string;
  refresh: () => void;
  create: (input: CreateContextInput) => Promise<ContextSummary>;
  remove: (name: string) => Promise<void>;
  use: (name: string) => Promise<ContextSummary>;
}

/**
 * Reads the Docker context inventory, re-reading on a bounded poll, and drives
 * create/remove/select-active (REQ-92). A successful switch announces itself to
 * every cached view, so the whole application follows the new daemon (REQ-93).
 */
export function useContexts(): UseContextsResult {
  const [contexts, setContexts] = useState<ContextSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    fetchContexts()
      .then((list) => {
        if (cancelledRef.current) return;
        // A payload that is not a list is a failed read like any other: it is
        // reported, never stored, so no consumer is handed a non-list.
        if (!Array.isArray(list)) throw new Error('The server did not answer with a list of contexts.');
        setContexts(list);
        setError(undefined);
      })
      .catch((cause: Error) => {
        if (cancelledRef.current) return;
        setError(cause.message);
      })
      .finally(() => {
        if (cancelledRef.current) return;
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  // The switch is announced by whichever instance made it — including this one,
  // which is why the announcement, and never the local state, is what drives
  // the re-read: the shell and the screen then agree on the active context.
  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  useEffect(() => {
    inventoryListeners.add(refresh);
    return () => {
      inventoryListeners.delete(refresh);
    };
  }, [refresh]);

  const create = useCallback(async (input: CreateContextInput) => {
    const created = await createContext(input);
    announceInventoryChange();
    return created;
  }, []);

  const remove = useCallback(async (name: string) => {
    await removeContext(name);
    announceInventoryChange();
  }, []);

  const use = useCallback(async (name: string) => {
    const activated = await activateContext(name);
    // The broadcast re-reads this hook too (it subscribes like every other
    // cached view), so there is no local refresh to add here — and none to
    // double it with.
    notifyActiveContextChanged();
    return activated;
  }, []);

  return { contexts, active: contexts.find((context) => context.active), loaded, error, refresh, create, remove, use };
}
