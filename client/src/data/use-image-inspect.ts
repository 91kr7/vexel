import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchImageInspect, type ImageInspect } from './images-client';
import { subscribeToDaemonEvents, type DaemonEvent } from './event-stream';

export interface UseImageInspectResult {
  inspect?: ImageInspect;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads a single image's inspect data (REQ-40), re-reading when `id` changes
 * and whenever an `image` daemon event arrives. Returns an empty result when
 * `id` is undefined (no image selected).
 */
export function useImageInspect(id: string | undefined): UseImageInspectResult {
  const [inspect, setInspect] = useState<ImageInspect | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    if (!id) return;
    fetchImageInspect(id)
      .then((result) => {
        if (cancelledRef.current) return;
        setInspect(result);
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
  }, [id]);

  useEffect(() => {
    cancelledRef.current = false;
    setInspect(undefined);
    setLoaded(false);
    setError(undefined);
    if (id) refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [id, refresh]);

  useEffect(
    () =>
      subscribeToDaemonEvents((event: DaemonEvent) => {
        if (event.type === 'image') refresh();
      }),
    [refresh],
  );

  return { inspect, loaded, error, refresh };
}
