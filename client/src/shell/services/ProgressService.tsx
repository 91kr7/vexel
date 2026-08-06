import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export interface PendingOperation {
  id: number;
  label: string;
}

interface ProgressContextValue {
  pending: PendingOperation[];
  run: <T>(label: string, task: () => Promise<T>) => Promise<T>;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

/**
 * Application-wide pending/progress tracking (REQ-8): feature code wraps a
 * non-instantaneous operation with `run(label, task)`; the shell shows a
 * pending indication while it runs, without blocking navigation.
 */
export function ProgressProvider({ children }: { children?: ReactNode }) {
  const [pending, setPending] = useState<PendingOperation[]>([]);
  const nextId = useRef(0);

  const run = useCallback(async <T,>(label: string, task: () => Promise<T>): Promise<T> => {
    const id = nextId.current++;
    setPending((current) => [...current, { id, label }]);
    try {
      return await task();
    } finally {
      setPending((current) => current.filter((operation) => operation.id !== id));
    }
  }, []);

  const value = useMemo(() => ({ pending, run }), [pending, run]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

/** Run an operation while the shell shows a non-blocking pending indication. */
export function useProgress(): ProgressContextValue {
  const context = useContext(ProgressContext);
  if (!context) throw new Error('useProgress must be used within a ProgressProvider');
  return context;
}
