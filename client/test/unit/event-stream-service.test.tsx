import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

// The event-stream data client (client/src/data/event-stream.ts) keeps a
// single module-level EventSource; a fresh module registry per test keeps
// that singleton (and this fake) from leaking across tests.
class FakeEventSource {
  onmessage: ((event: { data: string }) => void) | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
  }
}

let currentSource: FakeEventSource | undefined;

beforeEach(() => {
  vi.resetModules();
  currentSource = undefined;
  vi.stubGlobal(
    'EventSource',
    class extends FakeEventSource {
      constructor(url: string) {
        super(url);
        currentSource = this;
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function loadProvider() {
  return import('../../src/shell/services/EventStreamService');
}

describe('DaemonEventStreamProvider / useDaemonEventStream', () => {
  // app-shell/specs/event-stream-service.md — usage outside a provider is a programming error
  it('throws when useDaemonEventStream is called outside a DaemonEventStreamProvider', async () => {
    const { useDaemonEventStream } = await loadProvider();
    function Bare() {
      useDaemonEventStream();
      return null;
    }

    expect(() => render(<Bare />)).toThrow('useDaemonEventStream must be used within a DaemonEventStreamProvider');
  });

  // plan-docker_management_app/REQ-11, plan-docker_management_app/REQ-12 — a live event is reflected as soon as it arrives, newest first
  it('reflects live daemon events as they arrive, newest first', async () => {
    const { DaemonEventStreamProvider, useDaemonEventStream } = await loadProvider();

    function Consumer() {
      const { events } = useDaemonEventStream();
      return (
        <ul data-testid="events">
          {events.map((event) => (
            <li key={event.id}>{`${event.type}/${event.action}`}</li>
          ))}
        </ul>
      );
    }

    render(
      <DaemonEventStreamProvider>
        <Consumer />
      </DaemonEventStreamProvider>,
    );

    await waitFor(() => expect(currentSource).toBeDefined());

    act(() => {
      currentSource!.onmessage?.({
        data: JSON.stringify({ id: '1', timestamp: new Date().toISOString(), type: 'container', action: 'start' }),
      });
    });
    await waitFor(() => expect(screen.getByTestId('events').textContent).toContain('container/start'));

    act(() => {
      currentSource!.onmessage?.({
        data: JSON.stringify({ id: '2', timestamp: new Date().toISOString(), type: 'network', action: 'create' }),
      });
    });

    await waitFor(() => {
      const items = screen.getByTestId('events').querySelectorAll('li');
      expect(items[0]?.textContent).toBe('network/create');
      expect(items[1]?.textContent).toBe('container/start');
    });
  });
});
