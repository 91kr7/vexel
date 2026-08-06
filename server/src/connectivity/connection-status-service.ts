// Aggregates daemon reachability, negotiated Engine API version and local CLI
// availability into a single status the client polls (REQ-9, REQ-10, REQ-13,
// REQ-110). Exposes the shared EngineClient instance so other server modules
// (e.g. the events area) reuse the same endpoint resolution.
import { detectCliAvailability, type CliAvailability } from "../docker/cli-runner.js";
import { EngineClient } from "../docker/engine-client.js";
import { resolveActiveEndpoint } from "../docker/endpoint.js";
import { DockerDaemonError } from "../docker/errors.js";

export interface ConnectionStatus {
  daemon: { reachable: boolean; cause?: string };
  apiVersion?: string;
  engineVersion?: string;
  cli: CliAvailability;
  unavailableCapabilities: string[];
}

const engineClient = new EngineClient(resolveActiveEndpoint());

export function getEngineClient(): EngineClient {
  return engineClient;
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

async function probeDaemon() {
  try {
    const version = await engineClient.getVersion();
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
