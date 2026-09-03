import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToReload } from './reload-signal';
import { fetchContainerProcesses, type ContainerProcess } from './container-stats-client';
import { useKeptReading } from './use-kept-reading';
import { cadence } from '../timing/timing-scale';

const POLL_INTERVAL_MS = cadence(3000);

export interface UseContainerProcessesOptions {
  /** Whether the container is running: a container that is not is asked for nothing at all. */
  running?: boolean;
}

export interface UseContainerProcessesResult {
  processes: ContainerProcess[];
  titles: string[];
  loaded: boolean;
  loading: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads the processes running inside a container (REQ-33), on the same 3 s clock as the inspect
 * data beside it, while the view holding it is on screen and the container is running
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-27).
 */
export function useContainerProcesses(id: string | undefined, { running = true }: UseContainerProcessesOptions = {}): UseContainerProcessesResult {
  const [processes, keepProcesses] = useKeptReading<ContainerProcess[]>([]);
  const [titles, keepTitles] = useKeptReading<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  // `readOnce` returns its promise so the reload signal can wait for it; `refresh` returns
  // nothing, the shape the screens use (plan-docker_management_app-refresh_cache/REQ-21).
  const readOnce = useCallback(() => {
    if (!id) return;
    setLoading(true);
    return fetchContainerProcesses(id)
      .then((result) => {
        if (cancelledRef.current) return;
        // A listing equal to the one in hand replaces nothing, so the operator's place in a long
        // table is kept (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-29).
        keepProcesses(result.processes);
        keepTitles(result.titles);
        setError(undefined);
      })
      .catch((cause: Error) => {
        if (cancelledRef.current) return;
        setError(cause.message);
      })
      .finally(() => {
        if (cancelledRef.current) return;
        setLoaded(true);
        setLoading(false);
      });
  }, [id, keepProcesses, keepTitles]);

  const refresh = useCallback(() => {
    void readOnce();
  }, [readOnce]);

  useEffect(() => {
    cancelledRef.current = false;
    keepProcesses([]);
    keepTitles([]);
    setLoaded(false);
    setError(undefined);
    return () => {
      cancelledRef.current = true;
    };
  }, [id, keepProcesses, keepTitles]);

  // The clock and the read that opens it, both scoped to the view holding them — drawn only while
  // the Processes tab is the active one — and to a running container
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-27, REQ-28).
  useEffect(() => {
    if (!id) return;
    if (!running) {
      keepProcesses([]);
      keepTitles([]);
      setError(undefined);
      setLoaded(true);
      return;
    }
    refresh();
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [id, running, refresh, keepProcesses, keepTitles]);

  useEffect(() => subscribeToReload(readOnce), [readOnce]);

  return { processes, titles, loaded, loading, error, refresh };
}
