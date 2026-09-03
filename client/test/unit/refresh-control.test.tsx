import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ServerReloadReport } from '../../src/data/refresh-client';
import { FakeEventSource, channelOpens, deliverReloadEnd, dropChannel, liveChannel } from '../support/live-channel';

/**
 * The refresh control's states — INT-17 of `batch-manual-refresh`
 * (plan-docker_management_app-refresh_cache-manual_refresh/REQ-2 to REQ-6, and
 * the REQ-11 clause that decides when the press is over;
 * `app-shell/specs/refresh-control.md`).
 *
 * The press is over when three things have ended, and the last of them is the
 * **live channel** saying so: the values the reload produced travel on it, not
 * on the endpoint's answer (…-multiplexed_sse/REQ-23, REQ-34). So the channel is
 * driven here for real, and the end-of-reload message is the last thing every
 * successful case sends.
 *
 * Only the **server** half is mocked. The reload signal is the real one, and a
 * subscribed read is registered here that the test itself decides when to end:
 * that is the only way to state the requirement this control can fail silently
 * on — "finished" must mean the views have re-read, not that the server
 * answered. A control reporting finished at the server's answer passes every
 * other case below and fails REQ-11, so that case is written first and asserted
 * on both sides of the listener's promise.
 *
 * jsdom lays nothing out, so there are no coordinates to aim at: the
 * real-pointer half of the rules in `CLAUDE.md` belongs to
 * `e2e/manual-refresh.spec.ts`. What is asserted here is the state machine —
 * what the control says about itself, how many reloads a press starts, and what
 * the operator is told at the end.
 */

/** The server call the control makes, deferred so the test decides when it ends. */
let serverReload: () => Promise<ServerReloadReport> = async () => report();
/** How many times the control asked the server to reload. */
let serverCalls = 0;

vi.mock('../../src/data/refresh-client', () => ({
  requestServerReload: () => {
    serverCalls += 1;
    return serverReload();
  },
}));

const { RefreshControl } = await import('../../src/shell/RefreshControl');
const { subscribeToReload } = await import('../../src/data/reload-signal');
const { subscribeToChannelDelivery } = await import('../../src/data/live-channel');
const { ToastProvider } = await import('../../src/ui');

