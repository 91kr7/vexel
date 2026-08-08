import { useEffect, useState } from 'react';
import type { ImageChangesets } from './image-layers-client';

export type ChangesetProgress = { phase: 'exporting' } | { phase: 'analyzing'; completedLayers: number; totalLayers: number };

export interface UseImageChangesetStreamResult {
  progress?: ChangesetProgress;
  result?: ImageChangesets;
  done: boolean;
  error?: string;
}

/**
 * Opens the changeset analysis progress stream (REQ-49, REQ-51): reports
 * export/analysis progress, then the full per-layer changesets, until the
 * server reports completion or failure. Passing `undefined` keeps the
 * stream closed; disconnecting (e.g. on unmount while `url` is set) cancels
 * the in-flight analysis server-side.
 */
export function useImageChangesetStream(url: string | undefined): UseImageChangesetStreamResult {
  const [progress, setProgress] = useState<ChangesetProgress | undefined>(undefined);
  const [result, setResult] = useState<ImageChangesets | undefined>(undefined);
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
      setProgress(JSON.parse((event as MessageEvent).data) as ChangesetProgress);
    });
    source.addEventListener('result', (event) => {
      setResult(JSON.parse((event as MessageEvent).data) as ImageChangesets);
    });
    source.addEventListener('end', () => {
      source.close();
      setDone(true);
    });
    source.addEventListener('error', (event) => {
      const data = (event as MessageEvent).data as string | undefined;
      source.close();
      setDone(true);
      setError(data ? (JSON.parse(data) as { message: string }).message : 'The analysis was interrupted.');
    });

    return () => source.close();
  }, [url]);

  return { progress, result, done, error };
}
