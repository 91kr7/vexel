import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CliPlugin, DaemonPlugin, PluginInspect, PluginListing, PluginPrivilege } from '../../src/data/plugins-client';
import type { UsePluginsResult } from '../../src/data/use-plugins';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
import { ErrorReportingProvider, useErrorReporter } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';
import { ToastProvider } from '../../src/ui';

// The Plugins screen (plugins/specs/plugins-screen.md, REQ-98, REQ-99,
// REQ-111). The hook is mocked so the screen's own decisions are what is under
// test — above all the one REQ-99 turns on: nothing is installed by a single
// click, the privileges are always shown, and only an explicit grant installs.

const hook = {
  readPrivileges: vi.fn(),
  install: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  inspect: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
};

let reading: { cli: PluginListing<CliPlugin>; daemon: PluginListing<DaemonPlugin>; loaded: boolean; error?: string } = {
  cli: { items: [] },
  daemon: { items: [] },
  loaded: true,
};

vi.mock('../../src/data/use-plugins', () => ({
  usePlugins: (): UsePluginsResult => ({ ...reading, ...hook }),
}));

const { PluginsScreen } = await import('../../src/plugins/PluginsScreen');

const ASKED_FOR: PluginPrivilege[] = [
  { name: 'network', description: 'permissions to access a network', values: ['host'] },
  { name: 'mount', description: 'host path to mount', values: ['/var/lib/docker/plugins'] },
];

function cliPlugin(overrides: Partial<CliPlugin> = {}): CliPlugin {
  return { name: 'compose', command: 'docker compose', version: 'v2.40.0', availability: 'enabled', ...overrides };
}

function daemonPlugin(overrides: Partial<DaemonPlugin> = {}): DaemonPlugin {
  return {
    id: 'plugin-id',
    name: 'vieux/sshfs:latest',
    enabled: false,
    interfaceTypes: ['docker.volumedriver/1.0'],
    type: 'volume driver',
    ...overrides,
  };
}

function inspection(overrides: Partial<PluginInspect> = {}): PluginInspect {
  return {
    ...daemonPlugin(),
    documentation: 'https://docs.docker.com/engine/extend/',
    mounts: ['/var/lib/docker/plugins → /mnt/state'],
    devices: ['/dev/fuse'],
    capabilities: ['CAP_SYS_ADMIN'],
    env: [],
    raw: { Id: 'plugin-id' },
    ...overrides,
  };
}

/** Surfaces what the screen reported through the shared error service, so the assertion can read it. */
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

function renderScreen() {
  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <PluginsScreen />
            <ReportedErrors />
          </ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );
}

function panel(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name: title });
  return heading.closest('.ui-surface') as HTMLElement;
}

function rowsOf(title: string): HTMLElement[] {
  return Array.from(panel(title).querySelectorAll<HTMLElement>('.ui-card-list__item'));
}

function daemonRow(name: string): HTMLElement {
  const row = rowsOf('Daemon plugins').find((candidate) => candidate.querySelector('.ui-card-list__title')?.textContent === name);
  if (!row) throw new Error(`no daemon row named ${name}`);
  return row;
}

beforeEach(() => {
  for (const spy of Object.values(hook)) spy.mockReset();
  hook.readPrivileges.mockResolvedValue(ASKED_FOR);
  hook.install.mockResolvedValue(daemonPlugin({ enabled: true }));
  hook.enable.mockResolvedValue(daemonPlugin({ enabled: true }));
  hook.disable.mockResolvedValue(daemonPlugin());
  hook.inspect.mockResolvedValue(inspection());
  hook.remove.mockResolvedValue(undefined);
  reading = { cli: { items: [] }, daemon: { items: [] }, loaded: true };
});

afterEach(cleanup);

