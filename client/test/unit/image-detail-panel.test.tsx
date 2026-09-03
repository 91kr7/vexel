import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ImageDetailPanel } from '../../src/images/ImageDetailPanel';
import type { ImageInspect, ImageSummary } from '../../src/data/images-client';
import { forgetReportedFailures, reportedText } from '../support/error-reporting-mock';
import { errorPanels, failedReadPlaceholders } from '../support/failed-read';

// What a panel owes on a failure is the report itself; what becomes of it is the reporting
// service's own contract (app-shell/specs/error-reporting-service.md).
vi.mock('../../src/shell/services/ErrorReportingService', () => import('../support/error-reporting-mock'));

/**
 * **The image panel says each thing once, and names what it says.** Contract:
 * `images/specs/image-detail-panel.md`, for the three requirements this panel
 * carries — `Id` and `Digest` are different things
 * (`plan-ui-coherence-optimisation/REQ-58`), the size band names the measurement
 * behind it (`REQ-59`), and a collapsible section with nothing in it is not
 * drawn (`REQ-60`).
 *
 * The property set, its order and the arrangement it sits in are
 * `property-columns-contract.test.tsx`'s, and are not restated here.
 */

/** The full image id, as the daemon reports it on inspect. */
const IMAGE_ID = 'sha256:d9e853e87e55f7a5b2f0f1e7c0c2b9a1d3c4e5f60718293a4b5c6d7e8f901234';

/**
 * The short form the server emits for a digest: `algorithm:` plus twelve
 * characters, applied to the image id and to a `RepoDigests` entry alike. A
 * containerd-backed daemon reports the same digest under both names, so the two
 * fields arrive equal — the case REQ-58 is written for.
 */
const IMAGE_ID_AS_DIGEST = 'sha256:d9e853e87e55';
const REPOSITORY_DIGEST = 'sha256:1f0c4a72b8e5';

const image: ImageSummary = {
  id: IMAGE_ID,
  shortId: IMAGE_ID_AS_DIGEST,
  tags: ['alpine:3.20'],
  platforms: ['linux/arm64/v8'],
  // What the *listing* reports for this image, against the inspect's own number below.
  sizeBytes: 13_660_215,
  createdAt: '2026-04-16T23:53:24.896953537Z',
};

function makeInspect(overrides: Partial<ImageInspect> = {}): ImageInspect {
  return {
    id: IMAGE_ID,
    tags: ['alpine:3.20'],
    digest: undefined,
    platforms: ['linux/arm64/v8'],
    sizeBytes: 4_103_199,
    createdAt: '2026-04-16T23:53:24.896953537Z',
    entrypoint: [],
    command: ['/bin/sh'],
    env: [],
    labels: {},
    exposedPorts: [],
    history: [],
    raw: { Id: IMAGE_ID },
    ...overrides,
  };
}

async function renderPanel(inspect: ImageInspect): Promise<void> {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => inspect })));
  render(<ImageDetailPanel image={image} onClose={() => {}} />);
  await waitFor(() => expect(screen.getByText('Exposed ports')).toBeInTheDocument());
}

function bands(): { label: string; value: string }[] {
  return Array.from(document.querySelectorAll('.ui-definition-list__row')).map((band) => ({
    label: band.querySelector('.ui-definition-list__label')?.textContent ?? '',
    value: band.querySelector('.ui-definition-list__value')?.textContent ?? '',
  }));
}

function bandValue(label: string): string | undefined {
  return bands().find((band) => band.label === label)?.value;
}

function sections(): { title: string; summary: string }[] {
  return Array.from(document.querySelectorAll('.ui-collapsible-section')).map((section) => ({
    title: section.querySelector('.ui-collapsible-section__title')?.textContent ?? '',
    summary: section.querySelector('.ui-collapsible-section__summary')?.textContent ?? '',
  }));
}

