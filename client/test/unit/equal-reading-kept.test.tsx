/**
 * A reading that comes back equal to the one already in hand replaces nothing
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-47,
 * REQ-48).
 *
 * The listings left the keeper on
 * plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-21:
 * they take no reading at all, and the same rule is kept for them by the pushed
 * value store — asserted hook by hook in `listings-arrive-by-push.test.tsx` and
 * on the store itself in `pushed-value-store.test.tsx`. Two claims are left here
 * and neither is covered there: **who still stores through the keeper**, which is
 * what REQ-21 turns into a fact about the tree, and what the rule buys the
 * operator — a table that is not redrawn.
 *
 * Every delivery carries a **freshly built** payload, which is what a message
 * parsed off the channel is: one long-lived object would keep its identity on its
 * own and this file would pass while testing nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { act, memo } from 'react';
import { cleanup, render } from '@testing-library/react';
import { channelOpens, deliverValue } from '../support/live-channel';
import { arrangeLiveChannel } from '../support/pushed-listing';

/**
 * The keeper's remaining callers: the container detail's inspect data and its
 * process listing, each read on a clock of its own and covered by its own file
 * (…-multiplexed_sse/REQ-28).
 */
const DETAIL_HOOKS = ['use-container-detail.ts', 'use-container-processes.ts'];

let useImages: typeof import('../../src/data/use-images').useImages;

beforeEach(async () => {
  arrangeLiveChannel();
  vi.resetModules();
  ({ useImages } = await import('../../src/data/use-images'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('what still stores its reading through the keeper (REQ-21)', () => {
  // …-multiplexed_sse/REQ-21 — "a client refresh facility whose only caller was a removed poll is
  // removed, not left exported for a later caller": the keeper stays, and what stays with it is the
  // two views that still read on demand.
  it('is the container detail and its processes, and no listing', () => {
    const dataDirectory = join(process.cwd(), 'src', 'data');
    const callers = readdirSync(dataDirectory)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => readFileSync(join(dataDirectory, file), 'utf8').includes("from './use-kept-reading'"));

    expect(callers.sort()).toEqual([...DETAIL_HOOKS].sort());
  });
});

/** Redraws the list it is handed, and counts each one. */
const RowsDrawn = memo(function RowsDrawn({ drawn }: { rows: unknown; drawn: { count: number } }) {
  drawn.count += 1;
  return null;
});

describe('a list that has not changed stops being redrawn (REQ-12)', () => {
  // …-multiplexed_sse/REQ-12 — "a value sent again unchanged replaces nothing on screen": the
  // Images screen's table, with the same listing delivered many times over, is drawn once.
  it('draws the image table once across twenty deliveries of an unchanged host', () => {
    const listing = () => [{ id: 'img-1', shortId: 'img-1', tags: ['app:1'], platforms: [], sizeBytes: 1, createdAt: '2026-01-01T00:00:00Z' }];
    const drawn = { count: 0 };
    function ImagesScreen() {
      const { images } = useImages();
      return <RowsDrawn rows={images} drawn={drawn} />;
    }

    render(<ImagesScreen />);
    act(() => channelOpens());
    act(() => deliverValue('images', listing()));
    const drawnOnceDelivered = drawn.count;

    for (let delivery = 0; delivery < 20; delivery += 1) act(() => deliverValue('images', listing()));

    expect(drawn.count, 'the image table was redrawn by a delivery that changed nothing').toBe(drawnOnceDelivered);
  });

  // The counterpart: a delivery that differs is drawn, so the case above is not passing by being inert.
  it('draws the image table again when the listing delivered differs', () => {
    const drawn = { count: 0 };
    function ImagesScreen() {
      const { images } = useImages();
      return <RowsDrawn rows={images} drawn={drawn} />;
    }

    render(<ImagesScreen />);
    act(() => channelOpens());
    act(() => deliverValue('images', [{ id: 'img-1', shortId: 'img-1', tags: ['app:1'], platforms: [], sizeBytes: 1, createdAt: '2026-01-01T00:00:00Z' }]));
    const drawnOnceDelivered = drawn.count;

    act(() => deliverValue('images', [{ id: 'img-2', shortId: 'img-2', tags: ['app:2'], platforms: [], sizeBytes: 2, createdAt: '2026-01-01T00:00:00Z' }]));

    expect(drawn.count).toBeGreaterThan(drawnOnceDelivered);
  });
});
