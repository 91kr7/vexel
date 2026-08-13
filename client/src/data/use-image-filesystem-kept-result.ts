import { useCallback, useEffect, useState } from 'react';
import { fetchKeptImageFilesystem, type FilesystemExtractionResult } from './image-filesystem-client';

export interface UseImageFilesystemKeptResult {
  /** The kept result's own figures, or `undefined` when nothing is kept, the answer is not in yet, or it has been discarded. */
  summary: FilesystemExtractionResult | undefined;
  /** True once the read has come back, whichever way. `answered && !summary` is the "nothing kept" answer. */
  answered: boolean;
  /** The read is in flight: the caller shows an actionless indication and asks the operator for nothing. */
  loading: boolean;
  /** Reports the kept result as no longer usable — unreadable on the follow-up read, or superseded by an extraction the caller just started. */
  discard: () => void;
}

/**
 * Whether an extraction result is still kept for this image's content
 * (filesystem_browse_direct/REQ-4, REQ-6, REQ-14, REQ-16): the free read the
 * filesystem browser decides its two shapes on, before anything is raised.
 *
 * A failed read answers exactly like "nothing kept" — `answered` with no
 * `summary` — so the flow degrades to the cost warning rather than to a dead
 * end. The same is true once `discard` is called.
 */
export function useImageFilesystemKeptResult(imageId: string | undefined): UseImageFilesystemKeptResult {
  const [summary, setSummary] = useState<FilesystemExtractionResult>();
  const [answered, setAnswered] = useState(false);
  const [loading, setLoading] = useState(false);

  const discard = useCallback(() => {
    setSummary(undefined);
  }, []);

  useEffect(() => {
    setSummary(undefined);
    setAnswered(false);
    if (!imageId) return;
    let cancelled = false;
    setLoading(true);
    fetchKeptImageFilesystem(imageId)
      .then((answer) => {
        if (!cancelled && answer.kept) setSummary(answer.summary);
      })
      .catch(() => {
        // An unanswerable read is not a kept result: the caller offers the extraction with its cost.
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setAnswered(true);
      });
    return () => {
      cancelled = true;
    };
  }, [imageId]);

  return { summary, answered, loading, discard };
}
