import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchContainerProcesses, type ContainerProcess } from './container-stats-client';

export interface UseContainerProcessesResult {
  processes: ContainerProcess[];
  titles: string[];
  loaded: boolean;
  loading: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads the processes running inside a container (REQ-33) once per `id`, and
 * again on demand: the listing is never polled, it is refreshed only when the
 * operator asks for it.
 */
export function useContainerProcesses(id: string | undefined): UseContainerProcessesResult {
  const [processes, setProcesses] = useState<ContainerProcess[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    if (!id) return;
    setLoading(true);
    fetchContainerProcesses(id)
      .then((result) => {
        if (cancelledRef.current) return;
        setProcesses(result.processes);
        setTitles(result.titles);
        setError(undefined);
      })
      .catch((cause: Error) => {
        if (cancelledRef.current) return;
        setProcesses([]);
        setError(cause.message);
      })
      .finally(() => {
        if (cancelledRef.current) return;
        setLoaded(true);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    cancelledRef.current = false;
    setProcesses([]);
    setTitles([]);
    setLoaded(false);
    setError(undefined);
    if (id) refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [id, refresh]);

  return { processes, titles, loaded, loading, error, refresh };
}
