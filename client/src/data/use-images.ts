import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { subscribeToReload } from './reload-signal';
import { fetchImages, type ImageSummary } from './images-client';
import { subscribeToDaemonEvents, type DaemonEvent } from './event-stream';
import { cadence } from '../timing/timing-scale';

const POLL_INTERVAL_MS = cadence(3000);

export interface UseImagesResult {
  images: ImageSummary[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Reads the image list, re-reading on a bounded poll and on every `image`
 * daemon event (REQ-37, REQ-38, REQ-39). Unlike the container list, no
 * exclusion set is needed here: a pull/push's per-layer progress arrives out
 * of band over its own stream, not through daemon events, so no "fires on
 * every step without changing the list" action exists to exclude.
 */
export function useImages(): UseImagesResult {
  const [images, setImages] = useState<ImageSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  // `readOnce` returns its promise so the reload signal can wait for it; `refresh` returns
  // nothing, the shape the screens use (plan-docker_management_app-refresh_cache/REQ-21).
  const readOnce = useCallback(() => {
    return fetchImages()
      .then((list) => {
        if (cancelledRef.current) return;
        setImages(list);
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

  useEffect(
    () =>
      subscribeToDaemonEvents((event: DaemonEvent) => {
        if (event.type === 'image') refresh();
      }),
    [refresh],
  );

  // Another context means another daemon: what is held here belongs to
  // the one left behind and is re-read at once (REQ-93).
  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  useEffect(() => subscribeToReload(readOnce), [readOnce]);

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { images, loaded, error, refresh };
}
