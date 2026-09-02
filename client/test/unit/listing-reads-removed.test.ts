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
