import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, renderHook } from '@testing-library/react';
import { channelOpens, deliverValue } from '../support/live-channel';
import { arrangeLiveChannel, type ChannelHarness } from '../support/pushed-listing';

/**
 * What `useBuilders` does beyond reading the listing off the channel
 * (`builders/specs/use-builders.md`): the create, the remove and the
 * select-active it drives. The listing itself — no clock, no request, discard,
 * drop, retry — is covered for the whole set in
 * `listings-arrive-by-push.test.tsx`.
 *
 * The claim about an action is that it **re-reads nothing**
 * (…-multiplexed_sse/REQ-25): the server marks the inventory changed as part of
 * the operation and the result arrives as a push. So `fetch` is recorded and
 * every request the hook makes is asserted, rather than a listing read being
 * mocked away where it would go unseen.
 */

let harness: ChannelHarness;
let useBuilders: typeof import('../../src/data/use-builders').useBuilders;

const DEFAULT_BUILDER = { name: 'default', driver: 'docker', endpoint: 'default', platforms: [], status: 'running', active: true };
const CREATED = { name: 'ci', driver: 'docker-container', endpoint: 'unix://', platforms: ['linux/arm64'], status: 'inactive', active: false };

beforeEach(async () => {
  harness = arrangeLiveChannel();
  vi.resetModules();
  ({ useBuilders } = await import('../../src/data/use-builders'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The hook with the channel delivering, and one builder already listed. */
function mounted() {
  const rendered = renderHook(() => useBuilders());
  act(() => channelOpens());
  act(() => deliverValue('builders', [DEFAULT_BUILDER]));
  return rendered;
}

describe('useBuilders (builders/specs/use-builders.md)', () => {
  // "create(input): Promise<BuilderSummary>" — and REQ-25: the operation is asked for, nothing else.
  it('creates a builder without re-reading the listing', async () => {
    harness.answers('/api/builders', CREATED, { method: 'POST' });
    const { result } = mounted();

    await act(async () => {
      await expect(result.current.create({ name: 'ci', driver: 'docker-container', platforms: ['linux/arm64'] })).resolves.toEqual(CREATED);
    });

    expect(harness.requests).toEqual([{ url: '/api/builders', method: 'POST' }]);
  });

  it('removes a builder without re-reading the listing', async () => {
    harness.answers('/api/builders/ci', {}, { method: 'DELETE' });
    const { result } = mounted();

    await act(async () => {
      await result.current.remove('ci');
    });

    expect(harness.requests).toEqual([{ url: '/api/builders/ci', method: 'DELETE' }]);
  });

  it('makes a builder the active one without re-reading the listing', async () => {
    harness.answers('/api/builders/ci/use', { ...CREATED, active: true }, { method: 'POST' });
    const { result } = mounted();

    await act(async () => {
      await expect(result.current.use('ci')).resolves.toMatchObject({ name: 'ci', active: true });
    });

    expect(harness.requests).toEqual([{ url: '/api/builders/ci/use', method: 'POST' }]);
  });

  // REQ-25 — what the operator just did reaches the listing as the push that operation caused.
  it('shows what an action changed when the channel delivers the new listing', async () => {
    harness.answers('/api/builders', CREATED, { method: 'POST' });
    const { result } = mounted();
    await act(async () => {
      await result.current.create({ name: 'ci', driver: 'docker-container', platforms: ['linux/arm64'] });
    });
    expect(result.current.builders).toEqual([DEFAULT_BUILDER]);

    act(() => deliverValue('builders', [DEFAULT_BUILDER, CREATED]));

    expect(result.current.builders).toEqual([DEFAULT_BUILDER, CREATED]);
  });

  // "failures propagate to the caller (never swallowed) so the screen can report them"
  it('propagates a create failure to the caller', async () => {
    harness.answers('/api/builders', { error: 'a builder named ci already exists' }, { method: 'POST', ok: false, status: 409 });
    const { result } = mounted();

    await expect(result.current.create({ name: 'ci', driver: 'docker-container', platforms: [] })).rejects.toThrow(
      'a builder named ci already exists',
    );
  });

  it('propagates a remove failure to the caller', async () => {
    harness.answers('/api/builders/ci', { error: 'builder ci is in use' }, { method: 'DELETE', ok: false, status: 409 });
    const { result } = mounted();

    await expect(result.current.remove('ci')).rejects.toThrow('builder ci is in use');
  });

  it('propagates a select-active failure to the caller', async () => {
    harness.answers('/api/builders/ci/use', { error: 'no builder named ci' }, { method: 'POST', ok: false, status: 404 });
    const { result } = mounted();

    await expect(result.current.use('ci')).rejects.toThrow('no builder named ci');
  });
});
