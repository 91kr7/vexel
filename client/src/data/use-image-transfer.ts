import { useCallback, useEffect, useRef, useState } from 'react';

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

export type FileUploadStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export interface UseFileUploadResult<TResult> {
  status: FileUploadStatus;
  currentBytes: number;
  totalBytes: number;
  result?: TResult;
  error?: string;
  /** Starts uploading `file`'s raw bytes to `url` (`POST`), streamed straight from disk by the browser. */
  start: (url: string, file: File) => void;
  /** Aborts an in-flight upload; a no-op once it has finished. */
  cancel: () => void;
  /** Returns to the idle state, aborting an in-flight upload first. */
  reset: () => void;
}

interface FileUploadState {
  status: FileUploadStatus;
  currentBytes: number;
  totalBytes: number;
  result?: unknown;
  error?: string;
}

const IDLE_STATE: FileUploadState = { status: 'idle', currentBytes: 0, totalBytes: 0 };

async function extractErrorMessage(responseText: string, fallbackStatus: number): Promise<string> {
  try {
    const body = JSON.parse(responseText) as { error?: string };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // no JSON body; fall through to the generic message
  }
  return `Request failed with HTTP ${fallbackStatus}`;
}

/**
 * Uploads a local file with byte progress and a working cancel (REQ-42,
 * REQ-43): the app owns the bytes as it sends them, unlike a save/export
 * download, which the browser carries on its own. `XMLHttpRequest` is used
 * because it is the only browser transport reporting upload progress; the
 * `File` body is streamed from disk by the browser itself, never buffered
 * here.
 */
export function useFileUpload<TResult>(): UseFileUploadResult<TResult> {
  const [state, setState] = useState<FileUploadState>(IDLE_STATE);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const start = useCallback((url: string, file: File) => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    setState({ status: 'uploading', currentBytes: 0, totalBytes: file.size });

    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/x-tar');
    xhr.upload.addEventListener('progress', (event) => {
      const totalBytes = event.lengthComputable ? event.total : file.size;
      setState((current) => ({
        ...current,
        currentBytes: event.loaded,
        totalBytes,
        status: event.loaded >= totalBytes ? 'processing' : 'uploading',
      }));
    });
    xhr.addEventListener('load', () => {
      xhrRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        let result: unknown;
        try {
          result = xhr.responseText ? (JSON.parse(xhr.responseText) as unknown) : undefined;
        } catch {
          result = undefined;
        }
        setState((current) => ({ ...current, status: 'done', result }));
        return;
      }
      extractErrorMessage(xhr.responseText, xhr.status).then((message) => {
        setState((current) => ({ ...current, status: 'error', error: message }));
      });
    });
    xhr.addEventListener('error', () => {
      xhrRef.current = null;
      setState((current) => ({ ...current, status: 'error', error: 'The upload was interrupted.' }));
    });
    xhr.addEventListener('abort', () => {
      xhrRef.current = null;
    });
    xhr.send(file);
  }, []);

  const cancel = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setState((current) => (current.status === 'uploading' || current.status === 'processing' ? IDLE_STATE : current));
  }, []);

  const reset = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setState(IDLE_STATE);
  }, []);

  return { ...state, result: state.result as TResult | undefined, start, cancel, reset };
}
