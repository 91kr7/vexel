import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToReload } from './reload-signal';
import { fetchImageInspect, type ImageInspect } from './images-client';

export interface UseImageInspectResult {
  inspect?: ImageInspect;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads a single image's inspect data (REQ-40), re-reading when `id` changes. Returns an empty
 * result when `id` is undefined (no image selected).
 */
export function useImageInspect(id: string | undefined): UseImageInspectResult {
  const [inspect, setInspect] = useState<ImageInspect | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  // `readOnce` returns its promise so the reload signal can wait for it; `refresh` returns
  // nothing, the shape the screens use (plan-docker_management_app-refresh_cache/REQ-21).
  const readOnce = useCallback(() => {
    if (!id) return;
    return fetchImageInspect(id)
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

  const refresh = useCallback(() => {
    void readOnce();
  }, [readOnce]);

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

  useEffect(() => subscribeToReload(readOnce), [readOnce]);

  return { inspect, loaded, error, refresh };
}
