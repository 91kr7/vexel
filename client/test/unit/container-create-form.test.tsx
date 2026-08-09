import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContainerCreateForm } from '../../src/containers/ContainerCreateForm';
import type { ImageSummary } from '../../src/data/images-client';
import type { ContainerCreateSpec } from '../../src/data/container-create-client';
import { ErrorReportingProvider, useErrorReporter } from '../../src/shell/services/ErrorReportingService';
import { ToastProvider } from '../../src/ui';

// The form talks to the daemon only through the create client, which is mocked
// so the form's own contract — local validation, the daemon refusal kept as a
// banner with every entered value in place, the two commit choices — is what
// the tests observe.
const createContainer = vi.fn();

vi.mock('../../src/data/container-create-client', () => ({
  createContainer: (spec: ContainerCreateSpec, handlers?: unknown) => createContainer(spec, handlers),
}));

function makeImage(overrides: Partial<ImageSummary> = {}): ImageSummary {
  return {
    id: 'sha256:0123456789abcdef',
    shortId: '0123456789ab',
    tags: ['nginx:1.27'],
    digest: 'sha256:feedface',
    platforms: ['linux/amd64'],
    sizeBytes: 2048,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function ReportedErrors() {
  const { errors } = useErrorReporter();
  return (
    <>
      {errors.map((error) => (
        <p key={error.id}>{`${error.title}${error.detail ? `: ${error.detail}` : ''}`}</p>
      ))}
    </>
  );
}

function renderForm(
  props: Partial<React.ComponentProps<typeof ContainerCreateForm>> = {},
): { onCreated: ReturnType<typeof vi.fn>; onCancel: ReturnType<typeof vi.fn> } {
  const onCreated = props.onCreated ?? vi.fn();
  const onCancel = props.onCancel ?? vi.fn();
  render(
    <ErrorReportingProvider>
      <ToastProvider>
        <ContainerCreateForm open images={[makeImage()]} {...props} onCreated={onCreated} onCancel={onCancel} />
        <ReportedErrors />
      </ToastProvider>
    </ErrorReportingProvider>,
  );
  return { onCreated: onCreated as ReturnType<typeof vi.fn>, onCancel: onCancel as ReturnType<typeof vi.fn> };
}

const createdResult = { id: 'container-1', name: 'web', started: true, imagePulled: false, warnings: [] };

function submittedSpec(): ContainerCreateSpec {
  return createContainer.mock.calls.at(-1)![0] as ContainerCreateSpec;
}

beforeEach(() => {
  createContainer.mockReset();
  createContainer.mockResolvedValue(createdResult);
});

afterEach(cleanup);

describe('ContainerCreateForm — configuration coverage (plan-docker_management_app/REQ-27)', () => {
  // container-create-form.md — every configuration group of REQ-27 is present in the sheet
  it('groups every configuration section the requirement calls for', () => {
    renderForm();

    for (const title of [
      'Image and identity',
      'Entrypoint and command',
      'Environment',
      'Ports',
      'Volumes',
      'Networks',
      'Restart policy',
      'Resource limits',
      'Labels',
      'Privileges',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
  });

  // container-create-form.md — both commit choices are offered; defaultStart only decides which one is primary
  it('offers both the create-only and the create-and-start commit choices', () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'Create only' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create and start' })).toBeInTheDocument();
  });

  // container-create-form.md — a "Run container…" entry point makes "Create and start" the primary (last) action
  it('makes "Create and start" the primary action when defaultStart is set', () => {
    renderForm({ defaultStart: true });

    const labels = screen
      .getAllByRole('button')
      .map((button) => button.textContent?.trim() ?? '')
      .filter((label) => label === 'Create only' || label === 'Create and start');
    expect(labels).toEqual(['Create only', 'Create and start']);
  });

  // container-create-form.md — a "Create from image…" entry point makes "Create only" the primary (last) action
  it('makes "Create only" the primary action when defaultStart is off', () => {
    renderForm({ defaultStart: false });

    const labels = screen
      .getAllByRole('button')
      .map((button) => button.textContent?.trim() ?? '')
      .filter((label) => label === 'Create only' || label === 'Create and start');
    expect(labels).toEqual(['Create and start', 'Create only']);
  });

  // container-create-form.md — the whole configuration is submitted as entered: command and entrypoint split on whitespace,
  // env/labels as pairs, ports, mounts, networks, restart policy, limits, privileges
  it('submits every entered value in the created configuration', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await user.type(screen.getByRole('textbox', { name: 'Container name' }), 'web-frontend');
    await user.type(screen.getByRole('textbox', { name: 'Entrypoint' }), '/docker-entrypoint.sh');
    await user.type(screen.getByRole('textbox', { name: 'Command' }), 'nginx -g daemon');

    await user.click(screen.getByRole('button', { name: 'Add variable' }));
    await user.type(screen.getByRole('textbox', { name: 'Environment Key 1' }), 'MODE');
    await user.type(screen.getByRole('textbox', { name: 'Environment Value 1' }), 'production');

    await user.click(screen.getByRole('button', { name: 'Add port mapping' }));
    await user.type(screen.getByRole('textbox', { name: 'Container port 1' }), '80');
    await user.type(screen.getByRole('textbox', { name: 'Host port 1' }), '8080');

    await user.click(screen.getByRole('button', { name: 'Add mount' }));
    await user.type(screen.getByRole('textbox', { name: 'Mount source 1' }), 'site-data');
    await user.type(screen.getByRole('textbox', { name: 'Mount destination 1' }), '/usr/share/nginx/html');

    await user.type(screen.getByRole('textbox', { name: 'Network name' }), 'front{Enter}');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Restart policy' }), 'always');
    await user.type(screen.getByRole('spinbutton', { name: 'CPU limit' }), '1.5');
    await user.type(screen.getByRole('spinbutton', { name: 'Memory limit in megabytes' }), '512');

    await user.click(screen.getByRole('button', { name: 'Add label' }));
    await user.type(screen.getByRole('textbox', { name: 'Labels Key 1' }), 'team');

    await user.click(screen.getByRole('checkbox', { name: 'Run privileged' }));
    await user.type(screen.getByRole('textbox', { name: 'Capability to add' }), 'NET_ADMIN{Enter}');

    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    await waitFor(() => expect(createContainer).toHaveBeenCalled());
    const spec = submittedSpec();
    expect(spec.image).toBe('nginx:1.27');
    expect(spec.name).toBe('web-frontend');
    expect(spec.entrypoint).toEqual(['/docker-entrypoint.sh']);
    expect(spec.command).toEqual(['nginx', '-g', 'daemon']);
    expect(spec.env).toEqual(['MODE=production']);
    expect(spec.ports).toEqual([{ containerPort: 80, protocol: 'tcp', hostPort: 8080, hostIp: undefined }]);
    expect(spec.mounts).toEqual([{ type: 'bind', source: 'site-data', destination: '/usr/share/nginx/html', readOnly: false }]);
    expect(spec.networks).toEqual(['front']);
    expect(spec.restartPolicy?.name).toBe('always');
    expect(spec.resourceLimits?.cpus).toBe(1.5);
    expect(spec.resourceLimits?.memoryBytes).toBe(512 * 1024 * 1024);
    expect(spec.privileged).toBe(true);
    expect(spec.capabilities?.add).toEqual(['NET_ADMIN']);
    expect(spec.start).toBe(true);
  });

  // container-create-form.md — "Create only" submits the same configuration, without starting it
  it('submits with start off from the create-only action', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await user.click(screen.getByRole('button', { name: 'Create only' }));

    await waitFor(() => expect(createContainer).toHaveBeenCalled());
    expect(submittedSpec().start).toBe(false);
  });

  // container-create-form.md — the maximum-retries field appears only for the on-failure policy
  it('offers a maximum-retries field only for the on-failure restart policy', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.queryByRole('spinbutton', { name: 'Maximum retry count' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Restart policy' }), 'on-failure');

    expect(screen.getByRole('spinbutton', { name: 'Maximum retry count' })).toBeInTheDocument();
  });

  // container-create-form.md — a successful creation reports the container and calls onCreated
  it('reports the created container and hands it to onCreated', async () => {
    const user = userEvent.setup();
    const { onCreated } = renderForm();

    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdResult));
  });

  // container-create-form.md — each daemon warning is reported through the error reporter
  it("reports each of the daemon's warnings", async () => {
    const user = userEvent.setup();
    createContainer.mockResolvedValue({ ...createdResult, warnings: ['the requested platform does not match'] });
    renderForm();

    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    await waitFor(() => expect(screen.getByText(/the requested platform does not match/)).toBeInTheDocument());
  });

  // container-create-form.md — cancel creates nothing
  it('creates nothing when the form is cancelled', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderForm();

    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(createContainer).not.toHaveBeenCalled();
  });
});

