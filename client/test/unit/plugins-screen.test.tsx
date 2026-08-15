import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CliPlugin, DaemonPlugin, PluginInspect, PluginListing, PluginPrivilege } from '../../src/data/plugins-client';
import type { UsePluginsResult } from '../../src/data/use-plugins';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
import { ErrorReportingProvider, useErrorReporter } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';
import { ToastProvider } from '../../src/ui';

/**
 * The Plugins screen (`plugins/specs/plugins-screen.md`;
 * `plan-docker_management_app/REQ-98`, `REQ-99`, `REQ-111`, and
 * `plan-ui-coherence-optimisation/REQ-46`, `REQ-47`, `REQ-48`).
 *
 * The hook is mocked so the screen's own decisions are what is under test —
 * above all the one REQ-99 turns on: nothing is installed by a single click, the
 * privileges are always shown, and only an explicit grant installs.
 *
 * What a jsdom render can say about a row is **structural**: which column a
 * value is stated in, how many lines a cell draws, what an empty result is made
 * of. The boxes — the availability pill's left edge down the column (REQ-47),
 * equal row heights, the stacked lists at the content column's width and the
 * inspection panel's — are measured in a browser, in
 * `e2e/plugins-row-geometry.spec.ts`. Neither replaces the other.
 */

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

/** The card carrying one of the two inventories, by the section header naming it. */
function card(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name: title });
  return heading.closest('.ui-surface') as HTMLElement;
}

function list(title: string): HTMLElement {
  return card(title).querySelector('.ui-data-table') as HTMLElement;
}

function rowsOf(title: string): HTMLElement[] {
  return Array.from(card(title).querySelectorAll<HTMLElement>('.ui-data-table__row'));
}

function headersOf(title: string): string[] {
  return Array.from(list(title).querySelectorAll('.ui-data-table__header-cell')).map((cell) => (cell.textContent ?? '').trim());
}

function rowOf(title: string, name: string): HTMLElement {
  const found = rowsOf(title).find((row) => (row.textContent ?? '').includes(name));
  expect(found, `no row of the ${title} list states ${name}`).toBeDefined();
  return found!;
}

function daemonRow(name: string): HTMLElement {
  return rowOf('Daemon plugins', name);
}

/**
 * The cell of a row belonging to the column whose header matches `header`.
 *
 * Read through the header rather than by position: a value asserted this way is
 * asserted to be **in its own column**, which is REQ-46's and REQ-47's
 * structural claim (`data-table.md` — a row and its header share one template).
 */
function cellOf(title: string, row: HTMLElement, header: RegExp): HTMLElement {
  const headers = headersOf(title);
  const index = headers.findIndex((label) => header.test(label));
  expect(index, `no column of the ${title} list is headed ${header} — headers are ${JSON.stringify(headers)}`).toBeGreaterThanOrEqual(0);
  return row.querySelectorAll<HTMLElement>('.ui-data-table__cell')[index]!;
}

function textOf(element: HTMLElement): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The lines a cell draws, in order: a cell of these lists is the same number of lines whatever the state. */
function linesOf(cell: HTMLElement): string[] {
  return Array.from(
    cell.querySelectorAll<HTMLElement>(
      '.ui-table-two-line-cell__title, .ui-table-two-line-cell__subtitle, .ui-table-meta-cell, .ui-table-badge-list-cell',
    ),
  ).map(textOf);
}

