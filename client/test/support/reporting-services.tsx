/**
 * The reporting services in the order the application wires them
 * (app-shell/specs/app.md): a reported failure is raised as a toast and is
 * dropped while nothing is reachable, so the toast service and the connection
 * status both sit above the reporter.
 */
import { act, type ReactNode } from 'react';
import { ConnectionStatusProvider } from '../../src/shell/services/ConnectionStatusService';
import { ErrorReportingProvider } from '../../src/shell/services/ErrorReportingService';
import { ToastProvider } from '../../src/ui';

export function ReportingServices({ children }: { children?: ReactNode }) {
  return (
    <ToastProvider>
      <ConnectionStatusProvider>
        <ErrorReportingProvider>{children}</ErrorReportingProvider>
      </ConnectionStatusProvider>
    </ToastProvider>
  );
}

const reachableStatus = {
  daemon: { reachable: true },
  apiVersion: '1.43',
  engineVersion: '24.0.0',
  cli: {
    docker: { available: true, version: '24.0.0' },
    compose: { available: true, version: '2.24.0' },
    buildx: { available: true, version: '0.11.0' },
  },
  unavailableCapabilities: [],
};

const unreachableStatus = {
  daemon: { reachable: false, cause: 'Connection refused by the Docker endpoint' },
  cli: { docker: { available: false }, compose: { available: false }, buildx: { available: false } },
  unavailableCapabilities: [],
};

interface RecordingEventSource {
  url: string;
  emit(type: string, data?: string): void;
}

/**
 * The channel the client opened, taken from the fake installed as the global
 * `EventSource`: reading it through the global is what keeps this helper and the
 * client under test on the same one, whatever module registry either was loaded
 * from.
 */
function openedChannel(): RecordingEventSource {
  const installed = globalThis.EventSource as unknown as { instances?: RecordingEventSource[] };
  const opened = [...(installed.instances ?? [])].reverse().find((instance) => instance.url === '/api/live');
  if (!opened) throw new Error('no live channel was opened: install FakeEventSource as the global EventSource before rendering');
  return opened;
}

function deliver(status: unknown): void {
  const channel = openedChannel();
  act(() => channel.emit('open'));
  act(() => channel.emit('value', JSON.stringify({ name: 'connection-status', value: status })));
}

/**
 * The channel accepts and delivers a reachable daemon. A report is only raised
 * while something is reachable (…-inline_error_panels/REQ-13), so a test about
 * what a failure looks like states this first.
 */
export function daemonBecomesReachable(): void {
  deliver(reachableStatus);
}

/** The channel delivers a daemon that answered and said it is unreachable. */
export function daemonBecomesUnreachable(): void {
  deliver(unreachableStatus);
}

/** The toast cards on screen, oldest first. */
export function toastCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-toast-viewport .ui-toast'));
}

/** Every toast on screen, as the title and message it carries. */
export function toastTexts(): string[] {
  return toastCards().map((toast) => toast.textContent ?? '');
}
