import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { subscribeToReload } from './reload-signal';
import { subscribeToDaemonEvents, type DaemonEvent } from './event-stream';
import { fetchSystemOverview, type SystemOverview } from './system-client';

/** The object types whose appearance, removal or state change moves a number on the overview. */
const RELEVANT_EVENT_TYPES = new Set(['container', 'image', 'volume', 'network', 'builder', 'service']);

/**
 * Container actions that fire on every terminal resize or exec lifecycle step
 * but move nothing on the overview — excluded so an open exec/attach session
 * does not drive a re-read loop, as the container list already excludes them.
 */
const ACTIONS_NOT_AFFECTING_OVERVIEW = new Set(['resize', 'exec_create', 'exec_start', 'exec_die', 'exec_detach', 'top']);

/** A burst of events — a compose up, a prune — is coalesced into a single re-read. */
const EVENT_COALESCE_MS = 750;

export interface UseSystemOverviewResult {
  overview?: SystemOverview;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * Holds the dashboard's overview of the host (REQ-14, REQ-16), re-reading it
 * whenever a daemon event says one of its numbers has moved.
 *
 * It does not poll: the reading behind it is the daemon's own disk-usage
 * accounting, expensive on a large host, and a dashboard left open all day
 * must not keep the daemon busy computing it. What changes fast — a
 * container's state, its CPU, its uptime — is not read here at all: the
 * container list hook already follows that, live.
 */
export function useSystemOverview(): UseSystemOverviewResult {
  const [overview, setOverview] = useState<SystemOverview | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  // `readOnce` returns its promise so the reload signal can wait for it; `refresh` returns
  // nothing, the shape the screens use (plan-docker_management_app-refresh_cache/REQ-21).
  const readOnce = useCallback(() => {
    return fetchSystemOverview()
      .then((next) => {
        if (cancelledRef.current) return;
        setOverview(next);
        setError(undefined);
      })
      .catch((cause: Error) => {
        if (cancelledRef.current) return;
        setError(cause.message);
      })
      .finally(() => {
        if (cancelledRef.current) return;
        setLoaded(true);
      });
  }, []);

  const refresh = useCallback(() => {
    void readOnce();
  }, [readOnce]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = subscribeToDaemonEvents((event: DaemonEvent) => {
      if (!RELEVANT_EVENT_TYPES.has(event.type)) return;
      if (event.type === 'container' && ACTIONS_NOT_AFFECTING_OVERVIEW.has(event.action)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, EVENT_COALESCE_MS);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [refresh]);

  // Another context means another daemon: what is held here belongs to
  // the one left behind and is re-read at once (REQ-93).
  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  useEffect(() => subscribeToReload(readOnce), [readOnce]);

  return { overview, loaded, error, refresh };
}