describe('ContainerCreateForm — image choice and pull (plan-docker_management_app/REQ-29)', () => {
  // container-create-form.md — the local images are offered as suggestions, by tag
  it("offers every local image's tag as a suggestion", async () => {
    const user = userEvent.setup();
    renderForm({ images: [makeImage({ tags: ['nginx:1.27', 'nginx:latest'] }), makeImage({ id: 'sha256:beef', shortId: 'beefbeefbeef', tags: [] })] });

    await user.click(screen.getByRole('combobox', { name: 'Image reference' }));

    expect(screen.getByRole('option', { name: /nginx:1\.27/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /nginx:latest/ })).toBeInTheDocument();
    // An untagged image is still offered, by its short id.
    expect(screen.getByRole('option', { name: /beefbeefbeef/ })).toBeInTheDocument();
  });

  // container-create-form.md — choosing a suggestion fills the reference that is then submitted
  it('submits the reference chosen among the local images', async () => {
    const user = userEvent.setup();
    renderForm({ images: [makeImage({ tags: ['nginx:1.27'] })] });

    await user.click(screen.getByRole('combobox', { name: 'Image reference' }));
    await user.click(screen.getByRole('option', { name: /nginx:1\.27/ }));
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    await waitFor(() => expect(createContainer).toHaveBeenCalled());
    expect(submittedSpec().image).toBe('nginx:1.27');
  });

  // container-create-form.md — a reference that is not among the local images can still be typed and submitted (it is pulled)
  it('submits a freely typed reference that matches no local image', async () => {
    const user = userEvent.setup();
    renderForm({ images: [makeImage({ tags: ['nginx:1.27'] })] });

    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'ghcr.io/acme/api:2.1');
    await user.type(screen.getByRole('textbox', { name: 'Platform' }), 'linux/arm64');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    await waitFor(() => expect(createContainer).toHaveBeenCalled());
    expect(submittedSpec().image).toBe('ghcr.io/acme/api:2.1');
    expect(submittedSpec().platform).toBe('linux/arm64');
  });

  // container-create-form.md — initialImage pre-fills the reference ("run this image" from an image row)
  it('pre-fills the reference it is opened with', () => {
    renderForm({ initialImage: 'alpine:3.20' });

    expect(screen.getByRole('combobox', { name: 'Image reference' })).toHaveValue('alpine:3.20');
  });

  // container-create-form.md — the pull progress is shown while the image is being fetched
  it('shows the per-layer pull progress while the image is being pulled', async () => {
    const user = userEvent.setup();
    let reportStep: ((step: { id: string; status: string; currentBytes?: number; totalBytes?: number }) => void) | undefined;
    createContainer.mockImplementation((_spec: ContainerCreateSpec, handlers: { onPullStep?: (step: unknown) => void }) => {
      reportStep = handlers.onPullStep as typeof reportStep;
      return new Promise(() => undefined); // still pulling
    });
    renderForm();

    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'ghcr.io/acme/api:2.1');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));
    await waitFor(() => expect(reportStep).toBeDefined());
    reportStep!({ id: 'layer-1', status: 'Downloading', currentBytes: 30, totalBytes: 100 });

    await waitFor(() => expect(screen.getByText('Pulling the image')).toBeInTheDocument());
    expect(screen.getByText(/layer-1 — Downloading/)).toBeInTheDocument();
  });

  // container-create-form.md — while the creation is in flight the sheet is busy: the commit actions and cancel are disabled
  it('disables the commit actions and cancel while the creation is in flight', async () => {
    const user = userEvent.setup();
    createContainer.mockImplementation(() => new Promise(() => undefined));
    renderForm();

    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Create only' })).toBeDisabled();
  });
});

