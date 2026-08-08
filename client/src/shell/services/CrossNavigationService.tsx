import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export interface CrossNavigationTarget {
  /** Id of the destination screen, as declared in the navigation data. */
  screenId: string;
  /** Object the destination screen should reveal, named in that screen's own terms. */
  objectId?: string;
  /** Position inside `objectId` the destination should open at (e.g. a layer index). */
  position?: number;
}

export interface CrossNavigationRequest extends CrossNavigationTarget {
  /** Distinguishes two consecutive requests for the same target, so the second one is still honored. */
  requestId: number;
}

interface CrossNavigationContextValue {
  request?: CrossNavigationRequest;
  navigateTo: (target: CrossNavigationTarget) => void;
  /** Acknowledges the pending request; the destination screen calls it once it has revealed the object. */
  consumeRequest: () => void;
}

const CrossNavigationContext = createContext<CrossNavigationContextValue | null>(null);

/**
 * Application-wide cross-screen navigation (REQ-68, REQ-69): a screen asks to
 * reach an object living on another screen, the shell switches to it, and the
 * destination screen reveals the object and acknowledges the request.
 */
export function CrossNavigationProvider({ children }: { children?: ReactNode }) {
  const [request, setRequest] = useState<CrossNavigationRequest | undefined>(undefined);
  const nextId = useRef(0);

  const navigateTo = useCallback((target: CrossNavigationTarget) => {
    setRequest({ ...target, requestId: nextId.current++ });
  }, []);

  const consumeRequest = useCallback(() => setRequest(undefined), []);

  const value = useMemo(() => ({ request, navigateTo, consumeRequest }), [request, navigateTo, consumeRequest]);

  return <CrossNavigationContext.Provider value={value}>{children}</CrossNavigationContext.Provider>;
}

/** Reach an object on another screen, or read the request addressed to this one. */
export function useCrossNavigation(): CrossNavigationContextValue {
  const context = useContext(CrossNavigationContext);
  if (!context) throw new Error('useCrossNavigation must be used within a CrossNavigationProvider');
  return context;
}
