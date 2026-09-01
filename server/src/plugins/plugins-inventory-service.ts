// The plugins reading of the active installation as one round, held by the
// refresh cache (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-54 to REQ-56).
import { registerRefreshKind } from "../refresh-cache/refresh-cache.js";
import { listCliPlugins, type CliPlugin, type PluginListing } from "./cli-plugins-service.js";
import { listDaemonPlugins, type DaemonPlugin } from "./daemon-plugins-service.js";

export interface PluginsInventory {
  cli: PluginListing<CliPlugin>;
  daemon: PluginListing<DaemonPlugin>;
}

/** Both sides in one reading, so the two panels never show two different moments of the same installation. */
export async function readPluginsInventory(): Promise<PluginsInventory> {
  const [cli, daemon] = await Promise.all([listCliPlugins(), listDaemonPlugins()]);
  return { cli, daemon };
}

/**
 * One kind for the whole round: two, one per side, would each have a period of
 * their own, and the first period where only one of them read would put two
 * moments of the same installation on the screen.
 */
export const pluginsInventoryCache = registerRefreshKind({
  key: "plugins",
  periodMs: 30000,
  eventTypes: ["plugin"],
  read: readPluginsInventory,
});
