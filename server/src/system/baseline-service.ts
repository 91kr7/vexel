// The Docker baseline the application's coverage statement refers to, next to
// the daemon currently connected (REQ-106). The declared half is a property of
// the application and is always answerable; the daemon half is read through the
// existing daemon-information reading of the active context, so the version is
// never queried a second way.
import { getDaemonInfo } from "../contexts/daemon-info-service.js";
import { CLIENT_MAX_API_VERSION } from "../docker/engine-client.js";

/**
 * Docker CLI release line that ships `CLIENT_MAX_API_VERSION`. Stated as the
 * CLI half of the baseline: the command channel runs the operator's own
 * `docker` binary, so the coverage claim holds against that release line.
 */
const CLI_BASELINE_VERSION = "24.0";

export interface BaselineDeclaration {
  /** Highest Engine API version this application was written against. */
  engineApiVersion: string;
  /** Docker CLI release line shipping that Engine API version. */
  cliVersion: string;
}

export interface ConnectedDaemonVersions {
  version: string;
  apiVersion: string;
  minApiVersion?: string;
}

export type BaselineComparison = "match" | "daemon-newer" | "daemon-older" | "unknown";

export interface BaselineReport {
  declared: BaselineDeclaration;
  /** Absent exactly when the daemon could not be read. */
  daemon?: ConnectedDaemonVersions;
  /** Present exactly when the daemon could not be read. */
  daemonUnavailableDetail?: string;
  comparison: BaselineComparison;
}

export async function getBaselineReport(): Promise<BaselineReport> {
  const declared: BaselineDeclaration = {
    engineApiVersion: CLIENT_MAX_API_VERSION,
    cliVersion: CLI_BASELINE_VERSION,
  };

  let daemon: ConnectedDaemonVersions | undefined;
  let daemonUnavailableDetail: string | undefined;
  try {
    const info = await getDaemonInfo();
    daemon = {
      version: info.version,
      apiVersion: info.apiVersion,
      ...(info.minApiVersion === undefined ? {} : { minApiVersion: info.minApiVersion }),
    };
  } catch (error) {
    // An unreachable daemon does not fail the reading: what the application
    // declares is true whether or not a daemon answers, and the screen must
    // still be able to state it.
    daemonUnavailableDetail = (error as Error).message;
  }

  return {
    declared,
    ...(daemon ? { daemon } : {}),
    ...(daemonUnavailableDetail === undefined ? {} : { daemonUnavailableDetail }),
    comparison: compareToBaseline(declared.engineApiVersion, daemon?.apiVersion),
  };
}

function compareToBaseline(baseline: string, daemonApiVersion: string | undefined): BaselineComparison {
  if (!daemonApiVersion) return "unknown";
  const parsedBaseline = parseApiVersion(baseline);
  const parsedDaemon = parseApiVersion(daemonApiVersion);
  if (!parsedBaseline || !parsedDaemon) return "unknown";
  const difference =
    parsedDaemon.major !== parsedBaseline.major ? parsedDaemon.major - parsedBaseline.major : parsedDaemon.minor - parsedBaseline.minor;
  if (difference === 0) return "match";
  return difference > 0 ? "daemon-newer" : "daemon-older";
}

function parseApiVersion(value: string): { major: number; minor: number } | undefined {
  const match = /^(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]) };
}