describe('PluginsScreen — the two inventories (plugins/specs/plugins-screen.md)', () => {
  // plan-docker_management_app/REQ-98 — CLI plugins listed with name, version and availability;
  // plugins-screen.md — "the invocation (docker compose), its version and its availability as a
  // badge reading enabled, available or unavailable"
  it('shows each CLI plugin with its invocation, version and availability badge', () => {
    reading.cli = {
      items: [
        cliPlugin(),
        cliPlugin({ name: 'sbom', command: 'docker sbom', version: 'v0.6.0', availability: 'available' }),
      ],
    };
    renderScreen();

    const rows = rowsOf('CLI plugins');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('docker compose')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('v2.40.0')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('enabled')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('available')).toBeInTheDocument();
  });

  // plugins-screen.md — "a plugin the installation refuses to run states why on the row; a working
  // one is a single line"
  it('states on the row why the installation refuses to run a plugin, and says nothing extra about a working one', () => {
    reading.cli = {
      items: [cliPlugin(), cliPlugin({ name: 'broken', command: 'docker broken', availability: 'unavailable', unavailableReason: 'accessing plugin: permission denied' })],
    };
    renderScreen();

    const rows = rowsOf('CLI plugins');
    expect(rows[0]!.querySelectorAll('.ui-card-list__subtitle')).toHaveLength(0);
    expect(within(rows[1]!).getByText('accessing plugin: permission denied')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('unavailable')).toBeInTheDocument();
  });

  // plugins-screen.md — "a plugin the installation reports no version for reads 'unavailable' in the
  // version's place, with the reason on hover"
  it('reads unavailable in the version place for a plugin the installation gives no version for', () => {
    reading.cli = { items: [cliPlugin({ version: undefined })] };
    renderScreen();

    const version = rowsOf('CLI plugins')[0]!.querySelector('.ui-table-meta-cell') as HTMLElement;
    expect(version.textContent).toBe('unavailable');
    expect(version.getAttribute('title')).toBeTruthy();
  });

  // plan-docker_management_app/REQ-99 — daemon plugins listed with name, type and enabled/disabled;
  // plugins-screen.md — "the interface it implements in words ... and a badge reading
  // enabled/disabled"
  it('shows each daemon plugin with its name, its interface in words and its state', () => {
    reading.daemon = {
      items: [daemonPlugin(), daemonPlugin({ name: 'loki:latest', type: 'log driver', enabled: true })],
    };
    renderScreen();

    const row = daemonRow('vieux/sshfs:latest');
    expect(within(row).getByText('volume driver')).toBeInTheDocument();
    expect(within(row).getByText('disabled')).toBeInTheDocument();
    const enabledRow = daemonRow('loki:latest');
    expect(within(enabledRow).getByText('log driver')).toBeInTheDocument();
    expect(within(enabledRow).getByText('enabled')).toBeInTheDocument();
  });

  // plugins-screen.md — "Either panel with nothing to show says why when the reading came with a
  // reason ... and otherwise simply states there is none."
  it('says why a panel is empty when the reading came with a reason', () => {
    reading.cli = { items: [], unavailableReason: 'This Docker installation does not expose a CLI plugin inventory.' };
    reading.daemon = { items: [], unavailableReason: 'This daemon does not expose managed plugins.' };
    renderScreen();

    expect(screen.getByText('This Docker installation does not expose a CLI plugin inventory.')).toBeInTheDocument();
    expect(screen.getByText('This daemon does not expose managed plugins.')).toBeInTheDocument();
  });

  it('simply states there is none when a panel is empty for no stated reason', () => {
    renderScreen();

    expect(within(panel('CLI plugins')).getByText('No CLI plugins')).toBeInTheDocument();
    expect(within(panel('Daemon plugins')).getByText('No daemon plugins')).toBeInTheDocument();
  });

  // plugins-screen.md — "A failed reading shows the failure with a retry, without hiding the panels."
  it('shows a failed reading with a retry, keeping both panels', async () => {
    reading.error = 'the daemon is unreachable';
    reading.cli = { items: [cliPlugin()] };
    renderScreen();

    expect(screen.getByText('the daemon is unreachable')).toBeInTheDocument();
    expect(panel('CLI plugins')).toBeInTheDocument();
    expect(panel('Daemon plugins')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(hook.refresh).toHaveBeenCalled();
  });
});

