import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchImageBuildCacheTrace, type ImageBuildCacheTrace } from './image-layers-client';

export interface UseImageBuildCacheTraceResult {
  trace?: ImageBuildCacheTrace;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads the layer-to-build-cache association of a single image (REQ-68),
 * re-reading when `id` changes. Returns an empty result when `id` is
 * undefined (no image selected / explorer closed). A layer whose association
 * does not exist is not an error: it arrives carrying its own reason.
 */
export function useImageBuildCacheTrace(id: string | undefined): UseImageBuildCacheTraceResult {
  const [trace, setTrace] = useState<ImageBuildCacheTrace | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);

  const refresh = useCallback(() => {
    if (!id) return;
    // Each read owns its controller and aborts the one it supersedes, so a
    // slower answer for a previous image can neither arrive nor overwrite the
    // current one. A boolean shared across reads cannot express that.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchImageBuildCacheTrace(id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setTrace(result);
        setError(undefined);
        setLoaded(true);
      })
      .catch((cause: Error) => {
        if (controller.signal.aborted) return;
        setError(cause.message);
        setLoaded(true);
      });
  }, [id]);

  useEffect(() => {
    setTrace(undefined);
    setLoaded(false);
    setError(undefined);
    if (id) refresh();
    return () => {
      abortRef.current?.abort();
    };
  }, [id, refresh]);

  return { trace, loaded, error, refresh };
}
