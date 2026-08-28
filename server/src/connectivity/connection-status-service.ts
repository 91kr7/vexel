// Aggregates daemon reachability, negotiated Engine API version and local CLI
// availability into a single status the client polls (REQ-9, REQ-10, REQ-13,
// REQ-110). The shared EngineClient it probes with is the Docker access layer's
// own, which follows the active context (REQ-93); it stays re-exported here for
// the modules that already read it from this service.
import { detectCliAvailability, type CliAvailability } from "../docker/cli-runner.js";
import { getEngineClient } from "../docker/engine-client.js";
import { DockerDaemonError } from "../docker/errors.js";
import { eventStreamService } from "../events/event-stream-service.js";
import { registerRefreshKind } from "../refresh-cache/refresh-cache.js";

export { getEngineClient };

export interface ConnectionStatus {
  daemon: { reachable: boolean; cause?: string };
  apiVersion?: string;
  engineVersion?: string;
  cli: CliAvailability;
  unavailableCapabilities: string[];
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const [daemon, cli] = await Promise.all([probeDaemon(), detectCliAvailability()]);
  return {
    daemon: daemon.reachability,
    apiVersion: daemon.version?.apiVersion,
    engineVersion: daemon.version?.engineVersion,
    cli,
    unavailableCapabilities: unavailableCapabilitiesFor(cli),
  };
}

/**
 * The connection status as the refresh cache keeps it (REQ-9, REQ-11, REQ-15).
 * It **keeps a real probe**: the status also carries the negotiated Engine API
 * and engine versions, which only a call to the daemon returns. An unreachable
 * daemon is a successful read reporting it, not a failure, so the interface is
 * told it cannot reach the daemon instead of being handed a stale "reachable".
 */
export const connectionStatusCache = registerRefreshKind({
  key: "connection-status",
  periodMs: 30000,
  read: getConnectionStatus,
});

// The daemon event stream is already open against the same daemon, so its
// connection dropping or coming back is the earliest reachability signal the
// server has — cheaper and faster than shortening the period.
eventStreamService.onConnectionChanged(() => connectionStatusCache.markChanged());

// `getVersion()` reaches the daemon on every invocation by contract
// (refresh_cache/REQ-32) — a probe served from a held value stops probing — and
// the negotiation it makes is what refreshes the version the request paths are
// composed with (refresh_cache/REQ-33).
async function probeDaemon() {
  try {
    const version = await getEngineClient().getVersion();
    return { reachability: { reachable: true }, version };
  } catch (error) {
    const message = error instanceof DockerDaemonError ? error.message : (error as Error).message;
    return { reachability: { reachable: false, cause: message }, version: undefined };
  }
}

function unavailableCapabilitiesFor(cli: CliAvailability): string[] {
  const unavailable: string[] = [];
  if (!cli.docker.available) unavailable.push("The raw console CLI channel is unavailable: the docker CLI was not found.");
  if (!cli.compose.available) unavailable.push("Compose projects are unavailable: the docker compose plugin was not found.");
  if (!cli.buildx.available) unavailable.push("Multi-platform builds and the build-cache view are unavailable: the docker buildx plugin was not found.");
  return unavailable;
}
