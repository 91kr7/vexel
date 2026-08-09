import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { ConnectionStatusProvider, useConnectionStatus } from '../../src/shell/services/ConnectionStatusService';

// contexts/specs/active-context-broadcast.md — "Subscribers are the cached
// views of the application — container, image, volume, network, compose,
// builder and build-cache lists, the connection status and the daemon
// information. Each re-reads from the server, which by then answers for the new
// daemon" (REQ-93). Every data client is mocked; the broadcast is the real one.
const fetchContainers = vi.fn(async () => []);
const fetchImages = vi.fn(async () => []);
const fetchVolumes = vi.fn(async () => []);
const fetchNetworks = vi.fn(async () => []);
const fetchComposeProjects = vi.fn(async () => []);
const fetchBuilders = vi.fn(async () => []);
const fetchBuildCache = vi.fn(async () => []);

vi.mock('../../src/data/containers-client', () => ({ fetchContainers: () => fetchContainers() }));
vi.mock('../../src/data/images-client', () => ({ fetchImages: () => fetchImages() }));
vi.mock('../../src/data/volumes-client', () => ({ fetchVolumes: () => fetchVolumes() }));
vi.mock('../../src/data/networks-client', () => ({ fetchNetworks: () => fetchNetworks() }));
vi.mock('../../src/data/compose-client', () => ({ fetchComposeProjects: () => fetchComposeProjects() }));
vi.mock('../../src/data/builders-client', () => ({
  fetchBuilders: () => fetchBuilders(),
  fetchBuildCache: () => fetchBuildCache(),
  createBuilder: vi.fn(),
  removeBuilder: vi.fn(),
  activateBuilder: vi.fn(),
  pruneBuildCache: vi.fn(),
}));
// The daemon event stream is the other source these hooks re-read on; a stub
// keeps this file about the context switch alone.
vi.mock('../../src/data/event-stream', () => ({ subscribeToDaemonEvents: () => () => undefined }));

const { notifyActiveContextChanged } = await import('../../src/data/active-context');
const { useContainers } = await import('../../src/data/use-containers');
const { useImages } = await import('../../src/data/use-images');
const { useVolumes } = await import('../../src/data/use-volumes');
const { useNetworks } = await import('../../src/data/use-networks');
const { useComposeProjects } = await import('../../src/data/use-compose-projects');
const { useBuilders } = await import('../../src/data/use-builders');
const { useBuildCache } = await import('../../src/data/use-build-cache');

const cachedViews: Array<[string, () => unknown, ReturnType<typeof vi.fn>]> = [
  ['useContainers', useContainers, fetchContainers],
  ['useImages', useImages, fetchImages],
  ['useVolumes', useVolumes, fetchVolumes],
  ['useNetworks', useNetworks, fetchNetworks],
  ['useComposeProjects', useComposeProjects, fetchComposeProjects],
  ['useBuilders', useBuilders, fetchBuilders],
  ['useBuildCache', useBuildCache, fetchBuildCache],
];

beforeEach(() => {
  for (const [, , read] of cachedViews) read.mockClear();
});

describe('cached views re-read on the active-context broadcast (REQ-93)', () => {
  for (const [name, useView, read] of cachedViews) {
    it(`${name} re-reads from the server when another context becomes the active one`, async () => {
      renderHook(() => useView());
      await waitFor(() => expect(read).toHaveBeenCalled());
      read.mockClear();

      act(() => notifyActiveContextChanged());

      await waitFor(() => expect(read).toHaveBeenCalled());
    });
  }
});

// The connection status is a subscriber too: after a switch it describes the
// daemon now in use, not the one left behind.
function StatusHarness() {
  const status = useConnectionStatus();
  return <span data-testid="engine-version">{status.engineVersion ?? ''}</span>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the connection status re-probes on the active-context broadcast (REQ-93)', () => {
  it('describes the daemon now in use after a switch', async () => {
    const status = (engineVersion: string) => ({
      daemon: { reachable: true },
      apiVersion: '1.43',
      engineVersion,
      cli: { docker: { available: true }, compose: { available: true }, buildx: { available: true } },
      unavailableCapabilities: [],
    });
    const probe = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(status('24.0.0')) });
    vi.stubGlobal('fetch', probe);

    render(
      <ConnectionStatusProvider>
        <StatusHarness />
      </ConnectionStatusProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('engine-version')).toHaveTextContent('24.0.0'));

    probe.mockResolvedValue({ ok: true, json: () => Promise.resolve(status('25.0.3')) });
    act(() => notifyActiveContextChanged());

    await waitFor(() => expect(screen.getByTestId('engine-version')).toHaveTextContent('25.0.3'));
  });
});
