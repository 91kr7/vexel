/**
 * The reporting service, stood in for, so a screen check can read what the
 * screen reported. Nothing can be read back from the real service — a report is
 * a toast and no list survives it (app-shell/specs/error-reporting-service.md) —
 * and what a screen owes is the report itself: the title it gives the failure
 * and the daemon's own message. What becomes of it is the service's own contract,
 * checked in `error-reporting-service.test.tsx`.
 *
 * Installed by the file under test:
 * `vi.mock('../../src/shell/services/ErrorReportingService', () => import('../support/error-reporting-mock'))`.
 */
import type { ReactNode } from 'react';

export interface ReportedFailure {
  title: string;
  detail?: string;
}

const reportedFailures: ReportedFailure[] = [];

/** Everything reported so far, as one string, for a check that names the daemon's words. */
export function reportedText(): string {
  return reportedFailures.map((failure) => `${failure.title} ${failure.detail ?? ''}`).join('\n');
}

/** Emptied between tests: what one test reported is no business of the next. */
export function forgetReportedFailures(): void {
  reportedFailures.length = 0;
}

export function ErrorReportingProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

// One identity for the life of the module, as the real service's is: an effect
// listing `reportError` among its dependencies must not re-run per render.
const reporter = {
  reportError: (title: string, detail?: string) => {
    reportedFailures.push({ title, detail });
  },
};

export function useErrorReporter() {
  return reporter;
}