describe('PluginsScreen — installing (REQ-99)', () => {
  /** Opens the install form and asks for the reference to be reviewed. */
  async function submitInstallForm(user: ReturnType<typeof userEvent.setup>, remote: string, alias?: string) {
    await user.click(screen.getByRole('button', { name: 'Install plugin' }));
    await user.type(screen.getByRole('textbox', { name: 'Plugin reference' }), remote);
    if (alias) await user.type(screen.getByRole('textbox', { name: 'Plugin alias' }), alias);
    await user.click(screen.getByRole('button', { name: 'Review privileges' }));
  }

  // plan-docker_management_app/REQ-99, plugins-screen.md — "Submitting installs nothing: it reads
  // the privileges the reference asks for and opens the confirmation that shows them."
  it('installs nothing on submit: it reads the privileges and shows every one of them', async () => {
    const user = userEvent.setup();
    renderScreen();

    await submitInstallForm(user, 'vieux/sshfs:latest');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Confirm: vieux/sshfs:latest' })).toBeInTheDocument());
    expect(hook.readPrivileges).toHaveBeenCalledWith('vieux/sshfs:latest');
    expect(hook.install).not.toHaveBeenCalled();
    for (const privilege of ASKED_FOR) {
      expect(screen.getByText(privilege.name)).toBeInTheDocument();
      expect(screen.getByText(privilege.values.join(', '))).toBeInTheDocument();
    }
  });

  // plugins-screen.md — "granting installs"; the granted set is the one that was read, and the
  // switch decides whether it is left enabled. "A successful install is announced, saying whether
  // the plugin was left enabled or disabled."
  it('installs only once the privileges are granted, with exactly the set that was shown', async () => {
    const user = userEvent.setup();
    renderScreen();

    await submitInstallForm(user, 'vieux/sshfs:latest', 'sshfs');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Confirm: vieux/sshfs:latest' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Grant and install' }));

    await waitFor(() => expect(hook.install).toHaveBeenCalledTimes(1));
    expect(hook.install).toHaveBeenCalledWith({
      remote: 'vieux/sshfs:latest',
      alias: 'sshfs',
      grantedPrivileges: ASKED_FOR,
      enable: true,
    });
    expect(await screen.findByText(/installed and enabled/)).toBeInTheDocument();
  });

  // plugins-screen.md — the form carries "a switch for enabling it once installed (on by default)",
  // and a successful install says which of the two it was.
  it('leaves the plugin disabled when the switch is turned off, and says so', async () => {
    hook.install.mockResolvedValue(daemonPlugin({ enabled: false }));
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Install plugin' }));
    const enableSwitch = screen.getByRole('checkbox', { name: 'Enable once installed' });
    expect(enableSwitch).toBeChecked();
    await user.click(enableSwitch);
    await user.type(screen.getByRole('textbox', { name: 'Plugin reference' }), 'vieux/sshfs:latest');
    await user.click(screen.getByRole('button', { name: 'Review privileges' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Grant and install' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Grant and install' }));

    await waitFor(() => expect(hook.install).toHaveBeenCalledWith(expect.objectContaining({ enable: false })));
    expect(await screen.findByText(/installed and left disabled/)).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-99, plugins-screen.md — "cancelling installs nothing and gives
  // the form back with what was typed in it"
  it('installs nothing when the grant is refused, and gives the form back with what was typed', async () => {
    const user = userEvent.setup();
    renderScreen();

    await submitInstallForm(user, 'vieux/sshfs:latest', 'sshfs');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Confirm: vieux/sshfs:latest' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(hook.install).not.toHaveBeenCalled();
    const reference = await screen.findByRole('textbox', { name: 'Plugin reference' });
    expect(reference).toHaveValue('vieux/sshfs:latest');
    expect(screen.getByRole('textbox', { name: 'Plugin alias' })).toHaveValue('sshfs');
  });

  // plugins-screen.md — "Every failure — install, enable, disable, remove — is reported with the
  // daemon's own message"; the form comes back so the operator can act on it.
  it('reports a refused install with the daemon own message, and gives the form back', async () => {
    hook.install.mockRejectedValue(new Error('The privileges granted are not the ones it asks for. Nothing has been installed.'));
    const user = userEvent.setup();
    renderScreen();

    await submitInstallForm(user, 'vieux/sshfs:latest');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Grant and install' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Grant and install' }));

    expect(await screen.findByText(/Nothing has been installed\./)).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Plugin reference' })).toHaveValue('vieux/sshfs:latest');
  });

  // plugins-screen.md — "A reference asking for nothing says so in the dialog and still has to be
  // granted. A reference nobody publishes reads the same way — the daemon cannot tell the two apart
  // before the pull — and the install that follows the grant then fails with the daemon's own
  // message, having installed nothing."
  it('says a reference asks for nothing, still requires a grant, and reports the pull that then fails', async () => {
    hook.readPrivileges.mockResolvedValue([]);
    hook.install.mockRejectedValue(new Error('manifest for someone/no-such-plugin:v1 not found'));
    const user = userEvent.setup();
    renderScreen();

    await submitInstallForm(user, 'someone/no-such-plugin:v1');

    // The dialog says nothing is being asked for — and the grant is still explicit.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Confirm: someone/no-such-plugin:v1' })).toBeInTheDocument());
    expect(screen.getByText('This plugin asks for no special privileges.')).toBeInTheDocument();
    expect(hook.install).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Grant and install' }));

    expect(await screen.findByText(/manifest for someone\/no-such-plugin:v1 not found/)).toBeInTheDocument();
    expect(hook.install).toHaveBeenCalledWith(expect.objectContaining({ grantedPrivileges: [] }));
  });

  // plugins-screen.md — a failed reading of the privileges is a failure of the install, and nothing
  // is installed: there is nothing to grant.
  it('installs nothing when the privileges cannot even be read', async () => {
    hook.readPrivileges.mockRejectedValue(new Error('manifest for vieux/sshfs:latest not found'));
    const user = userEvent.setup();
    renderScreen();

    await submitInstallForm(user, 'vieux/sshfs:latest');

    expect(await screen.findByText(/manifest for vieux\/sshfs:latest not found/)).toBeInTheDocument();
    expect(hook.install).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Grant and install' })).not.toBeInTheDocument();
  });
});

