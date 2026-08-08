import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContainersScreen } from '../../src/containers/ContainersScreen';
import { ImagesScreen } from '../../src/images/ImagesScreen';
import type { ContainerSummary } from '../../src/data/containers-client';
import type { ImageSummary } from '../../src/data/images-client';
import type { ContainerCreateSpec } from '../../src/data/container-create-client';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
// ImagesScreen reaches a layer named by another screen (images/specs/images-screen.md),
// so it only stands inside a cross-navigation provider.
import { CrossNavigationProvider } from '../../src/shell/services/CrossNavigationService';
import { ErrorReportingProvider } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';
import { ToastProvider } from '../../src/ui';

// Both screens open the same create/run form; the create client is mocked so
// the wiring — which entry point opens it, with which primary commit action and
// which pre-filled reference — is what these tests observe.
const createContainer = vi.fn();

vi.mock('../../src/data/container-create-client', () => ({
  createContainer: (spec: ContainerCreateSpec, handlers?: unknown) => createContainer(spec, handlers),
}));

// The detail panels subscribe to daemon events through a module-level
// EventSource, which jsdom does not provide.
class FakeEventSource {
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public url: string) {}

  addEventListener() {
    // no event delivery is needed for these tests
  }

  close() {
    // nothing to tear down
  }
}

function makeContainer(overrides: Partial<ContainerSummary> = {}): ContainerSummary {
  return {
    id: 'abcdef1234567890',
    shortId: 'abcdef123456',
    name: 'web-nginx',
    image: 'nginx:1.27',
    state: 'running',
    status: 'Up 3 days',
    ports: [],
    ...overrides,
  };
}

