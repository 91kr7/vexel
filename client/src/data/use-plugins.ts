import { useCallback, useSyncExternalStore } from 'react';
import {
  disablePlugin,
  enablePlugin,
  fetchPluginInspect,
  fetchPluginPrivileges,
  installPlugin,
  removePlugin,
  type CliPlugin,
  type DaemonPlugin,
  type InstallPluginInput,
  type PluginInspect,
  type PluginListing,
  type PluginPrivilege,
  type PluginsReading,
} from './plugins-client';
import { usePushedValue } from './pushed-values';
import { isChannelDelivering, reconnectLiveChannel, subscribeToChannelDelivery } from './live-channel';

/** The name the server gives the plugins round on the channel. */
const PLUGINS = 'plugins';

/** One reference per side for every render before the first delivery, so nothing re-renders on it. */
const NO_CLI: PluginListing<CliPlugin> = { items: [] };
const NO_DAEMON: PluginListing<DaemonPlugin> = { items: [] };

/** Both sides present with an items array: one malformed side fails the whole round. */
function isRound(reading: PluginsReading | undefined): boolean {
  return Array.isArray(reading?.cli?.items) && Array.isArray(reading?.daemon?.items);
}

export interface UsePluginsResult {
  cli: PluginListing<CliPlugin>;
  daemon: PluginListing<DaemonPlugin>;
  loaded: boolean;
  error?: string;
  refresh: () => void;
  readPrivileges: (remote: string) => Promise<PluginPrivilege[]>;
  install: (input: InstallPluginInput) => Promise<DaemonPlugin>;
  enable: (name: string) => Promise<DaemonPlugin>;
  disable: (name: string) => Promise<DaemonPlugin>;
  inspect: (name: string) => Promise<PluginInspect>;
  remove: (name: string) => Promise<void>;
}

/**
 * Both plugin inventories of the active installation, delivered by the live channel as the one
 * round the server holds, so the two panels never show two different moments (REQ-17, REQ-33,
 * REQ-39), and the management of the daemon ones, whose results reach the panels as the pushes the
 * server's own operations cause (REQ-25).
 *
 * The privileges a reference asks for are read on demand and handed straight to the caller: they
 * are the subject of a decision, never cached state.
 */
export function usePlugins(): UsePluginsResult {
  const delivered = usePushedValue<PluginsReading>(PLUGINS);
  const delivering = useSyncExternalStore(subscribeToChannelDelivery, isChannelDelivering);
  // Reported and never shown, so no panel is handed something without an items array.
  const malformed = delivered !== undefined && !isRound(delivered);
  const round = malformed ? undefined : delivered;

  // What failed is the channel, so what a retry does is ask for it again (REQ-18).
  const refresh = useCallback(() => {
    if (!isChannelDelivering()) reconnectLiveChannel();
  }, []);

  return {
    cli: round?.cli ?? NO_CLI,
    daemon: round?.daemon ?? NO_DAEMON,
    loaded: delivered !== undefined,
    error: !delivering
      ? 'Could not reach the application server.'
      : malformed
        ? 'The server did not answer with a list of plugins.'
        : undefined,
    refresh,
    readPrivileges: fetchPluginPrivileges,
    install: installPlugin,
    enable: enablePlugin,
    disable: disablePlugin,
    inspect: fetchPluginInspect,
    remove: removePlugin,
  };
}