function emptyStateOf(title: string): HTMLElement | null {
  return card(title).querySelector('.ui-empty-state');
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

describe('PluginsScreen — the two inventories on the object list (REQ-46)', () => {
  // plan-ui-coherence-optimisation/REQ-46 — "Plugins are listed with the object-list primitive,
  // hand-built cards deleted"; plugins-screen.md — "two object lists, one under the other".
  it('lists both inventories on the object list’s comfortable variant, and draws no card list', () => {
    reading.cli = { items: [cliPlugin()] };
    reading.daemon = { items: [daemonPlugin()] };
    renderScreen();

    expect(list('CLI plugins'), 'the CLI inventory is not on the object list').not.toBeNull();
    expect(list('Daemon plugins'), 'the daemon inventory is not on the object list').not.toBeNull();
    expect(list('CLI plugins').className).toMatch(/comfortable/);
    expect(list('Daemon plugins').className).toMatch(/comfortable/);
    expect(document.querySelectorAll('.ui-card-list'), 'the screen still draws a hand-built card list').toHaveLength(0);
  });

  // plugins-screen.md — "the Daemon list below it with the screen's only page-level action in its
  // toolbar"; the CLI list "is read-only — those plugins are files the operator installs themselves".
  it('states the screen’s only page-level action in the daemon list’s toolbar, and none on the CLI list', () => {
    reading.cli = { items: [cliPlugin()] };
    reading.daemon = { items: [daemonPlugin()] };
    renderScreen();

    const toolbars = document.querySelectorAll('.ui-screen-toolbar');
    expect(toolbars, 'the screen draws more than one page-level toolbar').toHaveLength(1);
    expect(card('Daemon plugins').contains(toolbars[0]!), 'the page-level action is not in the daemon list’s toolbar').toBe(true);
    expect(within(toolbars[0] as HTMLElement).getByRole('button', { name: 'Install plugin' })).toBeInTheDocument();
    expect(within(card('CLI plugins')).queryAllByRole('button'), 'the read-only CLI inventory offers a control').toHaveLength(0);
  });

  // plan-docker_management_app/REQ-98, plugins-screen.md — "the invocation (`docker compose`), its
  // version, its availability as a badge … and the reason the installation refuses to run it", each
  // in a column of its own.
  it('states each value of a CLI plugin in a column of its own', () => {
    reading.cli = {
      items: [cliPlugin({ name: 'broken', command: 'docker broken', version: 'v0.36.0-desktop.1', availability: 'unavailable', unavailableReason: 'accessing plugin: permission denied' })],
    };
    renderScreen();

    const row = rowOf('CLI plugins', 'docker broken');
    expect(row.querySelectorAll('.ui-data-table__cell')).toHaveLength(headersOf('CLI plugins').length);
    expect(textOf(cellOf('CLI plugins', row, /^PLUGIN$/i))).toBe('docker broken');
    expect(textOf(cellOf('CLI plugins', row, /VERSION/i))).toBe('v0.36.0-desktop.1');
    expect(textOf(cellOf('CLI plugins', row, /AVAILABILITY/i))).toBe('unavailable');
    expect(textOf(cellOf('CLI plugins', row, /UNAVAILABLE$/i))).toBe('accessing plugin: permission denied');

    // REQ-47 — the availability is its own column and not the tail of the version's cell, which is
    // what made its left edge a function of that row's version string.
    expect(textOf(cellOf('CLI plugins', row, /VERSION/i)), 'the availability still rides on the version cell').not.toContain('unavailable');
  });

  // plugins-screen.md — "every row is one line tall, whatever the plugin's state" and "a plugin the
  // installation runs has nothing to explain, and its reason column reads '–'".
  it('draws the same lines in a CLI column whether or not the installation refuses to run the plugin', () => {
    reading.cli = {
      items: [
        cliPlugin(),
        cliPlugin({ name: 'broken', command: 'docker broken', availability: 'unavailable', unavailableReason: 'accessing plugin: permission denied' }),
      ],
    };
    renderScreen();

    const working = rowOf('CLI plugins', 'docker compose');
    const refused = rowOf('CLI plugins', 'docker broken');

    // The premise: the line probe really does see the lines of a cell.
    expect(linesOf(cellOf('CLI plugins', working, /^PLUGIN$/i)), 'the line probe finds nothing in the name cell').toHaveLength(1);

    for (const header of headersOf('CLI plugins').filter((label) => label !== '')) {
      const pattern = new RegExp(`^${header}$`, 'i');
      expect(
        linesOf(cellOf('CLI plugins', refused, pattern)).length,
        `the ${header} column draws a different number of lines on a plugin the installation refuses to run`,
      ).toBe(linesOf(cellOf('CLI plugins', working, pattern)).length);
    }

    // …and the working plugin's reason column states the column's own nothing.
    expect(textOf(cellOf('CLI plugins', working, /UNAVAILABLE$/i))).toBe('–');
  });

  // plugins-screen.md — "a plugin the installation reports no version for reads 'unavailable' in the
  // version's place, with the reason on hover".
  it('reads unavailable in the version place for a plugin the installation gives no version for', () => {
    reading.cli = { items: [cliPlugin({ version: undefined })] };
    renderScreen();

    const version = cellOf('CLI plugins', rowOf('CLI plugins', 'docker compose'), /VERSION/i).querySelector('.ui-table-meta-cell') as HTMLElement;
    expect(textOf(version)).toBe('unavailable');
    expect(version.getAttribute('title')).toBeTruthy();
  });

  // plan-docker_management_app/REQ-99, plugins-screen.md — "the plugin's name, its description, the
  // interface it implements in words …, a badge reading `enabled`/`disabled`, the switch that changes
  // that state, and the row's actions".
  it('states each value of a daemon plugin in a column of its own', () => {
    reading.daemon = {
      items: [daemonPlugin({ description: 'sshFS volume plugin for Docker' }), daemonPlugin({ name: 'loki:latest', type: 'log driver', enabled: true })],
    };
    renderScreen();

    const row = daemonRow('vieux/sshfs:latest');
    expect(row.querySelectorAll('.ui-data-table__cell')).toHaveLength(headersOf('Daemon plugins').length);
    expect(textOf(cellOf('Daemon plugins', row, /^PLUGIN$/i))).toBe('vieux/sshfs:latest');
    expect(textOf(cellOf('Daemon plugins', row, /DESCRIPTION/i))).toBe('sshFS volume plugin for Docker');
    expect(textOf(cellOf('Daemon plugins', row, /INTERFACE/i))).toBe('volume driver');
    expect(textOf(cellOf('Daemon plugins', row, /^STATE$/i))).toBe('disabled');
    expect(textOf(cellOf('Daemon plugins', daemonRow('loki:latest'), /^STATE$/i))).toBe('enabled');

    // plugins-screen.md — "The state is stated once per row as a badge and changed by the switch
    // beside it": the statement and the control are two columns, not one.
    const state = cellOf('Daemon plugins', row, /^STATE$/i);
    expect(within(state).queryAllByRole('checkbox'), 'the state column holds the control that changes it').toHaveLength(0);
    expect(within(cellOf('Daemon plugins', row, /ENABLED/i)).getByRole('checkbox', { name: 'Enable vieux/sshfs:latest' })).toBeInTheDocument();
  });

  // plugins-screen.md — "every row is one line tall here too: a plugin without a description costs
  // the row no height" — the alternation the migration removed, stated structurally.
  it('draws the same lines in a daemon column whether or not the plugin is described', () => {
    reading.daemon = {
      items: [daemonPlugin({ description: 'sshFS volume plugin for Docker' }), daemonPlugin({ name: 'loki:latest', type: 'log driver' })],
    };
    renderScreen();

    const described = daemonRow('vieux/sshfs:latest');
    const bare = daemonRow('loki:latest');
    expect(linesOf(cellOf('Daemon plugins', described, /DESCRIPTION/i)), 'the described plugin states no description').toEqual([
      'sshFS volume plugin for Docker',
    ]);

    for (const header of headersOf('Daemon plugins').filter((label) => label !== '' && !/^(ENABLED|ACTIONS)$/i.test(label))) {
      const pattern = new RegExp(`^${header}$`, 'i');
      expect(
        linesOf(cellOf('Daemon plugins', bare, pattern)).length,
        `the ${header} column draws a different number of lines on a plugin the daemon does not describe`,
      ).toBe(linesOf(cellOf('Daemon plugins', described, pattern)).length);
    }
  });

  // plugins-screen.md — "The state is stated once per row as a badge": the availability of a CLI
  // plugin and the state of a daemon one are readable **in words**, on every row, with no reliance
  // on a colour or on a leading dot.
  it('states availability and state in words on every row of both lists', () => {
    reading.cli = {
      items: [
        cliPlugin(),
        cliPlugin({ name: 'scout', command: 'docker scout', availability: 'available' }),
        cliPlugin({ name: 'broken', command: 'docker broken', availability: 'unavailable' }),
      ],
    };
    reading.daemon = { items: [daemonPlugin(), daemonPlugin({ name: 'loki:latest', enabled: true })] };
    renderScreen();

    for (const row of rowsOf('CLI plugins')) {
      expect(textOf(cellOf('CLI plugins', row, /AVAILABILITY/i))).toMatch(/^(enabled|available|unavailable)$/);
    }
    for (const row of rowsOf('Daemon plugins')) {
      expect(textOf(cellOf('Daemon plugins', row, /^STATE$/i))).toMatch(/^(enabled|disabled)$/);
    }
  });

  // plugins-screen.md — "A failed reading shows the failure with a retry, without hiding the lists."
  it('shows a failed reading with a retry, keeping both lists', async () => {
    reading.error = 'the daemon is unreachable';
    reading.cli = { items: [cliPlugin()] };
    renderScreen();

    expect(screen.getByText('the daemon is unreachable')).toBeInTheDocument();
    expect(list('CLI plugins')).not.toBeNull();
    expect(card('Daemon plugins')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(hook.refresh).toHaveBeenCalled();
  });
});

describe('PluginsScreen — an empty inventory (REQ-48)', () => {
  // plan-ui-coherence-optimisation/REQ-48 — "`No daemon plugins` becomes a real empty state — the
  // primitive, on a surface, with a title, one line of explanation and, where one exists, the action
  // that resolves it — instead of bare text floating in the layout".
  it('states an empty daemon inventory on the primitive, with a title, one line and the action that resolves it', async () => {
    renderScreen();

    const empty = emptyStateOf('Daemon plugins');
    expect(empty, 'the empty daemon inventory is not stated on the empty-state primitive').not.toBeNull();
    expect(textOf(empty!.querySelector('.ui-empty-state__title') as HTMLElement)).not.toBe('');
    const description = empty!.querySelector('.ui-empty-state__description') as HTMLElement;
    expect(description, 'the empty state states no reason at all').not.toBeNull();
    expect(textOf(description)).not.toBe('');

    // The action that resolves it, and it really does open the install.
    const action = within(empty!).getByRole('button');
    await userEvent.click(action);
    expect(await screen.findByRole('heading', { name: 'Install daemon plugin' })).toBeInTheDocument();
  });

  // batch 10 — "The stated reason is content, and it must survive the change of container"; and
  // plugins-screen.md — the empty daemon list "offers the same install as its resolving action —
  // except where the daemon itself stated a reason, that reason being that it exposes no managed
  // plugin at all, which installing one would not resolve".
  it('keeps the daemon’s own reason as the explanation, and withholds the action that would not resolve it', () => {
    reading.daemon = { items: [], unavailableReason: 'This daemon does not expose managed plugins.' };
    renderScreen();

    const empty = emptyStateOf('Daemon plugins')!;
    expect(textOf(empty.querySelector('.ui-empty-state__description') as HTMLElement)).toBe('This daemon does not expose managed plugins.');
    expect(within(empty).queryAllByRole('button'), 'an action is offered for a reason installing a plugin would not resolve').toHaveLength(0);
  });

  // plugins-screen.md — "the installation's … own reason where the reading came with one"; the CLI
  // inventory "is read-only … Its empty state therefore offers no action."
  it('keeps the installation’s own reason for the CLI inventory, and offers no action either way', () => {
    reading.cli = { items: [], unavailableReason: 'This Docker installation does not expose a CLI plugin inventory.' };
    renderScreen();

    const empty = emptyStateOf('CLI plugins')!;
    expect(textOf(empty.querySelector('.ui-empty-state__description') as HTMLElement)).toBe(
      'This Docker installation does not expose a CLI plugin inventory.',
    );
    expect(within(empty).queryAllByRole('button'), 'the read-only inventory offers an action on its empty state').toHaveLength(0);

    cleanup();
    reading.cli = { items: [] };
    renderScreen();
    const generic = emptyStateOf('CLI plugins')!;
    expect(textOf(generic.querySelector('.ui-empty-state__title') as HTMLElement)).not.toBe('');
    expect(textOf(generic.querySelector('.ui-empty-state__description') as HTMLElement)).not.toBe('');
    expect(within(generic).queryAllByRole('button')).toHaveLength(0);
  });

  // plugins-screen.md — an empty result is what "either list **with nothing to show**" states, which
  // an inventory that has not been read yet is not: a reading still in flight is a different state
  // and says so, rather than announcing an emptiness nobody has established.
  it('does not state either inventory empty before the reading has arrived', () => {
    reading.loaded = false;
    renderScreen();

    for (const title of ['CLI plugins', 'Daemon plugins']) {
      const empty = emptyStateOf(title);
      expect(empty, `${title} states no placeholder at all while the reading is in flight`).not.toBeNull();
      expect(
        textOf(empty!.querySelector('.ui-empty-state__title') as HTMLElement),
        `${title} announces an empty inventory before the reading has arrived`,
      ).not.toMatch(/^No /);
      expect(within(empty!).queryAllByRole('button'), `${title} offers a resolving action for a state that has not been read`).toHaveLength(0);
    }
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
    expect(textOf(cellOf('Daemon plugins', daemonRow('vieux/sshfs:latest'), /^STATE$/i))).toBe('disabled');
  });

  // plugins-screen.md — "'Inspect' -> opens the plugin's full reading under its row, on the detail
  // panel …: its properties … and the daemon's own document below them. Pressing 'Hide' closes it".
  it('opens the full reading under the row on the detail panel, and closes it when pressed again', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(within(daemonRow('vieux/sshfs:latest')).getByRole('button', { name: 'Inspect' }));

    const expanded = await waitFor(() => {
      const region = list('Daemon plugins').querySelector('.ui-data-table__expanded');
      if (!region) throw new Error('the inspection is not open');
      return region as HTMLElement;
    });
    expect(hook.inspect).toHaveBeenCalledWith('vieux/sshfs:latest');
    expect(expanded.querySelector('.ui-detail-panel'), 'the inspection is not on the detail panel').not.toBeNull();
    expect(within(expanded).getByText('CAP_SYS_ADMIN')).toBeInTheDocument();
    expect(within(expanded).getByText('/dev/fuse')).toBeInTheDocument();
    expect(within(expanded).getByText('https://docs.docker.com/engine/extend/')).toBeInTheDocument();

    // detail-panel.md — in the `opening-gesture` presentation the panel presents **no** close
    // control of its own: the row's Inspect/Hide is the way out.
    expect(within(expanded).queryByRole('button', { name: 'Close detail' })).not.toBeInTheDocument();

    await user.click(within(daemonRow('vieux/sshfs:latest')).getByRole('button', { name: 'Hide' }));

    await waitFor(() => expect(list('Daemon plugins').querySelector('.ui-data-table__expanded')).toBeNull());
  });

  // plugins-screen.md — "At most one inspection is open, in this list and in the interface, the
  // detail panel holding that guarantee."
  it('keeps at most one inspection open', async () => {
    reading.daemon = { items: [daemonPlugin(), daemonPlugin({ name: 'loki:latest', id: 'loki-id', type: 'log driver' })] };
    hook.inspect.mockImplementation((name: string) => Promise.resolve(inspection({ name })));
    const user = userEvent.setup();
    renderScreen();

    await user.click(within(daemonRow('vieux/sshfs:latest')).getByRole('button', { name: 'Inspect' }));
    await waitFor(() => expect(document.querySelectorAll('.ui-detail-panel')).toHaveLength(1));

    await user.click(within(daemonRow('loki:latest')).getByRole('button', { name: 'Inspect' }));
    await waitFor(() => expect(document.querySelector('.ui-detail-panel')?.textContent).toContain('loki:latest'));
    expect(document.querySelectorAll('.ui-detail-panel'), 'a second inspection was opened beside the first').toHaveLength(1);
  });

  // plugins-screen.md — a failed inspection is reported, and no list is hidden by it
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

  // plugins-screen.md — "The CLI list is read-only — those plugins are files the operator installs
  // themselves."
  it('offers no control on a CLI plugin row', () => {
    reading.cli = { items: [cliPlugin()] };
    renderScreen();

    const row = rowsOf('CLI plugins')[0]!;
    expect(within(row).queryAllByRole('button')).toHaveLength(0);
    expect(within(row).queryAllByRole('checkbox')).toHaveLength(0);
  });
});