function makeImage(overrides: Partial<ImageSummary> = {}): ImageSummary {
  return {
    id: 'sha256:0123456789abcdef0123456789abcdef',
    shortId: '0123456789ab',
    tags: ['nginx:1.27'],
    digest: 'sha256:feedface',
    platforms: ['linux/amd64'],
    sizeBytes: 2048,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function containerInspect() {
  return {
    id: 'created-1',
    name: 'new-container',
    image: 'nginx:1.27',
    command: ['nginx'],
    entrypoint: [],
    createdAt: '2026-01-01T00:00:00Z',
    state: { status: 'running', startedAt: '2026-01-01T00:00:01Z' },
    restartPolicy: { name: 'no' },
    resourceLimits: {},
    env: [],
    ports: [],
    mounts: [],
    networks: [{ name: 'bridge' }],
    labels: {},
    raw: { Id: 'created-1' },
  };
}

function providers(children: React.ReactNode) {
  return (
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <CrossNavigationProvider>
            <ToastProvider>{children}</ToastProvider>
          </CrossNavigationProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>
  );
}

function commitOrder(): string[] {
  return screen
    .getAllByRole('button')
    .map((button) => button.textContent?.trim() ?? '')
    .filter((label) => label === 'Create only' || label === 'Create and start');
}

beforeEach(() => {
  createContainer.mockReset();
  createContainer.mockResolvedValue({ id: 'created-1', name: 'new-container', started: true, imagePulled: false, warnings: [] });
  // A selected container opens its detail panel, which reads its inspect data.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(String(url).includes('/inspect') ? containerInspect() : {}),
      }),
    ),
  );
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ContainersScreen — create/run entry points (plan-docker_management_app/REQ-27)', () => {
  // containers-screen.md — the toolbar carries both entry points
  it('offers a "Run container…" and a "Create from image…" toolbar action', () => {
    render(providers(<ContainersScreen containers={[makeContainer()]} loaded onRefresh={vi.fn()} />));

    expect(screen.getByRole('button', { name: 'Run container…' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create from image…' })).toBeInTheDocument();
  });

  // containers-screen.md — the form is only shown once an entry point is used
  it('shows no create form until an entry point is used', () => {
    render(providers(<ContainersScreen containers={[makeContainer()]} loaded onRefresh={vi.fn()} />));

    expect(screen.queryByRole('combobox', { name: 'Image reference' })).not.toBeInTheDocument();
  });

  // containers-screen.md — "Run container…" opens the form with "Create and start" as the primary (last) action
  it('opens the create form from "Run container…" with "Create and start" as the primary action', async () => {
    const user = userEvent.setup();
    render(providers(<ContainersScreen containers={[makeContainer()]} loaded onRefresh={vi.fn()} />));

    await user.click(screen.getByRole('button', { name: 'Run container…' }));

    expect(screen.getByRole('combobox', { name: 'Image reference' })).toBeInTheDocument();
    expect(commitOrder()).toEqual(['Create only', 'Create and start']);
  });

  // containers-screen.md — "Create from image…" opens the same form with "Create only" as the primary (last) action
  it('opens the same form from "Create from image…" with "Create only" as the primary action', async () => {
    const user = userEvent.setup();
    render(providers(<ContainersScreen containers={[makeContainer()]} loaded onRefresh={vi.fn()} />));

    await user.click(screen.getByRole('button', { name: 'Create from image…' }));

    expect(screen.getByRole('combobox', { name: 'Image reference' })).toBeInTheDocument();
    expect(commitOrder()).toEqual(['Create and start', 'Create only']);
  });

  // containers-screen.md — the local images given to the screen are offered as suggestions by the form
  it('offers the screen\'s local images as suggestions in the form', async () => {
    const user = userEvent.setup();
    render(
      providers(<ContainersScreen containers={[makeContainer()]} loaded onRefresh={vi.fn()} images={[makeImage({ tags: ['redis:7'] })]} imagesLoaded />),
    );

    await user.click(screen.getByRole('button', { name: 'Run container…' }));
    await user.click(screen.getByRole('combobox', { name: 'Image reference' }));

    expect(screen.getByRole('option', { name: /redis:7/ })).toBeInTheDocument();
  });

  // containers-screen.md — a created container closes the form and the list is re-read
  it('closes the form and re-reads the list once a container is created', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(providers(<ContainersScreen containers={[makeContainer()]} loaded onRefresh={onRefresh} />));

    await user.click(screen.getByRole('button', { name: 'Run container…' }));
    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Image reference' })).not.toBeInTheDocument());
    expect(onRefresh).toHaveBeenCalled();
  });

  // containers-screen.md — the created container becomes the selected row
  it('selects the created container in the list', async () => {
    const user = userEvent.setup();
    const { container } = render(
      providers(<ContainersScreen containers={[makeContainer(), makeContainer({ id: 'created-1', shortId: 'created-1', name: 'new-container' })]} loaded onRefresh={vi.fn()} />),
    );

    await user.click(screen.getByRole('button', { name: 'Run container…' }));
    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    await waitFor(() => expect(container.querySelector('.ui-data-table__row--selected')).not.toBeNull());
    expect(container.querySelector('.ui-data-table__row--selected')?.textContent).toContain('new-container');
  });

  // containers-screen.md — cancelling the form changes nothing
  it('creates nothing and closes the form on cancel', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(providers(<ContainersScreen containers={[makeContainer()]} loaded onRefresh={onRefresh} />));

    await user.click(screen.getByRole('button', { name: 'Run container…' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('combobox', { name: 'Image reference' })).not.toBeInTheDocument();
    expect(createContainer).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

describe('ImagesScreen — run this image (plan-docker_management_app/REQ-29)', () => {
  // images-screen.md — the row's run action opens the create form pre-filled with that image's reference
  it("opens the create form pre-filled with the image's own reference", async () => {
    const user = userEvent.setup();
    render(providers(<ImagesScreen images={[makeImage({ tags: ['redis:7'] })]} loaded onRefresh={vi.fn()} />));

    await user.click(screen.getByRole('button', { name: 'run' }));

    expect(screen.getByRole('combobox', { name: 'Image reference' })).toHaveValue('redis:7');
  });

  // images-screen.md — a dangling image has no reference: the form is pre-filled with its short id
  it("pre-fills a dangling image's short id", async () => {
    const user = userEvent.setup();
    render(providers(<ImagesScreen images={[makeImage({ tags: [], shortId: '0123456789ab' })]} loaded onRefresh={vi.fn()} />));

    await user.click(screen.getByRole('button', { name: 'run' }));

    expect(screen.getByRole('combobox', { name: 'Image reference' })).toHaveValue('0123456789ab');
  });

  // images-screen.md — cancelling closes the form and leaves the images list as it was
  it('closes the form on cancel, leaving the list untouched', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(providers(<ImagesScreen images={[makeImage({ tags: ['redis:7'] })]} loaded onRefresh={onRefresh} />));

    await user.click(screen.getByRole('button', { name: 'run' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('combobox', { name: 'Image reference' })).not.toBeInTheDocument();
    expect(createContainer).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  // images-screen.md — creating from the images screen closes the form
  it('closes the form once the container is created', async () => {
    const user = userEvent.setup();
    render(providers(<ImagesScreen images={[makeImage({ tags: ['redis:7'] })]} loaded onRefresh={vi.fn()} />));

    await user.click(screen.getByRole('button', { name: 'run' }));
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    await waitFor(() => expect(createContainer).toHaveBeenCalled());
    expect(createContainer.mock.calls[0]![0]).toMatchObject({ image: 'redis:7' });
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Image reference' })).not.toBeInTheDocument());
  });
});
