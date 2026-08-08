import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchComposeProjects, type ComposeProjectSummary } from './compose-client';
import { subscribeToDaemonEvents, type DaemonEvent } from './event-stream';

const POLL_INTERVAL_MS = 3000;

export interface UseComposeProjectsResult {
  projects: ComposeProjectSummary[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads the compose project list, re-reading on a bounded poll and on every
 * `container` daemon event (compose projects are made of containers) (REQ-75).
 */
export function useComposeProjects(): UseComposeProjectsResult {
  const [projects, setProjects] = useState<ComposeProjectSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    fetchComposeProjects()
      .then((list) => {
        if (cancelledRef.current) return;
        setProjects(list);
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

  useEffect(
    () =>
      subscribeToDaemonEvents((event: DaemonEvent) => {
        if (event.type === 'container') refresh();
      }),
    [refresh],
  );

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { projects, loaded, error, refresh };
}
