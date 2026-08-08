import { useEffect, useState } from 'react';
import type { FilesystemExtractionResult } from './image-filesystem-client';

export type FilesystemExtractionProgress = { phase: 'creating' } | { phase: 'copying' } | { phase: 'indexing' };

export interface UseImageFilesystemExtractionResult {
  progress?: FilesystemExtractionProgress;
  result?: FilesystemExtractionResult;
  done: boolean;
  error?: string;
}

/**
 * Opens the filesystem extraction progress stream (REQ-52, REQ-55, REQ-113):
 * reports the creating/copying/indexing phases, then the extraction outcome
 * (entry count and whether it came from the cache), until the server reports
 * completion or failure. Passing `undefined` keeps the stream closed;
 * disconnecting (e.g. on unmount while `url` is set) cancels the in-flight
 * extraction server-side — the intermediate container is still cleaned up.
 */
export function useImageFilesystemExtraction(url: string | undefined): UseImageFilesystemExtractionResult {
  const [progress, setProgress] = useState<FilesystemExtractionProgress | undefined>(undefined);
  const [result, setResult] = useState<FilesystemExtractionResult | undefined>(undefined);
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
      setProgress(JSON.parse((event as MessageEvent).data) as FilesystemExtractionProgress);
    });
    source.addEventListener('result', (event) => {
      setResult(JSON.parse((event as MessageEvent).data) as FilesystemExtractionResult);
    });
    source.addEventListener('end', () => {
      source.close();
      setDone(true);
    });
    source.addEventListener('error', (event) => {
      const data = (event as MessageEvent).data as string | undefined;
      source.close();
      setDone(true);
      setError(data ? (JSON.parse(data) as { message: string }).message : 'The extraction was interrupted.');
    });

    return () => source.close();
  }, [url]);

  return { progress, result, done, error };
}
