import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Nothing in the client signals anything at unload
 * (plan-docker_management_app-containers_card_view/REQ-49).
 *
 * The sampling gate is liveness: a consumer proves it exists by holding a
 * connection, and a page that is killed, force-quit, discarded or cut off simply
 * stops answering the server's periodic write. An unload-time notice would be a
 * second mechanism whose worst case — every one of those — is silence, and it
 * will be reintroduced in good faith, as a tidy improvement. So the prohibition
 * is asserted rather than remembered.
 *
 * This file names the forbidden tokens in order to deny them, and is therefore
 * exempted from its own scan, by name.
 */

const clientRoot = process.cwd();
const SELF = join('test', 'unit', 'no-unload-signalling.test.ts');

interface SourceFile {
  path: string;
  text: string;
}

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : filesUnder(path);
    return /\.(tsx?|css|mjs)$/.test(entry.name) ? [path] : [];
  });
}

function tree(...parts: string[]): SourceFile[] {
  return filesUnder(join(clientRoot, ...parts))
    .map((path) => ({ path: relative(clientRoot, path), text: readFileSync(path, 'utf8') }))
    .filter((file) => file.path !== SELF);
}

const shippedSources = tree('src');

function hits(files: SourceFile[], pattern: RegExp): string[] {
  return files.flatMap((file) =>
    file.text
      .split('\n')
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => pattern.test(line))
      .map(({ line, number }) => `${file.path}:${number} — ${line.trim()}`),
  );
}

describe('the client signals nothing at unload (REQ-49)', () => {
  it.each([
    ['the beforeunload event', /beforeunload/],
    ['the pagehide event', /pagehide/],
    ['the unload event', /['"`]unload['"`]/],
    ['the onunload handler', /\bonunload\b/],
    ['a beacon', /sendBeacon/],
  ])('nothing under client/src uses %s', (_what, pattern) => {
    expect(hits(shippedSources, pattern)).toEqual([]);
  });

  // The gate is closed by releasing the connection, never by a call telling the server to stop: a
  // departure that has to be announced is exactly what a crash, a force-quit or a pulled network
  // does not announce (REQ-46, REQ-49).
  it('nothing under client/src calls the subscription endpoint other than by holding it open', () => {
    const callers = hits(shippedSources, /stats\/subscription/);

    expect(callers).toHaveLength(1);
    expect(callers[0]).toMatch(/use-stats-subscription\.ts/);
  });
});
