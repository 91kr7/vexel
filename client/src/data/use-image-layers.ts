import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchImageLayerStack, type ImageLayerStack } from './image-layers-client';

export interface UseImageLayerStackResult {
  stack?: ImageLayerStack;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads a single image's layer stack (REQ-47, REQ-48, REQ-50), re-reading when `id` changes.
 * Returns an empty result when `id` is undefined (no image selected / explorer closed).
 */
export function useImageLayerStack(id: string | undefined): UseImageLayerStackResult {
  const [stack, setStack] = useState<ImageLayerStack | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    if (!id) return;
    fetchImageLayerStack(id)
      .then((result) => {
        if (cancelledRef.current) return;
        setStack(result);
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
    setStack(undefined);
    setLoaded(false);
    setError(undefined);
    if (id) refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [id, refresh]);

  return { stack, loaded, error, refresh };
}
