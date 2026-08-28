import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { subscribeToReload } from './reload-signal';
import {
  fetchRegistries,
  loginToRegistry,
  logoutFromRegistry,
  type RegistryLoginInput,
  type RegistrySummary,
} from './registries-client';

// The inventory lives in the local Docker configuration and in the credential
// store; it changes only when somebody edits them, so the poll is a slow one —
// it exists to notice a `docker login` run from a terminal.
const POLL_INTERVAL_MS = 15000;

export interface UseRegistriesResult {
  registries: RegistrySummary[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
  logIn: (input: RegistryLoginInput) => Promise<RegistrySummary>;
  logOut: (host: string) => Promise<RegistrySummary>;
}

/**
 * Reads the configured registries on a bounded poll and drives log in / log out
 * (REQ-85, REQ-87). The secret passed to `logIn` is forwarded to the server and
 * kept nowhere: this hook holds no credential state of any kind.
 */
export function useRegistries(): UseRegistriesResult {
  const [registries, setRegistries] = useState<RegistrySummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  // `readOnce` returns its promise so the reload signal can wait for it; `refresh` returns
  // nothing, the shape the screens use (plan-docker_management_app-refresh_cache/REQ-21).
  const readOnce = useCallback(() => {
    return fetchRegistries()
      .then((list) => {
        if (cancelledRef.current) return;
        if (!Array.isArray(list)) throw new Error('The server did not answer with a list of registries.');
        setRegistries(list);
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

  // Another context means another daemon: the insecure-registry flags held
  // here belong to the one left behind and are re-read at once (REQ-93).
  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  useEffect(() => subscribeToReload(readOnce), [readOnce]);

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const logIn = useCallback(
    async (input: RegistryLoginInput) => {
      const updated = await loginToRegistry(input);
      refresh();
      return updated;
    },
    [refresh],
  );

  const logOut = useCallback(
    async (host: string) => {
      const updated = await logoutFromRegistry(host);
      refresh();
      return updated;
    },
    [refresh],
  );

  return { registries, loaded, error, refresh, logIn, logOut };
}
