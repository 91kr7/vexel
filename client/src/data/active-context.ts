// Broadcast of the active-context switch (REQ-93). Every cached view listens
// here so that, the moment another daemon becomes the active one, what it
// holds — read from the daemon left behind — is dropped and re-read instead of
// lingering until the next poll.
type ActiveContextListener = () => void;

const listeners = new Set<ActiveContextListener>();

/** Announces that another context has become the active one. */
export function notifyActiveContextChanged(): void {
  listeners.forEach((listener) => listener());
}

/** Registers `listener` to run on every active-context switch; returns the unsubscribe function. */
export function subscribeToActiveContextChange(listener: ActiveContextListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
