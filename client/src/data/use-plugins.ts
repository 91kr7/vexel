import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { subscribeToReload } from './reload-signal';
import { subscribeToDaemonEvents, type DaemonEvent } from './event-stream';
import {
  disablePlugin,
  enablePlugin,
  fetchPluginInspect,
  fetchPluginPrivileges,
  fetchPlugins,
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

// Installing, enabling, disabling and removing all emit a `plugin` daemon
// event, so the poll only has to notice a `docker plugin` command run from a
// terminal and a CLI plugin dropped into the installation — neither of which
// announces itself. Hence a slow interval.
const POLL_INTERVAL_MS = 15000;

function emptyListing<T>(): PluginListing<T> {
  return { items: [] };
}

/**
 * A payload that is not a listing is a failed read like any other: it is
 * reported, never stored, so no panel is handed something without an `items`
 * array to render.
 */
function requireListing<T>(listing: PluginListing<T> | undefined, what: string): PluginListing<T> {
  if (!listing || !Array.isArray(listing.items)) throw new Error(`The server did not answer with a list of ${what}.`);
  return listing;
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
 * Both plugin inventories of the active installation, read as one round so the
 * two panels never show two different moments (REQ-98, REQ-99), and the
 * management of the daemon ones (REQ-111).
 *
 * The privileges a reference asks for are read on demand and handed straight
 * to the caller: they are the subject of a decision, never cached state.
 */
export function usePlugins(): UsePluginsResult {
  const [cli, setCli] = useState<PluginListing<CliPlugin>>(emptyListing);
  const [daemon, setDaemon] = useState<PluginListing<DaemonPlugin>>(emptyListing);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    return fetchPlugins()
      .then((reading: PluginsReading) => {
        if (cancelledRef.current) return;
        // Validated before anything is stored: one malformed answer must fail
        // the round rather than reach a panel.
        const nextCli = requireListing(reading?.cli, 'CLI plugins');
        const nextDaemon = requireListing(reading?.daemon, 'daemon plugins');
        setCli(nextCli);
        setDaemon(nextDaemon);
        setError(undefined);
      })
      .catch((cause: Error) => {
        if (cancelledRef.current) return;
        setError(cause.message);
      })
      .finally(() => {
        if (cancelledRef.current) return;
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  useEffect(
    () =>
      subscribeToDaemonEvents((event: DaemonEvent) => {
        if (event.type === 'plugin') refresh();
      }),
    [refresh],
  );

  // Another context means another daemon: what is held here belongs to the one
  // left behind and is re-read at once (REQ-93).
  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  // The reload signal waits for this read, which is why `refresh` returns its promise (REQ-11).
  useEffect(() => subscribeToReload(refresh), [refresh]);

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const readPrivileges = useCallback((remote: string) => fetchPluginPrivileges(remote), []);

  const install = useCallback(
    async (input: InstallPluginInput) => {
      const installed = await installPlugin(input);
      refresh();
      return installed;
    },
    [refresh],
  );

  const enable = useCallback(
    async (name: string) => {
      const plugin = await enablePlugin(name);
      refresh();
      return plugin;
    },
    [refresh],
  );

  const disable = useCallback(
    async (name: string) => {
      const plugin = await disablePlugin(name);
      refresh();
      return plugin;
    },
    [refresh],
  );

  const inspect = useCallback((name: string) => fetchPluginInspect(name), []);

  const remove = useCallback(
    async (name: string) => {
      await removePlugin(name);
      refresh();
    },
    [refresh],
  );

  return { cli, daemon, loaded, error, refresh, readPrivileges, install, enable, disable, inspect, remove };
}
