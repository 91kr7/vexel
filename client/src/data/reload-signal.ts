// The application-wide "read it all again" broadcast: one call ends only when every subscribed read
// has ended (plan-docker_management_app-refresh_cache-manual_refresh/REQ-11, REQ-12).
import { isChannelDelivering, subscribeToChannelDelivery } from './live-channel';

type ReloadListener = () => void | Promise<unknown>;

const listeners = new Set<ReloadListener>();

/** Registers `listener` to run on every reload; returns the unsubscribe function. */
export function subscribeToReload(listener: ReloadListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Runs every subscribed read at once and settles when all of them have; a read that fails abandons
 * neither the others nor the signal, and reports itself the way it always does.
 */
export async function requestReload(): Promise<void> {
  await Promise.all(
    [...listeners].map(async (listener) => {
      try {
        await listener();
      } catch {
        // Nothing to add here: the read that threw already owns its error state.
      }
    }),
  );
}

/**
 * Raises one reload each time the live channel starts delivering again; the first open is a
 * start-up and raises none (plan-docker_management_app-inline_error_panels/REQ-12).
 */
export function reloadWhenChannelReturns(): () => void {
  let delivering = isChannelDelivering();
  let hasDelivered = delivering;
  return subscribeToChannelDelivery((next) => {
    const returned = next && !delivering && hasDelivered;
    delivering = next;
    hasDelivered ||= next;
    if (returned) void requestReload();
  });
}
