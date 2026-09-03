import { describe, expect, it } from 'vitest';

/**
 * Nothing unused is left standing
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-21).
 *
 * Every listing the live channel carries had a `fetch*` in its data client, and
 * every one of them lost its last caller when the listing moved onto the channel
 * (REQ-39). REQ-21 refuses to leave them exported for a later caller, so the
 * absence is checked rather than trusted: an export that comes back would be
 * a screen reading a listing from a list endpoint again, which is the one thing
 * REQ-39 forbids.
 *
 * The endpoints themselves are untouched and still answer (REQ-31) — that is
 * `server/test/api/list-endpoints-unchanged.test.ts`, and it is a different
 * claim: what is removed here is the **client** function nothing called.
 */

const REMOVED: Array<[string, string[]]> = [
  ['../../src/data/containers-client', ['fetchContainers']],
  ['../../src/data/images-client', ['fetchImages']],
  ['../../src/data/volumes-client', ['fetchVolumes']],
  ['../../src/data/networks-client', ['fetchNetworks']],
  ['../../src/data/compose-client', ['fetchComposeProjects']],
  ['../../src/data/builders-client', ['fetchBuilders', 'fetchBuildCache']],
  ['../../src/data/contexts-client', ['fetchContexts']],
  ['../../src/data/registries-client', ['fetchRegistries']],
  ['../../src/data/plugins-client', ['fetchPlugins']],
];

describe('the listing reads the channel replaced are gone from the client (REQ-21)', () => {
  for (const [module, removed] of REMOVED) {
    it(`${module.split('/').pop()} exports none of ${removed.join(', ')}`, async () => {
      const exported = Object.keys((await import(/* @vite-ignore */ module)) as Record<string, unknown>);

      for (const name of removed) {
        expect(exported, `${name} is still exported, with no caller left for it`).not.toContain(name);
      }
    });
  }
});

/**
 * The connection status is the last of them: its client held the only caller of
 * `GET /api/connectivity/status` in the browser, and the status now arrives on
 * the channel (REQ-19, REQ-39). REQ-21 has the module go rather than stay
 * exported, and the endpoint itself is untouched (REQ-31).
 */
describe('the connectivity read the channel replaced is gone from the client (REQ-21)', () => {
  // Built at run time and not written as a literal: a specifier Vite can see is
  // resolved while the file is transformed, and a missing one fails the whole
  // file instead of this assertion.
  const removed = ['..', '..', 'src', 'data', 'connectivity-client'].join('/');

  it('connectivity-client is not there to be imported', async () => {
    await expect(import(/* @vite-ignore */ removed)).rejects.toThrow();
  });
});
