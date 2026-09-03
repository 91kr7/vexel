import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import { useToast } from '../../ui';
import { useConnectionStatus } from './ConnectionStatusService';

interface ErrorReportingContextValue {
  reportError: (title: string, detail?: string) => void;
}

const ErrorReportingContext = createContext<ErrorReportingContextValue | null>(null);

/**
 * Application-wide failure reporting: feature code calls `reportError(title, detail)`
 * with the daemon's own message in `detail`, and one danger toast carries it
 * (plan-docker_management_app-inline_error_panels/REQ-5, /REQ-6, /REQ-7, /REQ-13).
 */
export function ErrorReportingProvider({ children }: { children?: ReactNode }) {
  const { push } = useToast();
  const { daemon } = useConnectionStatus();
  // Read through a ref so reachability changes never change `reportError`'s identity:
  // it sits in the dependencies of effects all over the feature code.
  const reachableRef = useRef(daemon.reachable);
  reachableRef.current = daemon.reachable;

  const reportError = useCallback(
    (title: string, detail?: string) => {
      if (!reachableRef.current) return;
      push({ title, message: detail, tone: 'danger' });
    },
    [push],
  );

  const value = useMemo(() => ({ reportError }), [reportError]);

  return <ErrorReportingContext.Provider value={value}>{children}</ErrorReportingContext.Provider>;
}

/** Report a failure from anywhere under an ErrorReportingProvider. */
export function useErrorReporter(): ErrorReportingContextValue {
  const context = useContext(ErrorReportingContext);
  if (!context) throw new Error('useErrorReporter must be used within an ErrorReportingProvider');
  return context;
}
