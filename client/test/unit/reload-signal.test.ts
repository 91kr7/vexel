import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource, channelOpens, dropChannel } from '../support/live-channel';

/**
 * app-shell/specs/reload-signal.md — `reloadWhenChannelReturns()` "raises one reload each time the
 * live channel starts delivering again after it had stopped", and the channel's first open raises
 * none (plan-docker_management_app-inline_error_panels/REQ-12).
 *
 * The channel client is a module-level singleton, so each test gets a fresh module registry and a
 * fresh `EventSource` stand-in.
 */
let reloadWhenChannelReturns: typeof import('../../src/data/reload-signal').reloadWhenChannelReturns;
let subscribeToReload: typeof import('../../src/data/reload-signal').subscribeToReload;

beforeEach(async () => {
  vi.resetModules();
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  ({ reloadWhenChannelReturns, subscribeToReload } = await import('../../src/data/reload-signal'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Lets the reads the signal started settle before they are counted. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A subscribed read that only records that it ran. */
function countedRead(): { count: () => number } {
  let count = 0;
  subscribeToReload(() => {
    count += 1;
  });
  return { count: () => count };
}

describe('reloadWhenChannelReturns (…-inline_error_panels/REQ-12)', () => {
  // reload-signal.md — "the channel's first open raises nothing: that is a start-up, and every
  // mounted view has just read"
  it('raises nothing on the channel first open', async () => {
    reloadWhenChannelReturns();
    const read = countedRead();

    channelOpens();
    await settle();

    expect(read.count(), 'a start-up read every view again').toBe(0);
  });

  // reload-signal.md — "raises one reload each time the live channel starts delivering again"
  it('raises one reload when the channel starts delivering again', async () => {
    reloadWhenChannelReturns();
    const read = countedRead();
    channelOpens();

    dropChannel();
    channelOpens();
    await settle();

    expect(read.count()).toBe(1);
  });

  // reload-signal.md — "one reload per return, whatever raised it"
  it('raises one reload per return, not one per delivery', async () => {
    reloadWhenChannelReturns();
    const read = countedRead();
    channelOpens();

    dropChannel();
    channelOpens();
    dropChannel();
    channelOpens();
    await settle();

    expect(read.count()).toBe(2);
  });

  // A channel going down is not a return: the views keep what they had and the header reports it.
  it('raises nothing when the channel stops delivering', async () => {
    reloadWhenChannelReturns();
    const read = countedRead();
    channelOpens();

    dropChannel();
    await settle();

    expect(read.count()).toBe(0);
  });

  // reload-signal.md — "Calling the returned function stops watching."
  it('raises nothing once the watch is dropped', async () => {
    const stop = reloadWhenChannelReturns();
    const read = countedRead();
    channelOpens();

    stop();
    dropChannel();
    channelOpens();
    await settle();

    expect(read.count()).toBe(0);
  });
});