beforeEach(() => {
  forgetReportedFailures();
  // The panel's read hook subscribes to daemon events through a module-level EventSource, which
  // jsdom does not provide.
  vi.stubGlobal(
    'EventSource',
    class {
      addEventListener() {}
      close() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// image-detail-panel.md — "`Digest` is rendered only when it is a digest of its own": either each
// band shows the value it names, or the one with nothing of its own is not rendered, and no band
// displays a value belonging to another band.
describe('ImageDetailPanel — Id and Digest are two things (plan-ui-coherence-optimisation/REQ-58)', () => {
  it('does not draw the Digest band when the daemon reports the image id as the repository digest', async () => {
    await renderPanel(makeInspect({ digest: IMAGE_ID_AS_DIGEST }));

    expect(bands().map((band) => band.label), 'the panel still draws a `Digest` band repeating the id above it').not.toContain('Digest');
    // The value is still stated once, by the band that names it.
    expect(bandValue('Id')).toContain(IMAGE_ID_AS_DIGEST);
    expect(bands().filter((band) => band.value.includes(IMAGE_ID_AS_DIGEST))).toHaveLength(1);
  });

  it('does not draw the Digest band when the daemon reports no repository digest at all', async () => {
    await renderPanel(makeInspect({ digest: undefined }));

    expect(bands().map((band) => band.label)).not.toContain('Digest');
  });

  it('draws both bands, carrying different values, when the daemon reports a repository digest of its own', async () => {
    await renderPanel(makeInspect({ digest: REPOSITORY_DIGEST }));

    expect(bandValue('Digest')).toBe(REPOSITORY_DIGEST);
    expect(bandValue('Digest'), 'the two bands display the same value').not.toBe(bandValue('Id'));
  });
});

// image-detail-panel.md — "`Content size`, not `Size`": the inspect endpoint's own measurement,
// named apart from the listing's, so no single word carries two numbers.
describe('ImageDetailPanel — the size band names its measurement (plan-ui-coherence-optimisation/REQ-59)', () => {
  it('names the band `Content size` and draws no band named `Size`', async () => {
    await renderPanel(makeInspect({ sizeBytes: 4_103_199 }));

    expect(bandValue('Content size'), 'the panel draws no `Content size` band').toBeDefined();
    expect(bands().map((band) => band.label), 'the panel still draws a band named `Size`, the word the list also used').not.toContain('Size');
  });
});

// image-detail-panel.md — "A collapsible section with nothing in it is not drawn": each of the
// three appears only when it holds at least one entry, so a section headed with a count of `0`
// cannot occur. A section with content is unchanged, count included.
describe('ImageDetailPanel — an empty section is absent (plan-ui-coherence-optimisation/REQ-60)', () => {
  it('draws no section at all when the image declares no environment, no labels and no history', async () => {
    await renderPanel(makeInspect({ env: [], labels: {}, history: [] }));

    expect(sections()).toEqual([]);
  });

  it('draws no Labels section for an image declaring none, while the sections that have content stay', async () => {
    await renderPanel(makeInspect({ env: ['PATH=/usr/local/sbin:/usr/local/bin'], labels: {} }));

    expect(sections().map((section) => section.title)).toEqual(['Environment']);
  });

  it('draws a section that has content, headed with its own count', async () => {
    await renderPanel(
      makeInspect({
        env: ['PATH=/usr/local/sbin', 'LANG=C.UTF-8'],
        labels: { 'org.opencontainers.image.title': 'alpine' },
        history: [{ createdAt: '2026-04-16T23:53:24Z', createdBy: '/bin/sh -c #(nop) ADD file:… in /', sizeBytes: 4_103_199, emptyLayer: false }],
      }),
    );

    expect(sections()).toEqual([
      { title: 'Environment', summary: '2' },
      { title: 'Labels', summary: '1' },
      { title: 'History', summary: '1 layers' },
    ]);
  });
});

// image-detail-panel.md — a failed inspect read is reported as one toast, and the shared "could not
// be loaded" placeholder stands in its place (…-inline_error_panels/REQ-1, /REQ-3, /REQ-4, /REQ-5)
describe('ImageDetailPanel — the inspect read that failed', () => {
  it('reports the failure and stands the shared placeholder in the data’s place', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: 'No such image: alpine:3.20' }) })));

    render(<ImageDetailPanel image={image} onClose={() => {}} />);

    await waitFor(() => expect(reportedText(), 'the failed inspect read was not reported').toMatch('No such image: alpine:3.20'));
    expect(screen.queryByText(/No such image/), 'the panel named the cause').not.toBeInTheDocument();
    expect(errorPanels(), 'the panel drew a failure panel').toHaveLength(0);
    expect(failedReadPlaceholders(), 'nothing stands in the data’s place').toHaveLength(1);
    expect(failedReadPlaceholders()[0].querySelector('button'), 'the placeholder carried a control').toBeNull();
  });
});