describe('ContainerCreateForm — local validation (plan-docker_management_app/REQ-28)', () => {
  // container-create-form.md — a validation message is reported only after the first submission attempt
  it('reports no validation message before the first submission attempt', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByRole('textbox', { name: 'Container name' }), '-invalid name');

    expect(screen.queryByText(/Use letters, digits/)).not.toBeInTheDocument();
    expect(screen.queryByText(/image reference is required/i)).not.toBeInTheDocument();
  });

  // container-create-form.md — an image reference is required; a submission with a pending validation performs no call
  it('refuses to submit without an image reference and calls nothing', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    expect(createContainer).not.toHaveBeenCalled();
    expect(screen.getByText(/image reference is required/i)).toBeInTheDocument();
  });

  // container-create-form.md — a container name, when given, must match [a-zA-Z0-9][a-zA-Z0-9_.-]*
  it('refuses to submit an invalid container name', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await user.type(screen.getByRole('textbox', { name: 'Container name' }), '-bad name');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    expect(createContainer).not.toHaveBeenCalled();
    expect(screen.getByText(/Use letters, digits/)).toBeInTheDocument();
  });

  // container-create-form.md — every port mapping needs a container port in 1–65535
  it('refuses to submit a port mapping without a valid container port', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await user.click(screen.getByRole('button', { name: 'Add port mapping' }));
    await user.type(screen.getByRole('textbox', { name: 'Container port 1' }), '70000');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    expect(createContainer).not.toHaveBeenCalled();
    expect(screen.getByText(/container port between 1 and 65535/i)).toBeInTheDocument();
  });

  // container-create-form.md — a host port, when given, must be in the same range
  it('refuses to submit a host port outside the valid range', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await user.click(screen.getByRole('button', { name: 'Add port mapping' }));
    await user.type(screen.getByRole('textbox', { name: 'Container port 1' }), '80');
    await user.type(screen.getByRole('textbox', { name: 'Host port 1' }), '99999');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    expect(createContainer).not.toHaveBeenCalled();
    expect(screen.getByText(/host port must be between 1 and 65535/i)).toBeInTheDocument();
  });

  // container-create-form.md — every mount needs a source and an absolute container path
  it('refuses to submit a mount whose container path is not absolute', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await user.click(screen.getByRole('button', { name: 'Add mount' }));
    await user.type(screen.getByRole('textbox', { name: 'Mount source 1' }), 'site-data');
    await user.type(screen.getByRole('textbox', { name: 'Mount destination 1' }), 'relative/path');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    expect(createContainer).not.toHaveBeenCalled();
    expect(screen.getByText(/container path must be absolute/i)).toBeInTheDocument();
  });

  // container-create-form.md — every environment variable needs a name, without "="
  it('refuses to submit an environment variable whose name carries an "="', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await user.click(screen.getByRole('button', { name: 'Add variable' }));
    await user.type(screen.getByRole('textbox', { name: 'Environment Key 1' }), 'MODE=production');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    expect(createContainer).not.toHaveBeenCalled();
    expect(screen.getByText(/needs a name, without/i)).toBeInTheDocument();
  });

  // container-create-form.md — a CPU or memory limit, when given, must be greater than zero
  it('refuses to submit a CPU limit of zero', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await user.type(screen.getByRole('spinbutton', { name: 'CPU limit' }), '0');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    expect(createContainer).not.toHaveBeenCalled();
    expect(screen.getByText(/greater than zero/i)).toBeInTheDocument();
  });
});

