import { useState } from 'react';
import {
  ActionButtonGroup,
  BadgeListCell,
  Button,
  Card,
  CodeViewer,
  DataTable,
  DetailPanel,
  EmptyState,
  ErrorBanner,
  FormDialog,
  FormField,
  MetaCell,
  ScreenToolbar,
  SectionHeader,
  Stack,
  TextField,
  Toggle,
  TwoLineCell,
  useToast,
  type BadgeTone,
  type DataTableColumn,
} from '../ui';
import type { CliPlugin, CliPluginAvailability, DaemonPlugin, PluginInspect } from '../data/plugins-client';
import { usePlugins } from '../data/use-plugins';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';
import { useProgress } from '../shell/services/ProgressService';

const AVAILABILITY_TONES: Record<CliPluginAvailability, BadgeTone> = {
  enabled: 'success',
  available: 'neutral',
  unavailable: 'danger',
};

/** Why a CLI plugin's version cell is empty: the installation itself did not report one. */
const VERSION_UNREADABLE = 'This installation reports no version for it.';

/**
 * What the two inventories say when they hold nothing and the reading gave no
 * reason of its own. The reason, where there is one, is the installation's or
 * the daemon's own words and always wins: an empty state that replaces a stated
 * reason with a generic sentence has destroyed information
 * (plan-ui-coherence-optimisation/REQ-48).
 */
const NO_CLI_PLUGINS = 'CLI plugins are executables the installation itself ships; this one exposes none to add sub-commands to `docker`.';
const NO_DAEMON_PLUGINS = 'A daemon plugin is a driver the daemon runs — volume, network or log. Installing one from a reference adds it to this daemon.';

function inspectItems(inspect: PluginInspect) {
  return [
    { label: 'Name', value: inspect.name },
    { label: 'Id', value: inspect.id },
    { label: 'Reference', value: inspect.reference ?? 'not recorded' },
    { label: 'Interfaces', value: inspect.interfaceTypes.length > 0 ? inspect.interfaceTypes.join(', ') : 'none reported' },
    { label: 'State', value: inspect.enabled ? 'enabled' : 'disabled' },
    { label: 'Mounts', value: inspect.mounts.length > 0 ? inspect.mounts.join(', ') : 'none' },
    { label: 'Devices', value: inspect.devices.length > 0 ? inspect.devices.join(', ') : 'none' },
    { label: 'Capabilities', value: inspect.capabilities.length > 0 ? inspect.capabilities.join(', ') : 'none' },
    { label: 'Documentation', value: inspect.documentation ?? 'none' },
  ];
}

/**
 * The Plugins screen (REQ-98, REQ-99, REQ-111): the CLI plugins the local
 * Docker installation ships, with their version and availability, next to the
 * plugins the daemon itself runs, with the interface each implements and its
 * state — installed from a reference only after the privileges it asks for
 * have been read and granted, enabled and disabled from the row, inspected in
 * place, and removed under a destructive confirmation.
 *
 * **The two inventories are stacked, each at the full width of the content
 * column, and the side-by-side pair is gone**
 * (plan-ui-coherence-optimisation/REQ-46). Not a layout preference: the pair
 * was a fixed `1fr 1fr` template that never collapsed, so at 375×812 each list
 * had 157.5px to draw in and a version string ran 35.2px past its card; and the
 * inspection is the row's own expansion, so a list's width **is** the panel's
 * width — the pair capped the daemon plugin's raw document at 442px of a 1120px
 * content column at 1440×1000, and at 375×812 drew it 12.5px off the left edge
 * of the viewport, 89.5px wide. Collapsing the pair repairs the phone and
 * leaves the panel at half the screen; stacking repairs both, and is what
 * volumes & networks and builders & cache already do.
 */
