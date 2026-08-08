import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_PREFERENCES, fetchPreferences, savePreferences, type OperatorPreferences } from './preferences-client';

export interface UsePreferencesResult {
  preferences: OperatorPreferences;
  loaded: boolean;
  updatePreferences: (patch: Partial<OperatorPreferences>) => void;
}

/**
 * Loads persisted operator preferences once, then keeps the server in sync on every update
 * (REQ-115). An update issued before the initial read has settled is deferred, never dropped:
 * writing it straight away would race the read and let a default land on top of the stored record,
 * so it is accumulated and flushed as one write once the read settles — and it wins over what the
 * read returned, being the more recent intent.
 */
export function usePreferences(): UsePreferencesResult {
  const [preferences, setPreferences] = useState<OperatorPreferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const pendingPatchRef = useRef<Partial<OperatorPreferences>>({});

  useEffect(() => {
    let cancelled = false;
    fetchPreferences()
      .then((stored) => {
        if (cancelled) return;
        setPreferences({ ...stored, ...pendingPatchRef.current });
      })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        loadedRef.current = true;
        setLoaded(true);
        const pending = pendingPatchRef.current;
        pendingPatchRef.current = {};
        if (Object.keys(pending).length > 0) savePreferences(pending).catch(() => undefined);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePreferences = useCallback((patch: Partial<OperatorPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
    if (loadedRef.current) {
      savePreferences(patch).catch(() => undefined);
      return;
    }
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
  }, []);

  return { preferences, loaded, updatePreferences };
}