function report(overrides: Partial<ServerReloadReport> = {}): ServerReloadReport {
  return { ok: true, reloaded: ['containers', 'images'], skipped: [], failed: [], ...overrides };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (cause: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const subscriptions: (() => void)[] = [];

/** A mounted view's own read, as the reload signal sees it: it ends when this test says so. */
function mountedViewRead(): { calls: () => number; end: () => void } {
  let calls = 0;
  let pending = deferred<void>();
  const unsubscribe = subscribeToReload(() => {
    calls += 1;
    pending = deferred<void>();
    return pending.promise;
  });
  subscriptions.push(unsubscribe);
  return { calls: () => calls, end: () => pending.resolve() };
}

function renderControl() {
  render(
    <ToastProvider>
      <RefreshControl />
    </ToastProvider>,
  );
  return screen.getByRole('button', { name: 'Refresh' });
}

function toastTitles(): string[] {
  return Array.from(document.querySelectorAll('.ui-toast__title')).map((title) => title.textContent ?? '');
}

function toastText(): string {
  return Array.from(document.querySelectorAll('.ui-toast'))
    .map((toast) => toast.textContent ?? '')
    .join(' ');
}

function dangerToasts(): Element[] {
  return Array.from(document.querySelectorAll('.ui-toast--tone-danger'));
}

function successToasts(): Element[] {
  return Array.from(document.querySelectorAll('.ui-toast--tone-success'));
}

beforeEach(() => {
  serverCalls = 0;
  serverReload = async () => report();
  vi.stubGlobal('EventSource', FakeEventSource);
  // The channel is delivering unless a test says otherwise: with it down the control ends the
  // wait instead of parking on it, which is the last case of this file and not the others.
  subscriptions.push(subscribeToChannelDelivery(() => {}));
  act(() => channelOpens());
});

afterEach(() => {
  for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
  cleanup();
  vi.unstubAllGlobals();
});

/** The server's end-of-reload message: the values it produced have been delivered. */
function endReloadOnChannel(): void {
  act(() => deliverReloadEnd());
}

/** The channel stops delivering, which is what the browser reports when the connection drops. */
function channelStopsDelivering(): void {
  act(() => dropChannel());
}

/** How many live channels have been opened; the page opens streams of its own elsewhere. */
function liveChannels(): number {
  return FakeEventSource.instances.filter((instance) => instance.url === '/api/live').length;
}

describe('RefreshControl (app-shell/specs/refresh-control.md)', () => {
  // REQ-2 — the control shows it is working, from the press until the reload ends.
  it('states it is working from the press, and says nothing until the reload has ended', async () => {
    const server = deferred<ServerReloadReport>();
    serverReload = () => server.promise;
    const control = renderControl();

    expect(control).not.toHaveAttribute('aria-busy');
    expect(control).toBeEnabled();

    await userEvent.click(control);

    expect(control).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: 'Refresh is working' })).toBeInTheDocument();
    expect(toastTitles(), 'the operator was told the reload ran before it had').toEqual([]);

    server.resolve(report());
    await waitFor(() => expect(serverCalls).toBe(1));
    endReloadOnChannel();
    await waitFor(() => expect(control).not.toHaveAttribute('aria-busy'));
  });

  // REQ-11 — the press is over only when the current screen shows the reloaded data, so the busy
  // state spans the subscribed reads and not merely the server's answer. This is the requirement
  // the control can satisfy in letter and fail in effect.
  it('stays working until every subscribed view has re-read, not until the server has answered', async () => {
    const view = mountedViewRead();
    const server = deferred<ServerReloadReport>();
    serverReload = () => server.promise;
    const control = renderControl();

    await userEvent.click(control);
    server.resolve(report());
    await waitFor(() => expect(view.calls()).toBe(1));

    // The server has answered and the view has been asked, but its read is still running.
    expect(control, 'the control left the working state before the screen had the data').toHaveAttribute('aria-busy', 'true');
    expect(toastTitles(), 'the reload was reported finished before the screen had re-read').toEqual([]);

    view.end();
    endReloadOnChannel();

    await waitFor(() => expect(control).not.toHaveAttribute('aria-busy'));
    expect(toastTitles()).toEqual(['Refreshed']);
  });

  // …-multiplexed_sse/REQ-23, REQ-34 — "The endpoint answering is not the screen being current":
  // the values the reload read reach the screen on the channel, so the press ends on the
  // channel's own end-of-reload message and not on the answer.
  it('stays working until the channel says the reload has ended, not until the endpoint answers', async () => {
    const view = mountedViewRead();
    const server = deferred<ServerReloadReport>();
    serverReload = () => server.promise;
    const control = renderControl();

    await userEvent.click(control);
    server.resolve(report());
    await waitFor(() => expect(view.calls()).toBe(1));
    view.end();
    await waitFor(() => expect(view.calls()).toBe(1));

    // Everything but the channel has ended.
    expect(control, 'the control left the working state before the channel had delivered the reload').toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(toastTitles(), 'the reload was reported finished before the channel had delivered it').toEqual([]);

    endReloadOnChannel();

    await waitFor(() => expect(control).not.toHaveAttribute('aria-busy'));
    expect(toastTitles()).toEqual(['Refreshed']);
  });

  // REQ-4 — a press while a reload runs starts no second reload.
  it('starts no second reload when pressed while one runs', async () => {
    const view = mountedViewRead();
    const server = deferred<ServerReloadReport>();
    serverReload = () => server.promise;
    const control = renderControl();

    await userEvent.click(control);
    expect(control).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(control);
    await userEvent.click(control);

    expect(serverCalls, 'a press while busy asked the server to reload again').toBe(1);

    server.resolve(report());
    await waitFor(() => expect(view.calls()).toBe(1));
    view.end();
    endReloadOnChannel();
    await waitFor(() => expect(control).not.toHaveAttribute('aria-busy'));

    expect(serverCalls, 'the presses made while busy started a reload once the first had ended').toBe(1);
    expect(view.calls(), 'the presses made while busy raised the reload signal again').toBe(1);
    expect(toastTitles(), 'one press was reported more than once').toEqual(['Refreshed']);
  });

  // REQ-3 — the control leaves the working state and a short confirmation says the reload ran,
  // saying nothing about what changed.
  it('confirms the reload ran, without stating what changed', async () => {
    const view = mountedViewRead();
    const control = renderControl();

    await userEvent.click(control);
    await waitFor(() => expect(view.calls()).toBe(1));
    view.end();
    endReloadOnChannel();
    await waitFor(() => expect(successToasts()).toHaveLength(1));

    expect(toastTitles()).toEqual(['Refreshed']);
    expect(control).not.toHaveAttribute('aria-busy');
    expect(control).toBeEnabled();
    for (const changed of ['containers', 'images']) {
      expect(toastText(), `the confirmation states what changed: ${changed}`).not.toContain(changed);
    }
  });

  // REQ-5 — the request itself failed: the operator is told the reload did not succeed, and the
  // control is back at rest with no failed state left on it.
  it('reports a failed request and leaves no failed state on the control', async () => {
    serverReload = async () => {
      throw new Error('Refresh request failed with HTTP 500');
    };
    const control = renderControl();

    await userEvent.click(control);

    await waitFor(() => expect(dangerToasts()).toHaveLength(1));
    expect(toastTitles()).toEqual(['Refresh failed']);
    expect(toastText(), 'the failure was reported without its cause').toContain('HTTP 500');
    expect(control).not.toHaveAttribute('aria-busy');
    expect(control).toBeEnabled();
    expect(control.className, 'a failed state was left on the control').not.toMatch(/busy|danger|error/);
  });

  // REQ-5 — the server answered, but could not read every value again: that is a failed reload too.
  it('reports a reload the server could not complete', async () => {
    serverReload = async () => report({ ok: false, reloaded: ['images'], failed: [{ key: 'containers', error: 'daemon unreachable' }] });
    const control = renderControl();

    await userEvent.click(control);
    // A reload that could not read every value still ended: the server says so on
    // the channel, and what the operator is told is decided by the report.
    await waitFor(() => expect(serverCalls).toBe(1));
    endReloadOnChannel();

    await waitFor(() => expect(dangerToasts()).toHaveLength(1));
    expect(toastTitles()).toEqual(['Refresh failed']);
    expect(control).not.toHaveAttribute('aria-busy');
    expect(control).toBeEnabled();
  });

  // REQ-6 — the control stays operable after a failed reload, so the operator can ask again.
  it('can be pressed again after a failed reload', async () => {
    const view = mountedViewRead();
    serverReload = async () => {
      throw new Error('the daemon cannot be reached');
    };
    const control = renderControl();

    await userEvent.click(control);
    await waitFor(() => expect(dangerToasts()).toHaveLength(1));
    expect(serverCalls).toBe(1);

    serverReload = async () => report();
    await userEvent.click(control);
    await waitFor(() => expect(view.calls()).toBe(1));
    view.end();
    endReloadOnChannel();

    await waitFor(() => expect(successToasts()).toHaveLength(1));
    expect(serverCalls, 'the second press asked the server for nothing').toBe(2);
    expect(control).toBeEnabled();
  });

  // …-multiplexed_sse/REQ-11, REQ-18, REQ-23 — "It never parks on a channel that is not
  // delivering": the end-of-reload message travels on the channel, so with the channel down it
  // would never come and the control would stay busy for as long as the channel stayed down.
  it('ends the press on a channel that is not delivering, instead of staying busy for it', async () => {
    channelStopsDelivering();
    const view = mountedViewRead();
    const server = deferred<ServerReloadReport>();
    serverReload = () => server.promise;
    const control = renderControl();

    await userEvent.click(control);
    server.resolve(report());
    await waitFor(() => expect(view.calls()).toBe(1));
    view.end();

    // Nothing will say the reload has ended: the connection carrying that message is down.
    await waitFor(() => expect(control).not.toHaveAttribute('aria-busy'));
    expect(toastTitles()).toEqual(['Refreshed']);
    expect(control).toBeEnabled();
  });

  // …-multiplexed_sse/REQ-18 — "Press while the channel is not delivering → the channel is asked
  // for again first" (refresh-control.md): it is the one thing the operator can do about a
  // connection that is down, and it is what this control does about it.
  it('asks for the channel again when pressed while it is not delivering', async () => {
    channelStopsDelivering();
    const dropped = liveChannel();
    const openedBefore = liveChannels();
    const control = renderControl();

    await userEvent.click(control);

    expect(dropped.closed, 'the channel that was not delivering was left standing').toBe(true);
    expect(liveChannels(), 'the press did not ask for the channel again').toBe(openedBefore + 1);
    await waitFor(() => expect(control).not.toHaveAttribute('aria-busy'));
  });

  // The other half of REQ-18 — "No poll is kept behind the channel": a press on a channel that is
  // delivering asks the server to read again and waits for it, and disturbs the channel not at all.
  it('leaves a delivering channel alone when pressed', async () => {
    const view = mountedViewRead();
    const delivering = liveChannel();
    const openedBefore = liveChannels();
    const control = renderControl();

    await userEvent.click(control);
    await waitFor(() => expect(view.calls()).toBe(1));
    view.end();
    endReloadOnChannel();
    await waitFor(() => expect(control).not.toHaveAttribute('aria-busy'));

    expect(delivering.closed, 'a delivering channel was closed by a press').toBe(false);
    expect(liveChannels(), 'a press on a delivering channel opened a second one').toBe(openedBefore);
  });

  // The wait was already parked when the connection went: it ends with it rather than outliving it.
  it('ends a press already running when the channel stops delivering', async () => {
    const view = mountedViewRead();
    const server = deferred<ServerReloadReport>();
    serverReload = () => server.promise;
    const control = renderControl();

    await userEvent.click(control);
    server.resolve(report());
    await waitFor(() => expect(view.calls()).toBe(1));
    view.end();
    expect(control, 'the control left the working state before anything ended it').toHaveAttribute('aria-busy', 'true');

    channelStopsDelivering();

    await waitFor(() => expect(control).not.toHaveAttribute('aria-busy'));
  });
});
