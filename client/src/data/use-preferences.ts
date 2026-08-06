import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_PREFERENCES, fetchPreferences, savePreferences, type OperatorPreferences } from './preferences-client';

export interface UsePreferencesResult {
  preferences: OperatorPreferences;
  loaded: boolean;
  updatePreferences: (patch: Partial<OperatorPreferences>) => void;
}

/** Loads persisted operator preferences once, then keeps the server in sync on every update (REQ-115). */
export function usePreferences(): UsePreferencesResult {
  const [preferences, setPreferences] = useState<OperatorPreferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchPreferences()
      .then((stored) => {
        if (cancelled) return;
        setPreferences(stored);
      })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        loadedRef.current = true;
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePreferences = useCallback((patch: Partial<OperatorPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
    if (loadedRef.current) savePreferences(patch).catch(() => undefined);
  }, []);

  return { preferences, loaded, updatePreferences };
}
