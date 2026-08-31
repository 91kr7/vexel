import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { subscribeToReload } from './reload-signal';
import {
  activateBuilder,
  createBuilder,
  fetchBuilders,
  removeBuilder,
  type BuilderSummary,
  type CreateBuilderInput,
} from './builders-client';
import { cadence } from '../timing/timing-scale';

const POLL_INTERVAL_MS = cadence(5000);

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
 * Reads the buildx builder list, re-reading on a bounded poll, and drives
 * create/remove/select-active, each re-reading the list on success (REQ-88,
 * REQ-89).
 */
export function useBuilders(): UseBuildersResult {
  const [builders, setBuilders] = useState<BuilderSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  // `readOnce` returns its promise so the reload signal can wait for it; `refresh` returns
  // nothing, the shape the screens use (plan-docker_management_app-refresh_cache/REQ-21).
  const readOnce = useCallback(() => {
    return fetchBuilders()
      .then((list) => {
        if (cancelledRef.current) return;
        setBuilders(list);
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

  const refresh = useCallback(() => {
    void readOnce();
  }, [readOnce]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  // Another context means another daemon: what is held here belongs to
  // the one left behind and is re-read at once (REQ-93).
  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  useEffect(() => subscribeToReload(readOnce), [readOnce]);

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const create = useCallback(
    async (input: CreateBuilderInput) => {
      const created = await createBuilder(input);
      refresh();
      return created;
    },
    [refresh],
  );

  const remove = useCallback(
    async (name: string) => {
      await removeBuilder(name);
      refresh();
    },
    [refresh],
  );

  const use = useCallback(
    async (name: string) => {
      const activated = await activateBuilder(name);
      refresh();
      return activated;
    },
    [refresh],
  );

  return { builders, loaded, error, refresh, create, remove, use };
}
