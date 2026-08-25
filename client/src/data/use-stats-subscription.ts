import { useEffect } from 'react';

const SUBSCRIPTION_URL = '/api/containers/stats/subscription';

/**
 * Holds a connection open for exactly as long as the sampled per-container
 * figures are being shown — mounted and tab visible — which is the whole of the
 * server's sampling gate (plan-docker_management_app-containers_card_view/REQ-48).
 */
export function useStatsSubscription(): void {
  useEffect(() => {
    let source: EventSource | undefined;

    const open = () => {
      if (!source) source = new EventSource(SUBSCRIPTION_URL);
    };
    const close = () => {
      source?.close();
      source = undefined;
    };
    // Nothing is signalled at unload: a page that dies simply stops answering
    // the server's periodic write, so this is only an optimisation
    // (plan-docker_management_app-containers_card_view/REQ-49).
    const followVisibility = () => (document.visibilityState === 'visible' ? open() : close());

    followVisibility();
    document.addEventListener('visibilitychange', followVisibility);
    return () => {
      document.removeEventListener('visibilitychange', followVisibility);
      close();
    };
  }, []);
}
