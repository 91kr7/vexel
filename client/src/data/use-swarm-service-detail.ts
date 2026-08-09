import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { subscribeToDaemonEvents, type DaemonEvent } from './event-stream';
import { fetchSwarmServiceDetail, type SwarmServiceDetail } from './swarm-client';

export interface UseSwarmServiceDetailResult {
  detail?: SwarmServiceDetail;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * The full reading of the opened swarm service together with its tasks
 * (REQ-82). Changing the opened service drops the previous reading at once, so
 * one service's tasks are never shown under another's name.
 */
export function useSwarmServiceDetail(serviceId?: string): UseSwarmServiceDetailResult {
  const [detail, setDetail] = useState<SwarmServiceDetail | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const requestedRef = useRef<string | undefined>(undefined);

  const refresh = useCallback(() => {
    const requested = requestedRef.current;
    if (!requested) return;
    fetchSwarmServiceDetail(requested)
      .then((next) => {
        if (requestedRef.current !== requested) return;
        // A payload without a service or without a task list is a failed read
        // like any other: it is reported, never stored, so the panel is never
        // handed something it cannot render.
        if (!next?.service || !Array.isArray(next.tasks) || !Array.isArray(next.env)) {
          throw new Error('The server did not answer with a service and its tasks.');
        }
        setDetail(next);
        setError(undefined);
      })
      .catch((cause: Error) => {
        if (requestedRef.current !== requested) return;
        setError(cause.message);
      })
      .finally(() => {
        if (requestedRef.current !== requested) return;
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    requestedRef.current = serviceId;
    setDetail(undefined);
    setError(undefined);
    setLoaded(false);
    if (serviceId) refresh();
    return () => {
      requestedRef.current = undefined;
    };
  }, [serviceId, refresh]);

  useEffect(
    () =>
      subscribeToDaemonEvents((event: DaemonEvent) => {
        if (event.type === 'service') refresh();
      }),
    [refresh],
  );

  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  return { detail, loaded, error, refresh };
}
