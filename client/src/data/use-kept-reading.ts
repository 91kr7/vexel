import { useCallback, useState } from 'react';

interface KeptReading<T> {
  value: T;
  serialised: string | undefined;
}

export type KeepReading<T> = (arrived: T) => void;

/**
 * Holds a reading together with its serialisation, so a reading equal to the one in hand replaces
 * nothing and a tick serialises only what arrived
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-47, REQ-49).
 */
export function useKeptReading<T>(initial: T): [T, KeepReading<T>] {
  const [kept, setKept] = useState<KeptReading<T>>(() => ({ value: initial, serialised: JSON.stringify(initial) }));

  const keep = useCallback<KeepReading<T>>((arrived) => {
    // Serialised outside the updater: React may run that one twice, and once is the whole rule.
    const serialised = JSON.stringify(arrived);
    setKept((current) => (current.serialised === serialised ? current : { value: arrived, serialised }));
  }, []);

  return [kept.value, keep];
}