describe('ContainerCreateForm — daemon refusal (plan-docker_management_app/REQ-28, REQ-29)', () => {
  const REFUSAL = 'Conflict. The container name "/web-frontend" is already in use by container "abc123"';

  async function submitRefusedConfiguration(user: ReturnType<typeof userEvent.setup>) {
    createContainer.mockRejectedValue(new Error(REFUSAL));
    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await user.type(screen.getByRole('textbox', { name: 'Container name' }), 'web-frontend');
    await user.type(screen.getByRole('textbox', { name: 'Command' }), 'nginx -g daemon');
    await user.click(screen.getByRole('button', { name: 'Add variable' }));
    await user.type(screen.getByRole('textbox', { name: 'Environment Key 1' }), 'MODE');
    await user.type(screen.getByRole('textbox', { name: 'Environment Value 1' }), 'production');
    await user.click(screen.getByRole('button', { name: 'Add port mapping' }));
    await user.type(screen.getByRole('textbox', { name: 'Container port 1' }), '80');
    await user.type(screen.getByRole('textbox', { name: 'Network name' }), 'front{Enter}');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));
    await waitFor(() => expect(createContainer).toHaveBeenCalled());
  }

  // container-create-form.md — the daemon's own message is shown, verbatim, in the sheet's pinned banner
  it("shows the daemon's own refusal message", async () => {
    const user = userEvent.setup();
    renderForm();

    await submitRefusedConfiguration(user);

    await waitFor(() => expect(screen.getByText(REFUSAL)).toBeInTheDocument());
  });

  // container-create-form.md — a refusal leaves the sheet open with every entered value untouched
  it('keeps the sheet open with every entered value in place after a refusal', async () => {
    const user = userEvent.setup();
    const { onCreated, onCancel } = renderForm();

    await submitRefusedConfiguration(user);
    await waitFor(() => expect(screen.getByText(REFUSAL)).toBeInTheDocument());

    expect(screen.getByRole('combobox', { name: 'Image reference' })).toHaveValue('nginx:1.27');
    expect(screen.getByRole('textbox', { name: 'Container name' })).toHaveValue('web-frontend');
    expect(screen.getByRole('textbox', { name: 'Command' })).toHaveValue('nginx -g daemon');
    expect(screen.getByRole('textbox', { name: 'Environment Key 1' })).toHaveValue('MODE');
    expect(screen.getByRole('textbox', { name: 'Environment Value 1' })).toHaveValue('production');
    expect(screen.getByRole('textbox', { name: 'Container port 1' })).toHaveValue('80');
    expect(screen.getByText('front')).toBeInTheDocument();
    // Nothing was created, and the sheet was not dismissed.
    expect(onCreated).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  // container-create-form.md — the kept values can be corrected and re-submitted as they stand
  it('re-submits the corrected configuration after a refusal', async () => {
    const user = userEvent.setup();
    renderForm();

    await submitRefusedConfiguration(user);
    await waitFor(() => expect(screen.getByText(REFUSAL)).toBeInTheDocument());

    createContainer.mockResolvedValue(createdResult);
    await user.clear(screen.getByRole('textbox', { name: 'Container name' }));
    await user.type(screen.getByRole('textbox', { name: 'Container name' }), 'web-frontend-2');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    await waitFor(() => expect(createContainer).toHaveBeenCalledTimes(2));
    const spec = submittedSpec();
    expect(spec.name).toBe('web-frontend-2');
    expect(spec.image).toBe('nginx:1.27');
    expect(spec.env).toEqual(['MODE=production']);
    expect(spec.ports).toEqual([{ containerPort: 80, protocol: 'tcp', hostPort: undefined, hostIp: undefined }]);
    expect(spec.networks).toEqual(['front']);
  });

  // container-create-form.md — the commit actions are usable again once the refusal is in
  it('re-enables the commit actions after a refusal', async () => {
    const user = userEvent.setup();
    renderForm();

    await submitRefusedConfiguration(user);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create and start' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});

describe('ContainerCreateForm — opening (containers/specs/container-create-form.md)', () => {
  // container-create-form.md — nothing is shown while the form is closed
  it('shows nothing while it is closed', () => {
    renderForm({ open: false });

    expect(screen.queryByRole('combobox', { name: 'Image reference' })).not.toBeInTheDocument();
  });

  // container-create-form.md — the form is reset to its initial values when it opens
  it('starts from a clean form, pre-filled with the requested image, on every opening', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ErrorReportingProvider>
        <ToastProvider>
          <ContainerCreateForm open images={[makeImage()]} onCancel={vi.fn()} onCreated={vi.fn()} />
        </ToastProvider>
      </ErrorReportingProvider>,
    );
    await user.type(screen.getByRole('textbox', { name: 'Container name' }), 'left-over');

    rerender(
      <ErrorReportingProvider>
        <ToastProvider>
          <ContainerCreateForm open={false} images={[makeImage()]} onCancel={vi.fn()} onCreated={vi.fn()} />
        </ToastProvider>
      </ErrorReportingProvider>,
    );
    rerender(
      <ErrorReportingProvider>
        <ToastProvider>
          <ContainerCreateForm open images={[makeImage()]} initialImage="alpine:3.20" onCancel={vi.fn()} onCreated={vi.fn()} />
        </ToastProvider>
      </ErrorReportingProvider>,
    );

    expect(screen.getByRole('textbox', { name: 'Container name' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Image reference' })).toHaveValue('alpine:3.20');
  });

  // container-create-form.md — while the local images are still being read, the combobox reports it
  it('reports that the local images are still being read', async () => {
    const user = userEvent.setup();
    renderForm({ images: [], imagesLoaded: false });

    await user.click(screen.getByRole('combobox', { name: 'Image reference' }));

    expect(within(screen.getByRole('listbox')).getByText(/Loading/i)).toBeInTheDocument();
  });
});

describe('ContainerCreateForm — the two key/value editors are told apart (containers/specs/container-create-form.md)', () => {
  async function addOneVariableAndOneLabel(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Add variable' }));
    await user.click(screen.getByRole('button', { name: 'Add label' }));
  }

  // container-create-form.md — no two fields of the sheet share an accessible name
  it('announces the environment rows and the label rows under names of their own', async () => {
    const user = userEvent.setup();
    renderForm();

    await addOneVariableAndOneLabel(user);

    // Each name resolves to exactly one field of the whole sheet: what a screen
    // reader announces is enough to tell an environment row from a label row.
    for (const name of ['Environment Key 1', 'Environment Value 1', 'Labels Key 1', 'Labels Value 1']) {
      expect(screen.getAllByRole('textbox', { name })).toHaveLength(1);
    }
    for (const name of ['Key 1', 'Value 1']) {
      expect(screen.queryAllByRole('textbox', { name })).toHaveLength(0);
    }
  });

  // container-create-form.md — the two remove actions are distinguishable too, empty rows included
  it('announces the two remove actions under names of their own', async () => {
    const user = userEvent.setup();
    renderForm();

    await addOneVariableAndOneLabel(user);

    expect(screen.getAllByRole('button', { name: 'Remove pair 1 from Environment' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Remove pair 1 from Labels' })).toHaveLength(1);
    expect(screen.queryAllByRole('button', { name: 'Remove pair 1' })).toHaveLength(0);
  });

  // container-create-form.md — a row filled in through its announced name lands in the right group of the configuration
  it('submits a row typed through its announced name into that row\'s own group', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByRole('combobox', { name: 'Image reference' }), 'nginx:1.27');
    await addOneVariableAndOneLabel(user);
    await user.type(screen.getByRole('textbox', { name: 'Environment Key 1' }), 'MODE');
    await user.type(screen.getByRole('textbox', { name: 'Environment Value 1' }), 'production');
    await user.type(screen.getByRole('textbox', { name: 'Labels Key 1' }), 'team');
    await user.type(screen.getByRole('textbox', { name: 'Labels Value 1' }), 'vexel');
    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    await waitFor(() => expect(createContainer).toHaveBeenCalled());
    const spec = submittedSpec();
    expect(spec.env).toEqual(['MODE=production']);
    expect(spec.labels).toEqual({ team: 'vexel' });
  });
});
