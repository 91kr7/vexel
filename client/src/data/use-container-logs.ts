import { useCallback, useEffect, useRef, useState } from 'react';
import { containerLogStreamUrl, type ContainerLogLine, type ContainerLogOptions } from './container-logs-client';

export interface UseContainerLogsOptions extends ContainerLogOptions {
  /** Upper bound of the buffer; the oldest lines are dropped past it. */
  maxLines?: number;
}

export interface UseContainerLogsResult {
  lines: ContainerLogLine[];
  connected: boolean;
  ended: boolean;
  error?: string;
  clear: () => void;
  restart: () => void;
  snapshot: () => ContainerLogLine[];
}

const DEFAULT_MAX_LINES = 5000;
const FLUSH_INTERVAL_MS = 100;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

/**
 * Subscribes to a container's log stream (REQ-30, REQ-31) with a bounded
 * buffer, batched state updates so a fast-talking container cannot starve the
 * UI, and reconnection after an unexpected drop.
 */
export function useContainerLogs(id: string | undefined, options: UseContainerLogsOptions = {}): UseContainerLogsResult {
  const { maxLines = DEFAULT_MAX_LINES, stdout, stderr, follow, timestamps, tail, since, until } = options;
  const [lines, setLines] = useState<ContainerLogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  const bufferRef = useRef<ContainerLogLine[]>([]);
  const pendingRef = useRef<ContainerLogLine[]>([]);

  const clear = useCallback(() => {
    bufferRef.current = [];
    pendingRef.current = [];
    setLines([]);
  }, []);

  const restart = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  const snapshot = useCallback(() => {
    return pendingRef.current.length === 0 ? bufferRef.current : [...bufferRef.current, ...pendingRef.current].slice(-maxLines);
  }, [maxLines]);

  useEffect(() => {
    bufferRef.current = [];
    pendingRef.current = [];
    setLines([]);
    setEnded(false);
    setConnected(false);
    if (!id) return;

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
      const stream = new EventSource(containerLogStreamUrl(id, { stdout, stderr, follow, timestamps, tail, since, until }));
      source = stream;

      stream.addEventListener('open', () => {
        failures = 0;
        setConnected(true);
        setError(undefined);
      });
      stream.addEventListener('line', (event) => {
        pendingRef.current.push(JSON.parse((event as MessageEvent).data) as ContainerLogLine);
      });
      stream.addEventListener('end', () => {
        stream.close();
        flush();
        setConnected(false);
        setEnded(true);
      });
      stream.addEventListener('error', (event) => {
        // A payload-carrying `error` event is the server reporting a daemon
        // failure; a bare one is the browser reporting a dropped connection.
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
  }, [id, maxLines, stdout, stderr, follow, timestamps, tail, since, until, attempt]);

  return { lines, connected, ended, error, clear, restart, snapshot };
}
