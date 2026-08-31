import { useCallback, useEffect, useRef, useState } from 'react';
import { composeLogsStreamUrl } from './compose-client';

export interface ComposeLogLine {
  seq: number;
  service: string;
  timestamp?: string;
  text: string;
}

export interface UseComposeLogsResult {
  lines: ComposeLogLine[];
  connected: boolean;
  ended: boolean;
  error?: string;
  clear: () => void;
  restart: () => void;
}

const DEFAULT_MAX_LINES = 5000;
const FLUSH_INTERVAL_MS = 100;
// Tolerances, not cadences: how long a dropped project log stream is left alone before it is reopened.
// Shortened, the retries storm a server that is not yet able to answer.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

/**
 * Subscribes to a compose project's aggregated log stream (REQ-78), each line
 * carrying its own service, with a bounded buffer, batched state updates and
 * reconnection after an unexpected drop.
 */
export function useComposeLogs(projectName: string | undefined, maxLines: number = DEFAULT_MAX_LINES): UseComposeLogsResult {
  const [lines, setLines] = useState<ComposeLogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  const bufferRef = useRef<ComposeLogLine[]>([]);
  const pendingRef = useRef<ComposeLogLine[]>([]);

  const clear = useCallback(() => {
    bufferRef.current = [];
    pendingRef.current = [];
    setLines([]);
  }, []);

  const restart = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    bufferRef.current = [];
    pendingRef.current = [];
    setLines([]);
    setEnded(false);
    setConnected(false);
    if (!projectName) return;

    let closed = false;
    let failures = 0;
    let source: EventSource | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      if (pendingRef.current.length === 0) return;
      bufferRef.current = [...bufferRef.current, ...pendingRef.current].slice(-maxLines);
      pendingRef.current = [];
      setLines(bufferRef.current);
    };
    const flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

    const open = () => {
      if (closed) return;
      const stream = new EventSource(composeLogsStreamUrl(projectName));
      source = stream;

      stream.addEventListener('open', () => {
        failures = 0;
        setConnected(true);
        setError(undefined);
      });
      stream.addEventListener('line', (event) => {
        pendingRef.current.push(JSON.parse((event as MessageEvent).data) as ComposeLogLine);
      });
      stream.addEventListener('end', () => {
        stream.close();
        flush();
        setConnected(false);
        setEnded(true);
      });
      stream.addEventListener('error', (event) => {
        const data = (event as MessageEvent).data as string | undefined;
        stream.close();
        setConnected(false);
        if (data) {
          flush();
          setError((JSON.parse(data) as { message: string }).message);
          return;
        }
        failures += 1;
        setError('The log stream was interrupted.');
        reconnectTimer = setTimeout(open, Math.min(RECONNECT_BASE_MS * 2 ** (failures - 1), RECONNECT_MAX_MS));
      });
    };

    open();

    return () => {
      closed = true;
      clearInterval(flushTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [projectName, maxLines, attempt]);

  return { lines, connected, ended, error, clear, restart };
}
