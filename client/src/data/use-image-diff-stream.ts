import { useEffect, useState } from 'react';
import type { ImageFilesystemDiff } from './image-diff-client';
import type { FilesystemExtractionProgress } from './use-image-filesystem-extraction';

export type ImageDiffProgress =
  | { phase: 'extracting'; side: 'a' | 'b'; extraction: FilesystemExtractionProgress }
  | { phase: 'comparing'; comparedPaths: number; totalPaths: number };

export interface UseImageDiffStreamResult {
  progress?: ImageDiffProgress;
  result?: ImageFilesystemDiff;
  done: boolean;
  error?: string;
}

/**
 * Opens the cross-image diff comparison progress stream (REQ-63, REQ-64):
 * reports each side's extraction progress (when it was not already cached),
 * then comparison progress, then the full diff result, until the server
 * reports completion or failure. Passing `undefined` keeps the stream
 * closed; disconnecting cancels the in-flight comparison server-side.
 */
export function useImageDiffStream(url: string | undefined): UseImageDiffStreamResult {
  const [progress, setProgress] = useState<ImageDiffProgress | undefined>(undefined);
  const [result, setResult] = useState<ImageFilesystemDiff | undefined>(undefined);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setProgress(undefined);
    setResult(undefined);
    setDone(false);
    setError(undefined);
    if (!url) return;

    const source = new EventSource(url);

    source.addEventListener('progress', (event) => {
      setProgress(JSON.parse((event as MessageEvent).data) as ImageDiffProgress);
    });
    source.addEventListener('result', (event) => {
      setResult(JSON.parse((event as MessageEvent).data) as ImageFilesystemDiff);
    });
    source.addEventListener('end', () => {
      source.close();
      setDone(true);
    });
    source.addEventListener('error', (event) => {
      const data = (event as MessageEvent).data as string | undefined;
      source.close();
      setDone(true);
      setError(data ? (JSON.parse(data) as { message: string }).message : 'The comparison was interrupted.');
    });

    return () => source.close();
  }, [url]);

  return { progress, result, done, error };
}
