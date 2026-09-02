import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { FakeEventSource, liveChannel } from '../support/live-channel';

// The feed reads the daemon events off the live channel
// (client/src/data/live-channel.ts), which keeps a single module-level
// EventSource; a fresh module registry per test keeps that singleton (and this
// fake) from leaking across tests.
beforeEach(() => {
  vi.resetModules();
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
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

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    act(() => {
      liveChannel().emit('daemon-event', JSON.stringify({ id: '1', timestamp: new Date().toISOString(), type: 'container', action: 'start' }));
    });
    await waitFor(() => expect(screen.getByTestId('events').textContent).toContain('container/start'));

    act(() => {
      liveChannel().emit('daemon-event', JSON.stringify({ id: '2', timestamp: new Date().toISOString(), type: 'network', action: 'create' }));
    });

    await waitFor(() => {
      const items = screen.getByTestId('events').querySelectorAll('li');
      expect(items[0]?.textContent).toBe('network/create');
      expect(items[1]?.textContent).toBe('container/start');
    });
  });

  // app-shell/specs/event-stream-service.md — an event's identity is what a consumer keys its rows on,
  // so two events of one object in one second are two held events (batch-event-feed-keys)
  it('holds two events of one container in one second separately, each with its own action', async () => {
    const { DaemonEventStreamProvider, useDaemonEventStream } = await loadProvider();

    function Consumer() {
      const { events } = useDaemonEventStream();
      return (
        <ul data-testid="events">
          {events.map((event) => (
            <li key={event.id}>{`${event.id}|${event.action}`}</li>
          ))}
        </ul>
      );
    }

    render(
      <DaemonEventStreamProvider>
        <Consumer />
      </DaemonEventStreamProvider>,
    );
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const stopped = { id: '1786229808123000000-local-container-stop-c1', timestamp: '2026-08-09T10:16:48.123Z', type: 'container', action: 'stop', actor: 'c-1' };
    const started = { ...stopped, id: '1786229808876000000-local-container-start-c1', timestamp: '2026-08-09T10:16:48.876Z', action: 'start' };
    act(() => {
      liveChannel().emit('daemon-event', JSON.stringify(stopped));
      liveChannel().emit('daemon-event', JSON.stringify(started));
    });

    await waitFor(() => {
      const items = screen.getByTestId('events').querySelectorAll('li');
      expect(items).toHaveLength(2);
      expect(items[0]?.textContent).toBe(`${started.id}|start`);
      expect(items[1]?.textContent).toBe(`${stopped.id}|stop`);
    });
  });

  // app-shell/specs/event-stream-service.md — "an event whose id is already held is dropped, and events
  // is left untouched": the stream re-delivers on a reconnect, and a list holding it twice would render
  // two rows under one key
  it('drops a re-delivered event without touching the held list or rendering again', async () => {
    const { DaemonEventStreamProvider, useDaemonEventStream } = await loadProvider();

    let renderCount = 0;
    function Consumer() {
      const { events } = useDaemonEventStream();
      renderCount += 1;
      return (
        <ul data-testid="events">
          {events.map((event) => (
            <li key={event.id}>{`${event.id}|${event.action}`}</li>
          ))}
        </ul>
      );
    }

    render(
      <DaemonEventStreamProvider>
        <Consumer />
      </DaemonEventStreamProvider>,
    );
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const event = { id: '1786229808123000000-local-container-start-c1', timestamp: '2026-08-09T10:16:48.123Z', type: 'container', action: 'start', actor: 'c-1' };
    act(() => {
      liveChannel().emit('daemon-event', JSON.stringify(event));
    });
    await waitFor(() => expect(screen.getByTestId('events').querySelectorAll('li')).toHaveLength(1));
    const rendersAfterFirstDelivery = renderCount;

    act(() => {
      liveChannel().emit('daemon-event', JSON.stringify(event));
    });

    expect(screen.getByTestId('events').querySelectorAll('li')).toHaveLength(1);
    expect(renderCount).toBe(rendersAfterFirstDelivery);
  });
});
