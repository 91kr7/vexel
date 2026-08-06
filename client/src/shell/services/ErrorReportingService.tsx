import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export interface AppError {
  id: number;
  title: string;
  detail?: string;
}

interface ErrorReportingContextValue {
  errors: AppError[];
  reportError: (title: string, detail?: string) => void;
  dismissError: (id: number) => void;
}

const ErrorReportingContext = createContext<ErrorReportingContextValue | null>(null);

/**
 * Application-wide failure reporting (REQ-7): feature code calls
 * `reportError(title, detail)` with the daemon's own message in `detail`;
 * the shell renders it and the screen underneath stays usable.
 */
export function ErrorReportingProvider({ children }: { children?: ReactNode }) {
  const [errors, setErrors] = useState<AppError[]>([]);
  const nextId = useRef(0);

  const reportError = useCallback((title: string, detail?: string) => {
    const id = nextId.current++;
    setErrors((current) => [...current, { id, title, detail }]);
  }, []);

  const dismissError = useCallback((id: number) => {
    setErrors((current) => current.filter((error) => error.id !== id));
  }, []);

  const value = useMemo(() => ({ errors, reportError, dismissError }), [errors, reportError, dismissError]);

  return <ErrorReportingContext.Provider value={value}>{children}</ErrorReportingContext.Provider>;
}

/** Report and read the application-wide list of active failures. */
export function useErrorReporter(): ErrorReportingContextValue {
  const context = useContext(ErrorReportingContext);
  if (!context) throw new Error('useErrorReporter must be used within an ErrorReportingProvider');
  return context;
}
