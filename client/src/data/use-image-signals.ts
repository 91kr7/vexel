import { useEffect, useState } from 'react';
import type { LayerSignals } from './image-signals-client';

export type LayerSignalsProgress = { phase: 'exporting' } | { phase: 'analyzing'; completedLayers: number; totalLayers: number };

export interface UseImageSignalsStreamResult {
  progress?: LayerSignalsProgress;
  result?: LayerSignals;
  done: boolean;
  error?: string;
}

/**
 * Opens the layer-efficiency/secret-signal analysis progress stream (REQ-65,
 * REQ-66, REQ-67): shares the changeset job/cache of `useImageChangesetStream`
 * (REQ-49), reporting the same export/analysis progress, then the derived
 * findings, until the server reports completion or failure. Passing
 * `undefined` keeps the stream closed; disconnecting (e.g. on unmount while
 * `url` is set) cancels the in-flight analysis server-side.
 */
export function useImageSignalsStream(url: string | undefined): UseImageSignalsStreamResult {
  const [progress, setProgress] = useState<LayerSignalsProgress | undefined>(undefined);
  const [result, setResult] = useState<LayerSignals | undefined>(undefined);
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
      setProgress(JSON.parse((event as MessageEvent).data) as LayerSignalsProgress);
    });
    source.addEventListener('result', (event) => {
      setResult(JSON.parse((event as MessageEvent).data) as LayerSignals);
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
