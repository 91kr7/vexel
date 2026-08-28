// The application-wide "read it all again" broadcast, beside the
// active-context one. A view subscribes with its own read; one call raises the
// signal and ends only when every subscribed read has ended, which is what
// makes "the reload finished" mean "the screen has the data"
// (plan-docker_management_app-refresh_cache-manual_refresh/REQ-11, REQ-12).
// It carries no data and knows no Docker vocabulary.
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
 * Runs every subscribed read at once and settles when all of them have. A read
 * that fails is not allowed to abandon the others, and does not fail the
 * signal: the view keeps what it had and reports its own failure the way it
 * always does.
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
