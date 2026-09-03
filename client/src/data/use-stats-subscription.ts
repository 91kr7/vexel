import { useEffect } from 'react';

const SUBSCRIPTION_PATH = '/api/containers/stats/subscription';
// Tolerances, not cadences: how long a dropped gate is left alone before it is reopened.
// Shortened, every open window meets a restarting server at once.
const REOPEN_BASE_MS = 1000;
const REOPEN_MAX_MS = 15000;

function subscriptionUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}${SUBSCRIPTION_PATH}`;
}

/**
 * Holds a connection open for exactly as long as the sampled per-container
 * figures are being shown — mounted and tab visible — which is the whole of the
 * server's sampling gate
 * (plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-1, REQ-4).
 */
export function useStatsSubscription(): void {
  useEffect(() => {
    let socket: WebSocket | undefined;
    let reopenTimer: ReturnType<typeof setTimeout> | undefined;
    let drops = 0;

    const cancelReopen = () => {
      clearTimeout(reopenTimer);
      reopenTimer = undefined;
    };

    const open = () => {
      cancelReopen();
      if (socket) return;
      const opened = new WebSocket(subscriptionUrl());
      socket = opened;
      opened.addEventListener('open', () => {
        drops = 0;
      });
      opened.addEventListener('close', () => {
        // A close this hook asked for has already dropped its socket, so only a drop reaches the
        // reopen (plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-12, REQ-13).
        if (socket !== opened) return;
        socket = undefined;
        drops += 1;
        reopenTimer = setTimeout(open, Math.min(REOPEN_BASE_MS * 2 ** (drops - 1), REOPEN_MAX_MS));
      });
    };

    const close = () => {
      cancelReopen();
      const opened = socket;
      socket = undefined;
      opened?.close();
    };
    // Nothing is signalled at unload: a page that dies simply stops answering the server's ping,
    // so this is only an optimisation
    // (plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-19).
    const followVisibility = () => (document.visibilityState === 'visible' ? open() : close());

    followVisibility();
    document.addEventListener('visibilitychange', followVisibility);
    return () => {
      document.removeEventListener('visibilitychange', followVisibility);
      close();
    };
  }, []);
}
