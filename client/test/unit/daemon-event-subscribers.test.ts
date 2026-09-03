import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * One subscriber to the daemon event stream is left in the client, and it is the
 * Dashboard's event feed
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-3,
 * REQ-13, and live-channel/specs/live-channel-client.md).
 *
 * The module that declares the subscription changed on
 * plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-1:
 * the events travel on the one live channel now, so it is the channel client
 * that declares it. The claim is unchanged — one subscriber, and it is the feed.
 *
 * The requirement was written to be read off the code rather than measured in
 * requests, so that is how it is checked: the client tree is scanned for anyone
 * importing the subscription, and for the by-object-type invalidation facility
 * that served the trigger now removed.
 *
 * This file names those symbols in order to deny them, and is exempted from its
 * own scan by name.
 */

const clientRoot = process.cwd();
const SELF = join('test', 'unit', 'daemon-event-subscribers.test.ts');

/** The one module allowed to subscribe, plus the module that declares the subscription. */
const EVENT_FEED_SERVICE = join('src', 'shell', 'services', 'EventStreamService.tsx');
const EVENT_STREAM_MODULE = join('src', 'data', 'live-channel.ts');

interface SourceFile {
  path: string;
  text: string;
}

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : filesUnder(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function tree(...parts: string[]): SourceFile[] {
  return filesUnder(join(clientRoot, ...parts))
    .map((path) => ({ path: relative(clientRoot, path), text: readFileSync(path, 'utf8') }))
    .filter((file) => file.path !== SELF);
}

const shippedSources = tree('src');

function filesMatching(pattern: RegExp): string[] {
  return shippedSources.filter((file) => pattern.test(file.text)).map((file) => file.path);
}

describe('the daemon event stream has one subscriber left in the client (REQ-13)', () => {
  // REQ-13 — "The Dashboard's event feed is the only subscriber to the daemon event stream left in
  // the client. No other place in the client subscribes to it, for any purpose."
  it('is subscribed to by the event-feed service and by nothing else', () => {
    const callers = filesMatching(/\bsubscribeToDaemonEvents\s*\(/).filter((path) => path !== EVENT_STREAM_MODULE);

    expect(callers).toEqual([EVENT_FEED_SERVICE]);
  });

  // REQ-13 — the feed keeps the subscription it has: the stream itself is untouched (REQ-4).
  it('still declares the subscription the feed uses', () => {
    const declaring = filesMatching(/export function subscribeToDaemonEvents\b/);

    expect(declaring).toEqual([EVENT_STREAM_MODULE]);
  });

  // REQ-3 — "The client holds no refresh facility without a caller after this step. What served only
  // the event trigger is removed from the client, not left exported for a later caller."
  it('holds no by-object-type invalidation facility at all', () => {
    expect(filesMatching(/\bonDaemonObjectTypeChanged\b/)).toEqual([]);
    expect(filesMatching(/\bdaemonEventConcerns\b/)).toEqual([]);
  });
});
