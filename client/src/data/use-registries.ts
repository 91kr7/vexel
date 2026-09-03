import { useCallback, useSyncExternalStore } from 'react';
import {
  loginToRegistry,
  logoutFromRegistry,
  type RegistryLoginInput,
  type RegistrySummary,
} from './registries-client';
import { usePushedValue } from './pushed-values';
import { isChannelDelivering, reconnectLiveChannel, subscribeToChannelDelivery } from './live-channel';

/** The name the server gives the registries inventory on the channel. */
const REGISTRIES = 'registries';

/** One reference for every render before the first delivery, so nothing re-renders on it. */
const NONE: RegistrySummary[] = [];

export interface UseRegistriesResult {
  registries: RegistrySummary[];
  loaded: boolean;
  error?: string;
  refresh: () => void;
  logIn: (input: RegistryLoginInput) => Promise<RegistrySummary>;
  logOut: (host: string) => Promise<RegistrySummary>;
}

/**
 * Reads the configured registries from the live channel — no clock, no request of its own
 * (REQ-17, REQ-33, REQ-39) — and drives log in / log out, whose results reach the inventory as the
 * pushes the server's own operations cause (REQ-25). The secret passed to `logIn` is forwarded to
 * the server and kept nowhere: this hook holds no credential state of any kind.
 */
export function useRegistries(): UseRegistriesResult {
  const delivered = usePushedValue<RegistrySummary[]>(REGISTRIES);
  const delivering = useSyncExternalStore(subscribeToChannelDelivery, isChannelDelivering);
  // A delivery that is not a list is reported and never shown, so no consumer is handed a non-list.
  const malformed = delivered !== undefined && !Array.isArray(delivered);

  // What failed is the channel, so what a retry does is ask for it again (REQ-18).
  const refresh = useCallback(() => {
    if (!isChannelDelivering()) reconnectLiveChannel();
  }, []);

  return {
    registries: malformed || delivered === undefined ? NONE : delivered,
    loaded: delivered !== undefined,
    error: !delivering
      ? 'Could not reach the application server.'
      : malformed
        ? 'The server did not answer with a list of registries.'
        : undefined,
    refresh,
    logIn: loginToRegistry,
    logOut: logoutFromRegistry,
  };
}
