import { useState } from 'react';
import {
  ActionButtonGroup,
  Badge,
  Button,
  Card,
  CardList,
  CodeViewer,
  DefinitionList,
  EmptyState,
  ErrorBanner,
  FormDialog,
  FormField,
  Grid,
  MetaCell,
  Row,
  SectionHeader,
  Stack,
  TextField,
  Toggle,
  useToast,
  type BadgeTone,
  type CardListRowContent,
  type DefinitionItem,
  type StatusTone,
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

const AVAILABILITY_DOTS: Record<CliPluginAvailability, StatusTone> = {
  enabled: 'success',
  available: 'neutral',
  unavailable: 'danger',
};

function cliRow(plugin: CliPlugin): CardListRowContent {
  return {
    title: plugin.command,
    status: AVAILABILITY_DOTS[plugin.availability],
    // Only a plugin the installation refuses to run explains itself here: a
    // working one is a single line, as the screen is drawn.
    subtitle: plugin.unavailableReason,
    badges: <Badge tone={AVAILABILITY_TONES[plugin.availability]}>{plugin.availability}</Badge>,
    meta: <MetaCell unavailableReason="This installation reports no version for it.">{plugin.version}</MetaCell>,
  };
}

function inspectItems(inspect: PluginInspect): DefinitionItem[] {
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

  function daemonRow(plugin: DaemonPlugin): CardListRowContent {
    return {
      title: plugin.name,
      status: plugin.enabled ? 'success' : 'neutral',
      subtitle: plugin.description,
      badges: <Badge tone={plugin.enabled ? 'success' : 'neutral'}>{plugin.enabled ? 'enabled' : 'disabled'}</Badge>,
      meta: (
        <Row align="center" gap="var(--space-3)">
          <MetaCell>{plugin.type}</MetaCell>
          <Toggle
            checked={plugin.enabled}
            busy={switchingName === plugin.name}
            ariaLabel={`${plugin.enabled ? 'Disable' : 'Enable'} ${plugin.name}`}
            onChange={(next) => handleToggle(plugin, next)}
          />
          <ActionButtonGroup
            actions={[
              { id: 'inspect', label: inspected?.name === plugin.name ? 'Hide' : 'Inspect', onClick: () => handleInspect(plugin) },
              { id: 'remove', label: 'Remove', destructive: true, onClick: () => handleRemove(plugin) },
            ]}
          />
        </Row>
      ),
    };
  }

  return (
    <Stack gap="var(--space-5)">
      <Grid columns="1fr 1fr" gap="var(--space-5)">
        <Card>
          <SectionHeader title="CLI plugins" description="Sub-commands the local Docker installation ships" />
          <Stack gap="var(--space-3)">
            {plugins.error ? <ErrorBanner title="Could not read the plugins" detail={plugins.error} onRetry={plugins.refresh} /> : null}
            <CardList
              items={plugins.cli.items}
              itemKey={(plugin) => plugin.name}
              renderRow={cliRow}
              emptyState={
                <EmptyState
                  title={plugins.loaded ? 'No CLI plugins' : 'Reading the installation…'}
                  description={plugins.cli.unavailableReason ?? null}
                 action={null} />
              }
            />
          </Stack>
        </Card>

        <Card>
          <SectionHeader
            title="Daemon plugins"
            description="Drivers the daemon itself runs"
            trailing={<Button onClick={openInstall}>Install plugin</Button>}
          />
          <Stack gap="var(--space-3)">
            {inspectError ? <ErrorBanner title="Could not inspect the plugin" detail={inspectError} /> : null}
            <CardList
              items={plugins.daemon.items}
              itemKey={(plugin) => plugin.name}
              renderRow={daemonRow}
              expandedKey={inspected?.name}
              renderExpanded={() =>
                inspected ? (
                  <Stack gap="var(--space-3)">
                    <DefinitionList items={inspectItems(inspected)} />
                    <CodeViewer code={JSON.stringify(inspected.raw, null, 2)} />
                  </Stack>
                ) : null
              }
              emptyState={
                <EmptyState
                  title={plugins.loaded ? 'No daemon plugins' : 'Reading the daemon…'}
                  description={plugins.daemon.unavailableReason ?? null}
                 action={null} />
              }
            />
          </Stack>
        </Card>
      </Grid>

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