describe('PluginsScreen — the row controls (REQ-111)', () => {
  beforeEach(() => {
    reading.daemon = { items: [daemonPlugin()] };
  });

  // plugins-screen.md — "the row's switch -> enables or disables the plugin"; "Removal is the only
  // destructive action here and always goes through the confirmation; enabling and disabling do not"
  it('enables the plugin from the row switch, without a confirmation', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(within(daemonRow('vieux/sshfs:latest')).getByRole('checkbox', { name: 'Enable vieux/sshfs:latest' }));

    await waitFor(() => expect(hook.enable).toHaveBeenCalledWith('vieux/sshfs:latest'));
    expect(screen.queryByRole('heading', { name: /^Confirm:/ })).not.toBeInTheDocument();
  });

  it('disables an enabled plugin from the same switch', async () => {
    reading.daemon = { items: [daemonPlugin({ enabled: true })] };
    const user = userEvent.setup();
    renderScreen();

    await user.click(within(daemonRow('vieux/sshfs:latest')).getByRole('checkbox', { name: 'Disable vieux/sshfs:latest' }));

    await waitFor(() => expect(hook.disable).toHaveBeenCalledWith('vieux/sshfs:latest'));
  });

  // plugins-screen.md — the switch "stays on the value that is still true and shows itself busy
  // until the daemon confirms" (toggle.md: a busy switch never shows the value it was asked for)
  it('keeps the switch on the value that is still true, and busy, until the daemon confirms', async () => {
    let settle: (value: DaemonPlugin) => void = () => undefined;
    hook.enable.mockReturnValue(new Promise<DaemonPlugin>((resolve) => (settle = resolve)));
    const user = userEvent.setup();
    renderScreen();

    await user.click(within(daemonRow('vieux/sshfs:latest')).getByRole('checkbox', { name: 'Enable vieux/sshfs:latest' }));

    const control = within(daemonRow('vieux/sshfs:latest')).getByRole('checkbox', { name: 'Enable vieux/sshfs:latest' });
    expect(control).toHaveAttribute('aria-busy', 'true');
    expect(control).not.toBeChecked();

    settle(daemonPlugin({ enabled: true }));
    await waitFor(() => expect(within(daemonRow('vieux/sshfs:latest')).getByRole('checkbox')).not.toHaveAttribute('aria-busy'));
  });

  // plugins-screen.md — "Every failure ... is reported with the daemon's own message, and leaves the
  // list showing what is actually true."
  it('reports a refused state change with the daemon own message, leaving the row as it was', async () => {
    hook.enable.mockRejectedValue(new Error('failed to create shim task: no such file or directory'));
    const user = userEvent.setup();
    renderScreen();

    await user.click(within(daemonRow('vieux/sshfs:latest')).getByRole('checkbox', { name: 'Enable vieux/sshfs:latest' }));

    expect(await screen.findByText(/failed to create shim task/)).toBeInTheDocument();
    expect(within(daemonRow('vieux/sshfs:latest')).getByRole('checkbox')).not.toBeChecked();
    expect(within(daemonRow('vieux/sshfs:latest')).getByText('disabled')).toBeInTheDocument();
  });

  // plugins-screen.md — "'Inspect' -> opens the plugin's full reading under its row ...; pressing it
  // again closes it."
  it('opens the full reading under the row and closes it when pressed again', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(within(daemonRow('vieux/sshfs:latest')).getByRole('button', { name: 'Inspect' }));

    const expanded = await waitFor(() => {
      const region = daemonRow('vieux/sshfs:latest').parentElement?.querySelector('.ui-card-list__expanded');
      if (!region) throw new Error('the inspection is not open');
      return region as HTMLElement;
    });
    expect(hook.inspect).toHaveBeenCalledWith('vieux/sshfs:latest');
    expect(within(expanded).getByText('CAP_SYS_ADMIN')).toBeInTheDocument();
    expect(within(expanded).getByText('/dev/fuse')).toBeInTheDocument();
    expect(within(expanded).getByText('https://docs.docker.com/engine/extend/')).toBeInTheDocument();

    await user.click(within(daemonRow('vieux/sshfs:latest')).getByRole('button', { name: 'Hide' }));

    await waitFor(() =>
      expect(daemonRow('vieux/sshfs:latest').parentElement?.querySelector('.ui-card-list__expanded')).toBeNull(),
    );
  });

  // plugins-screen.md — a failed inspection is reported, and no panel is hidden by it
  it('reports a failed inspection without hiding the list', async () => {
    hook.inspect.mockRejectedValue(new Error('plugin not found'));
    const user = userEvent.setup();
    renderScreen();

    await user.click(within(daemonRow('vieux/sshfs:latest')).getByRole('button', { name: 'Inspect' }));

    expect(await screen.findByText(/plugin not found/)).toBeInTheDocument();
    expect(daemonRow('vieux/sshfs:latest')).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-6, plan-docker_management_app/REQ-111 — the removal "being
  // treated as destructive"; plugins-screen.md — the confirmation names the plugin and states that
  // its data goes with it and that an enabled plugin must be disabled first.
  it('asks for a destructive confirmation naming the plugin before removing it', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(within(daemonRow('vieux/sshfs:latest')).getByRole('button', { name: 'Remove' }));

    const heading = await screen.findByRole('heading', { name: 'Confirm: vieux/sshfs:latest' });
    expect(document.body.textContent).toContain('disabled first');
    expect(hook.remove).not.toHaveBeenCalled();

    // The confirming control carries the destructive tone (REQ-6).
    const modal = heading.closest('.ui-modal') as HTMLElement;
    const confirmRemoval = within(modal).getByRole('button', { name: 'Remove' });
    expect(confirmRemoval.className).toContain('destructive');

    await user.click(confirmRemoval);
    await waitFor(() => expect(hook.remove).toHaveBeenCalledWith('vieux/sshfs:latest'));
  });

  // plan-docker_management_app/REQ-6 — "cancelling performs nothing"
  it('removes nothing when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(within(daemonRow('vieux/sshfs:latest')).getByRole('button', { name: 'Remove' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(hook.remove).not.toHaveBeenCalled();
  });

  // plugins-screen.md — "Every failure ... is reported with the daemon's own message" — the removal
  // of an enabled plugin is refused by the daemon, and nothing is forced.
  it('reports a refused removal with the daemon own message', async () => {
    hook.remove.mockRejectedValue(new Error('plugin vieux/sshfs:latest is enabled'));
    const user = userEvent.setup();
    renderScreen();

    await user.click(within(daemonRow('vieux/sshfs:latest')).getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('heading', { name: 'Confirm: vieux/sshfs:latest' });
    const modal = dialog.closest('.ui-modal') as HTMLElement;
    await user.click(within(modal).getByRole('button', { name: 'Remove' }));

    expect(await screen.findByText(/plugin vieux\/sshfs:latest is enabled/)).toBeInTheDocument();
  });

  // plugins-screen.md — "The CLI panel is read-only — those plugins are files the operator installs
  // themselves."
  it('offers no control on a CLI plugin row', () => {
    reading.cli = { items: [cliPlugin()] };
    renderScreen();

    const row = rowsOf('CLI plugins')[0]!;
    expect(within(row).queryAllByRole('button')).toHaveLength(0);
    expect(within(row).queryAllByRole('checkbox')).toHaveLength(0);
  });
});
