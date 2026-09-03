import { useEffect, useRef } from 'react';
import { useErrorReporter } from './ErrorReportingService';

/**
 * Reports a failure a view holds as state — a read that failed, a transfer that failed — once per
 * occurrence: the same message still standing across a re-render reports nothing, and the same
 * message arriving again after the state was cleared reports again
 * (plan-docker_management_app-inline_error_panels/REQ-5, /REQ-6).
 */
export function useFailureReport(title: string, message: string | undefined): void {
  const { reportError } = useErrorReporter();
  const reported = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!message) {
      reported.current = undefined;
      return;
    }
    if (reported.current === message) return;
    reported.current = message;
    reportError(title, message);
  }, [title, message, reportError]);
}
