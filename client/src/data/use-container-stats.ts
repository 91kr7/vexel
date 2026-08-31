import { useCallback, useEffect, useRef, useState } from 'react';
import { containerStatsStreamUrl, type ContainerStatsSample } from './container-stats-client';

export interface UseContainerStatsOptions {
  /** Upper bound of the retained history; the oldest samples are dropped past it. */
  maxSamples?: number;
  /** When false no stream is opened, and an open one is closed. */
  enabled?: boolean;
}

export interface UseContainerStatsResult {
  latest?: ContainerStatsSample;
  samples: ContainerStatsSample[];
  connected: boolean;
  ended: boolean;
  error?: string;
  restart: () => void;
}

const DEFAULT_MAX_SAMPLES = 60;
const FLUSH_INTERVAL_MS = 250;
// Tolerances, not cadences: how long a dropped statistics stream is left alone before it is reopened.
// Shortened, the retries storm a server that is not yet able to answer.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

/**
 * Subscribes to a container's live resource usage (REQ-32) keeping a bounded
 * sample history for the sparklines. Samples are applied in batches rather
 * than one state update each, and the stream is closed as soon as the caller
 * unmounts, changes container or disables it.
 */
export function useContainerStats(id: string | undefined, options: UseContainerStatsOptions = {}): UseContainerStatsResult {
  const { maxSamples = DEFAULT_MAX_SAMPLES, enabled = true } = options;
  const [samples, setSamples] = useState<ContainerStatsSample[]>([]);
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  const historyRef = useRef<ContainerStatsSample[]>([]);
  const pendingRef = useRef<ContainerStatsSample[]>([]);

  const restart = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    historyRef.current = [];
    pendingRef.current = [];
    setSamples([]);
    setEnded(false);
    setConnected(false);
    if (!id || !enabled) return;

    let closed = false;
    let failures = 0;
    let source: EventSource | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      if (pendingRef.current.length === 0) return;
      historyRef.current = [...historyRef.current, ...pendingRef.current].slice(-maxSamples);
      pendingRef.current = [];
      setSamples(historyRef.current);
    };
    const flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

    const open = () => {
      if (closed) return;
      const stream = new EventSource(containerStatsStreamUrl(id));
      source = stream;

      stream.addEventListener('open', () => {
        failures = 0;
        setConnected(true);
        setError(undefined);
      });
      stream.addEventListener('sample', (event) => {
        pendingRef.current.push(JSON.parse((event as MessageEvent).data) as ContainerStatsSample);
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
        setError('The stats stream was interrupted.');
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
  }, [id, enabled, maxSamples, attempt]);

  return { latest: samples[samples.length - 1], samples, connected, ended, error, restart };
}
