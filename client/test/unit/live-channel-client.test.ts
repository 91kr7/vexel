import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource, liveChannel } from '../support/live-channel';

/**
 * The browser's one connection to the server
 * (`live-channel/specs/live-channel-client.md`;
 * plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-1,
 * REQ-3, REQ-9, REQ-10, REQ-26).
 *
 * The module holds the connection for the window's lifetime, so each test gets a
 * fresh module registry and a fresh stand-in `EventSource`.
 */

type ChannelClient = typeof import('../../src/data/live-channel');

let channelClient: ChannelClient;

beforeEach(async () => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.resetModules();
  channelClient = await import('../../src/data/live-channel');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the live channel client', () => {
  // REQ-1 — "A window opens exactly one SSE channel to the server."
  it('opens one connection on the first subscription, and no second one however many subscribe', () => {
    expect(FakeEventSource.instances).toHaveLength(0);

    channelClient.subscribeToDaemonEvents(() => {});
    channelClient.subscribeToPushedValues(() => {});
    channelClient.subscribeToChannelDiscard(() => {});
    channelClient.subscribeToChannelDelivery(() => {});

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(liveChannel().url).toBe('/api/live');
  });

  // REQ-3 — each message names which value it carries, and the client routes it by that name.
  it('routes a value message to the value listeners, naming what it carries', () => {
    const values: unknown[] = [];
    const events: unknown[] = [];
    channelClient.subscribeToPushedValues((pushed) => values.push(pushed));
    channelClient.subscribeToDaemonEvents((event) => events.push(event));

    liveChannel().emit('value', JSON.stringify({ name: 'containers', value: [{ id: 'c1' }] }));

    expect(values).toEqual([{ name: 'containers', value: [{ id: 'c1' }] }]);
    expect(events).toEqual([]);
  });

  // REQ-26 — the daemon events travel on this same connection, in the server's own shape.
  it('routes a daemon-event message to the daemon-event listeners, actorId included', () => {
    const events: unknown[] = [];
    const values: unknown[] = [];
    channelClient.subscribeToDaemonEvents((event) => events.push(event));
    channelClient.subscribeToPushedValues((pushed) => values.push(pushed));

    const event = { id: 'evt-1', timestamp: '2026-09-02T10:00:00.000Z', type: 'container', action: 'start', actor: 'web', actorId: 'c1' };
    liveChannel().emit('daemon-event', JSON.stringify(event));

    expect(events).toEqual([event]);
    expect(values).toEqual([]);
  });

  // The spec's third routing case: the server saying the values it held are gone.
  it('routes a discard message to the discard listeners alone', () => {
    let discarded = 0;
    const values: unknown[] = [];
    channelClient.subscribeToChannelDiscard(() => {
      discarded += 1;
    });
    channelClient.subscribeToPushedValues((pushed) => values.push(pushed));

    liveChannel().emit('discarded');

    expect(discarded).toBe(1);
    expect(values).toEqual([]);
  });

  it('stops telling a listener that unsubscribed', () => {
    const values: unknown[] = [];
    const unsubscribe = channelClient.subscribeToPushedValues((pushed) => values.push(pushed));

    unsubscribe();
    liveChannel().emit('value', JSON.stringify({ name: 'images', value: [] }));

    expect(values).toEqual([]);
  });

  // REQ-11 — whether the channel is delivering is what the interface reports a connection on.
  it('is not delivering until the connection opens, and says so when it does', () => {
    const reported: boolean[] = [];
    channelClient.subscribeToChannelDelivery((delivering) => reported.push(delivering));

    expect(channelClient.isChannelDelivering()).toBe(false);

    liveChannel().emit('open');

    expect(channelClient.isChannelDelivering()).toBe(true);
    expect(reported).toEqual([true]);
  });

  // REQ-9, REQ-11 — a dropped channel is reported as not delivering while the browser reopens it.
  it('reports it is no longer delivering when the channel drops', () => {
    const reported: boolean[] = [];
    channelClient.subscribeToChannelDelivery((delivering) => reported.push(delivering));
    liveChannel().emit('open');

    liveChannel().emit('error');

    expect(channelClient.isChannelDelivering()).toBe(false);
    expect(reported).toEqual([true, false]);
  });

  it('tells the delivery listeners once per change, not once per message', () => {
    const reported: boolean[] = [];
    channelClient.subscribeToChannelDelivery((delivering) => reported.push(delivering));

    liveChannel().emit('open');
    liveChannel().emit('open');
    liveChannel().emit('error');
    liveChannel().emit('error');

    expect(reported).toEqual([true, false]);
  });

  // REQ-18 — what an operator told the channel is not delivering asks for.
  it('closes the channel and opens another when asked to reconnect', () => {
    channelClient.subscribeToPushedValues(() => {});
    const dropped = liveChannel();
    dropped.emit('open');

    channelClient.reconnectLiveChannel();

    expect(dropped.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(channelClient.isChannelDelivering()).toBe(false);
  });

  it('routes to the subscribers registered before a reconnection, on the new channel', () => {
    const values: unknown[] = [];
    channelClient.subscribeToPushedValues((pushed) => values.push(pushed));

    channelClient.reconnectLiveChannel();
    liveChannel().emit('value', JSON.stringify({ name: 'volumes', value: ['data'] }));

    expect(values).toEqual([{ name: 'volumes', value: ['data'] }]);
  });

  // REQ-23 — the wait the refresh control parks before it asks for the reload.
  it('resolves the reload wait on the next end-of-reload message', async () => {
    let ended = false;
    const waiting = channelClient.awaitReloadEnd().then(() => {
      ended = true;
    });

    expect(ended).toBe(false);
    liveChannel().emit('reloaded');
    await waiting;

    expect(ended).toBe(true);
  });

  it('resolves every wait parked before an end-of-reload message, and none raised after it', async () => {
    const first = channelClient.awaitReloadEnd();
    const second = channelClient.awaitReloadEnd();
    liveChannel().emit('reloaded');
    await Promise.all([first, second]);

    let laterEnded = false;
    void channelClient.awaitReloadEnd().then(() => {
      laterEnded = true;
    });
    await Promise.resolve();

    expect(laterEnded).toBe(false);
  });

  // The client holds nothing: what arrives is routed, not kept.
  it('opens the connection for a reload wait raised before any subscription', () => {
    void channelClient.awaitReloadEnd();

    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