export function PluginsScreen() {
  const plugins = usePlugins();
  const { confirm, confirmPrivileges } = useConfirmation();
  const { push } = useToast();
  const { run } = useProgress();
  const { reportError } = useErrorReporter();

  const [installOpen, setInstallOpen] = useState(false);
  const [remote, setRemote] = useState('');
  const [alias, setAlias] = useState('');
  const [enableAfterInstall, setEnableAfterInstall] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [switchingName, setSwitchingName] = useState<string | undefined>(undefined);
  const [inspected, setInspected] = useState<PluginInspect | undefined>(undefined);
  const [inspectError, setInspectError] = useState<string | undefined>(undefined);

  function openInstall() {
    setRemote('');
    setAlias('');
    setEnableAfterInstall(true);
    setInstallOpen(true);
  }

  /**
   * Nothing is installed by the submit itself: it reads what the plugin asks
   * for and hands it to the confirmation, which is where the grant happens
   * (REQ-99). A refused grant installs nothing and gives the form back with
   * what was typed in it.
   */
  async function submitInstall() {
    const reference = remote.trim();
    setInstalling(true);
    try {
      const privileges = await plugins.readPrivileges(reference);
      setInstallOpen(false);
      const granted = await confirmPrivileges({
        targetName: reference,
        consequence:
          'Installing it lets it run on this host with everything listed below. Granting is explicit: nothing is installed unless you grant it here.',
        confirmLabel: 'Grant and install',
        destructive: false,
        privileges: privileges.map((privilege) => ({ name: privilege.name, description: privilege.description, values: privilege.values })),
        noPrivilegesLabel: 'This plugin asks for no special privileges.',
      });
      if (!granted) {
        setInstallOpen(true);
        return;
      }
      const installed = await run(`Install ${reference}`, () =>
        plugins.install({
          remote: reference,
          alias: alias.trim() === '' ? undefined : alias.trim(),
          grantedPrivileges: privileges,
          enable: enableAfterInstall,
        }),
      );
      push({
        title: `${installed.name} installed`,
        message: installed.enabled ? 'It is installed and enabled.' : 'It is installed and left disabled.',
        tone: 'success',
      });
    } catch (cause) {
      setInstallOpen(true);
      reportError(`Could not install ${reference}`, (cause as Error).message);
    } finally {
      setInstalling(false);
    }
  }

  async function handleToggle(plugin: DaemonPlugin, next: boolean) {
    setSwitchingName(plugin.name);
    try {
      await run(`${next ? 'Enable' : 'Disable'} ${plugin.name}`, () => (next ? plugins.enable(plugin.name) : plugins.disable(plugin.name)));
    } catch (cause) {
      reportError(`Could not ${next ? 'enable' : 'disable'} ${plugin.name}`, (cause as Error).message);
    } finally {
      setSwitchingName(undefined);
    }
  }

  async function handleInspect(plugin: DaemonPlugin) {
    if (inspected?.name === plugin.name) {
      setInspected(undefined);
      setInspectError(undefined);
      return;
    }
    setInspectError(undefined);
    try {
      setInspected(await plugins.inspect(plugin.name));
    } catch (cause) {
      setInspected(undefined);
      setInspectError(`${plugin.name}: ${(cause as Error).message}`);
    }
  }

  async function handleRemove(plugin: DaemonPlugin) {
    const confirmed = await confirm({
      targetName: plugin.name,
      consequence:
        'This will permanently remove the plugin from this daemon, with the data it keeps. Nothing is forced: an enabled plugin must be disabled first.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    try {
      await run(`Remove ${plugin.name}`, () => plugins.remove(plugin.name));
      if (inspected?.name === plugin.name) setInspected(undefined);
    } catch (cause) {
      reportError(`Could not remove ${plugin.name}`, (cause as Error).message);
    }
  }

  /**
   * A CLI plugin's row. The version and the availability are columns, which is
   * what makes the pill's left edge identical on every row by construction
   * rather than by luck (plan-ui-coherence-optimisation/REQ-47): delivered, the
   * pill sat beside the version string in one trailing group, so
   * `v0.36.0-desktop.1` pushed that row's pill 68.6px left of its neighbours' —
   * three distinct left edges down a column of fifteen rows.
   *
   * Every cell is the same number of lines whatever the plugin's state: the
   * reason an installation refuses to run one was a second line of the card and
   * is a column here, where its absence costs the row no height.
   */
  const cliColumns: DataTableColumn<CliPlugin>[] = [
    {
      id: 'plugin',
      header: 'PLUGIN',
      width: '1.4fr',
      render: (plugin) => <TwoLineCell title={plugin.command} />,
    },
    {
      id: 'version',
      header: 'VERSION',
      // The longest version this installation ships lays out at 132.6px, and the
      // column is a length rather than a fraction so that it is the same track
      // in the header and in every row.
      width: '160px',
      render: (plugin) => <MetaCell unavailableReason={VERSION_UNREADABLE}>{plugin.version}</MetaCell>,
    },
    {
      id: 'availability',
      header: 'AVAILABILITY',
      // Wide enough for the widest of the three pills (63.4px measured) and for
      // its own header, and no wider: the pill's column, not the version's
      // leftovers.
      width: '132px',
      render: (plugin) => <BadgeListCell labels={[plugin.availability]} tone={AVAILABILITY_TONES[plugin.availability]} />,
    },
    {
      id: 'reason',
      header: 'WHY UNAVAILABLE',
      width: '2fr',
      // Only a plugin the installation refuses to run explains itself, and the
      // column's own '–' is what a working one reads as.
      render: (plugin) => <MetaCell>{plugin.unavailableReason}</MetaCell>,
    },
  ];

  /**
   * A daemon plugin's row. Same rule as above, and it catches the same defect:
   * the plugin's description was a card line whose presence depends on the
   * plugin, and it alternated the row height 117.1px against 95.7px down the
   * column at all three viewports. It is a column now.
   */
  const daemonColumns: DataTableColumn<DaemonPlugin>[] = [
    {
      id: 'plugin',
      header: 'PLUGIN',
      width: '1.6fr',
      render: (plugin) => <TwoLineCell title={plugin.name} />,
    },
    {
      id: 'description',
      header: 'DESCRIPTION',
      width: '1.6fr',
      render: (plugin) => <MetaCell>{plugin.description}</MetaCell>,
    },
    {
      id: 'interface',
      header: 'INTERFACE',
      width: '1fr',
      render: (plugin) => <MetaCell>{plugin.type}</MetaCell>,
    },
    {
      id: 'state',
      header: 'STATE',
      // What the plugin *is*, in words and in a tone — a statement, drawn like
      // a statement. What changes it is the switch in the next column, drawn
      // like a control (plan-ui-coherence-optimisation/REQ-27).
      width: '116px',
      render: (plugin) => (
        <BadgeListCell labels={[plugin.enabled ? 'enabled' : 'disabled']} tone={plugin.enabled ? 'success' : 'neutral'} />
      ),
    },
    {
      id: 'switch',
      header: 'ENABLED',
      // The switch's own track: 34px of it, and room for the spinner it grows
      // by while the daemon is answering, so a busy row moves no column.
      width: '88px',
      render: (plugin) => (
        <Toggle
          checked={plugin.enabled}
          busy={switchingName === plugin.name}
          ariaLabel={`${plugin.enabled ? 'Disable' : 'Enable'} ${plugin.name}`}
          onChange={(next) => handleToggle(plugin, next)}
        />
      ),
    },
    {
      id: 'actions',
      header: 'ACTIONS',
      // The cluster's own width and no more (plan-ui-coherence-optimisation/REQ-9),
      // stated as a length: an intrinsic track resolves separately in the header
      // and in every row.
      width: '148px',
      render: (plugin) => (
        <ActionButtonGroup
          actions={[
            { id: 'inspect', label: inspected?.name === plugin.name ? 'Hide' : 'Inspect', onClick: () => handleInspect(plugin) },
            { id: 'remove', label: 'Remove', weight: 'destructive' as const, onClick: () => handleRemove(plugin) },
          ]}
        />
      ),
    },
  ];

  return (
    <Stack gap="var(--space-5)">
      <Card>
        <SectionHeader title="CLI plugins" description="Sub-commands the local Docker installation ships" />
        <Stack gap="var(--space-3)">
          {plugins.error ? <ErrorBanner title="Could not read the plugins" detail={plugins.error} onRetry={plugins.refresh} /> : null}
          <DataTable
            variant="comfortable"
            columns={cliColumns}
            rows={plugins.cli.items}
            rowKey={(plugin) => plugin.name}
            // The read-only inventory is the longer of the two — fifteen rows,
            // 1038px, on a stock installation — and stacking it above the list
            // that carries every action on this screen puts that list as far
            // down as its own height. It scrolls at the height containers and
            // images already cap their lists at, which is the product's answer
            // to a long list inside a screen rather than a number chosen here.
            // What that buys is measured and stated in `plugins-screen.md`: 438px
            // less burial, not the daemon card above the fold at every viewport.
            maxHeight="60vh"
            emptyState={
              plugins.loaded ? (
                <EmptyState
                  title="No CLI plugins"
                  description={plugins.cli.unavailableReason ?? NO_CLI_PLUGINS}
                  // Nothing here installs one: they are files the operator puts
                  // in the installation themselves.
                  action={null}
                />
              ) : (
                <EmptyState title="Reading the installation…" description={null} action={null} />
              )
            }
          />
        </Stack>
      </Card>

      <Card>
        <SectionHeader title="Daemon plugins" description="Drivers the daemon itself runs" />
        {/* The screen's page-level action, in the toolbar under the header
            rather than in the card's header. */}
        <ScreenToolbar primaryAction={{ label: 'Install plugin', onClick: openInstall }} />
        <Stack gap="var(--space-3)">
          {inspectError ? <ErrorBanner title="Could not inspect the plugin" detail={inspectError} /> : null}
          <DataTable
            variant="comfortable"
            columns={daemonColumns}
            rows={plugins.daemon.items}
            rowKey={(plugin) => plugin.name}
            expandedRowKey={inspected?.name}
            renderExpanded={() =>
              inspected ? (
                // The inspection is opened and closed by the row's own
                // Inspect/Hide control, so the panel presents no second way out
                // and `Escape` closes it from the keyboard.
                <DetailPanel
                  dismissal="opening-gesture"
                  onClose={() => setInspected(undefined)}
                  properties={inspectItems(inspected)}
                  propertiesContentClass="long-single-line"
                >
                  <CodeViewer code={JSON.stringify(inspected.raw, null, 2)} />
                </DetailPanel>
              ) : null
            }
            emptyState={
              plugins.loaded ? (
                <EmptyState
                  title="No daemon plugins"
                  description={plugins.daemon.unavailableReason ?? NO_DAEMON_PLUGINS}
                  // Where the daemon states a reason of its own, it is that the
                  // daemon exposes no managed plugin at all: installing one
                  // would not resolve it, so no action is offered for it.
                  //
                  // Its label is the invitation, never the toolbar's own word
                  // (DEF-2, `plugins-screen.md`): one surface, one control per name.
                  action={plugins.daemon.unavailableReason ? null : <Button onClick={openInstall}>Install the first plugin</Button>}
                />
              ) : (
                <EmptyState title="Reading the daemon…" description={null} action={null} />
              )
            }
          />
        </Stack>
      </Card>

      <FormDialog
        open={installOpen}
        title="Install daemon plugin"
        description="The plugin's privileges are shown for review before anything is installed; the install runs only once they are granted."
        submitLabel="Review privileges"
        submitting={installing}
        submitDisabled={remote.trim() === ''}
        onSubmit={submitInstall}
        onCancel={() => setInstallOpen(false)}
      >
        <Stack gap="var(--space-3)">
          <FormField label="Reference" hint="e.g. vieux/sshfs:latest">
            <TextField ariaLabel="Plugin reference" placeholder="vieux/sshfs:latest" value={remote} onChange={setRemote} autoFocus />
          </FormField>
          <FormField label="Alias" hint="Optional; the name the plugin is installed under.">
            <TextField ariaLabel="Plugin alias" placeholder="e.g. sshfs" value={alias} onChange={setAlias} />
          </FormField>
          <Toggle checked={enableAfterInstall} onChange={setEnableAfterInstall} label="Enable once installed" />
        </Stack>
      </FormDialog>
    </Stack>
  );
}
