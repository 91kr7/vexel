import { useEffect, useState } from 'react';

export interface ImageTransferStep {
  id: string;
  status: string;
  currentBytes?: number;
  totalBytes?: number;
}

export interface UseImageTransferStreamResult {
  steps: ImageTransferStep[];
  done: boolean;
  error?: string;
}

/**
 * Opens the given pull/push progress stream URL (REQ-38, REQ-39) and collects
 * per-layer steps, keeping each step id's most recent state, until the daemon
 * reports completion or failure. Passing `undefined` keeps the stream closed.
 */
export function useImageTransferStream(url: string | undefined): UseImageTransferStreamResult {
  const [steps, setSteps] = useState<ImageTransferStep[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setSteps([]);
    setDone(false);
    setError(undefined);
    if (!url) return;

    const source = new EventSource(url);

    source.addEventListener('step', (event) => {
      const step = JSON.parse((event as MessageEvent).data) as ImageTransferStep;
      setSteps((current) => {
        const index = current.findIndex((existing) => existing.id === step.id);
        if (index === -1) return [...current, step];
        const next = [...current];
        next[index] = step;
        return next;
      });
    });
    source.addEventListener('end', () => {
      source.close();
      setDone(true);
    });
    source.addEventListener('error', (event) => {
      const data = (event as MessageEvent).data as string | undefined;
      source.close();
      setDone(true);
      setError(data ? (JSON.parse(data) as { message: string }).message : 'The transfer was interrupted.');
    });

    return () => source.close();
  }, [url]);

  return { steps, done, error };
}
