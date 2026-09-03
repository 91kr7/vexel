import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { FakeEventSource, channelOpens, deliverValue, dropChannel, liveChannel } from '../support/live-channel';
import { arrangeLiveChannel, type ChannelHarness } from '../support/pushed-listing';

/**
 * What "read it again now" is for the one converted listing whose control asks for it
 * (`compose/specs/use-compose-projects.md`; …-multiplexed_sse/REQ-23, /REQ-33, /REQ-39).
 *
 * The listing still arrives on the channel and is never fetched — that claim, over all ten
 * listings, is `listings-arrive-by-push.test.tsx`. What is here is the press: the request it makes,
 * the reading that answers it on the channel, and what the operator is told when the server could
 * not read the projects again. `fetch` is recorded and refuses whatever no case declared, so a
 * request nobody expected fails the case that made it.
 */

const PROJECTS = 'compose-projects';
const RELOAD_URL = '/api/refresh';

let harness: ChannelHarness;
let useComposeProjects: typeof import('../../src/data/use-compose-projects').useComposeProjects;

beforeEach(async () => {
  harness = arrangeLiveChannel();
  vi.resetModules();
  ({ useComposeProjects } = await import('../../src/data/use-compose-projects'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

interface ReloadReport {
  ok: boolean;
  reloaded: string[];
  skipped: string[];
  failed: { key: string; error: string }[];
}

function report(overrides: Partial<ReloadReport> = {}): ReloadReport {
  return { ok: true, reloaded: [PROJECTS], skipped: [], failed: [], ...overrides };
}

/** The server's answer to the one request this hook ever makes. */
function serverAnswers(body: ReloadReport | Record<string, never>, init: { ok?: boolean; status?: number } = {}): void {
  harness.answers(RELOAD_URL, body, { method: 'POST', ...init });
}

function projects(status: string) {
  return [{ name: 'shop', status, configFiles: ['/srv/shop/compose.yaml'], services: [] }];
}

function mountOnADeliveringChannel() {
  const rendered = renderHook(() => useComposeProjects());
  act(() => channelOpens());
  return rendered;
}

function press(result: { current: { refresh: () => void } }): void {
  act(() => result.current.refresh());
}

describe('useComposeProjects — the press that reads again (compose/specs/use-compose-projects.md)', () => {
  // …-multiplexed_sse/REQ-23, REQ-39 — "it asks the server to read again every value it holds,
  // exactly as the header's refresh control does", and it opens no channel of its own to do it.
  it('asks the server to read again, once, and leaves the channel alone', async () => {
    serverAnswers(report());
    const { result } = mountOnADeliveringChannel();
    const delivering = liveChannel();

    press(result);

    await waitFor(() => expect(harness.requests).toEqual([{ url: RELOAD_URL, method: 'POST' }]));
    expect(delivering.closed, 'a delivering channel was closed by the press').toBe(false);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  // …-multiplexed_sse/REQ-39 — "the new listing arrives on the channel": what the reading produced
  // reaches the screen there and not in the answer to the request.
  it('shows the listing the reading it asked for produced', async () => {
    serverAnswers(report());
    const { result } = mountOnADeliveringChannel();
    act(() => deliverValue(PROJECTS, projects('running(1)')));

    press(result);
    await waitFor(() => expect(harness.requests).toHaveLength(1));
    act(() => deliverValue(PROJECTS, projects('running(2)')));

    expect(result.current.projects).toEqual(projects('running(2)'));
    expect(result.current.error).toBeUndefined();
  });

  // use-compose-projects.md — "a failed ask reports only what failed for this listing".
  it('reports what the server could not read again for this listing', async () => {
    serverAnswers(report({ ok: false, reloaded: [], failed: [{ key: PROJECTS, error: 'the docker compose plugin was not found' }] }));
    const { result } = mountOnADeliveringChannel();

    press(result);

    await waitFor(() => expect(result.current.error).toBe('the docker compose plugin was not found'));
  });

  // use-compose-projects.md — "one unrelated to compose is not shown on this screen".
  it('says nothing on this screen about a failure that is another listing’s', async () => {
    serverAnswers(report({ ok: false, reloaded: [PROJECTS], failed: [{ key: 'images', error: 'the image listing could not be read' }] }));
    const { result } = mountOnADeliveringChannel();

    press(result);

    await waitFor(() => expect(harness.requests).toHaveLength(1));
    expect(result.current.error, 'a failure of another listing was reported on the Compose screen').toBeUndefined();
  });

  // use-compose-projects.md — the ask itself failing is a failure the operator is told about.
  it('reports the request’s own failure, with its cause', async () => {
    serverAnswers({}, { ok: false, status: 500 });
    const { result } = mountOnADeliveringChannel();

    press(result);

    await waitFor(() => expect(result.current.error).toContain('500'));
  });

  // use-compose-projects.md — `error` carries "nothing when that read succeeded".
  it('clears the failure once a later ask succeeds', async () => {
    serverAnswers(report({ ok: false, reloaded: [], failed: [{ key: PROJECTS, error: 'the projects could not be read again' }] }));
    serverAnswers(report());
    const { result } = mountOnADeliveringChannel();
    press(result);
    await waitFor(() => expect(result.current.error).toBeTruthy());

    press(result);

    await waitFor(() => expect(result.current.error).toBeUndefined());
  });

  // …-multiplexed_sse/REQ-18 — with the channel down there is nothing to read again: it asks for the
  // channel, and asks the server for nothing.
  it('asks for the channel, and the server for nothing, while the channel is not delivering', async () => {
    const { result } = mountOnADeliveringChannel();
    act(() => dropChannel());
    const dropped = liveChannel();

    press(result);

    expect(dropped.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(harness.requests, 'the server was asked to read again on a channel that was down').toEqual([]);
  });
});
