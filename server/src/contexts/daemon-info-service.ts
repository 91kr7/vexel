// Daemon information of the active context (REQ-94): version, Engine API
// version, BuildKit version, storage and cgroup drivers, OS/architecture, root
// directory and container counts, read from the daemon's `/version` and
// `/info`.
import { getEngineClient } from "../docker/engine-client.js";
import { runDockerCapture } from "./docker-cli.js";

export interface DaemonContainerCounts {
  total: number;
  running: number;
  paused: number;
  stopped: number;
}

export interface DaemonInfo {
  version: string;
  apiVersion: string;
  minApiVersion?: string;
  /**
   * Version of BuildKit as the local buildx plugin reports it; absent when the
   * plugin is not installed. The Engine API reports no BuildKit component of
   * its own, so this is the only reading available.
   */
  buildkitVersion?: string;
  storageDriver: string;
  cgroupDriver: string;
  cgroupVersion?: string;
  operatingSystem: string;
  osType: string;
  kernelVersion: string;
  architecture: string;
  rootDirectory: string;
  containers: DaemonContainerCounts;
}

interface RawVersion {
  Version?: string;
  ApiVersion?: string;
  MinAPIVersion?: string;
}

interface RawInfo {
  Containers?: number;
  ContainersRunning?: number;
  ContainersPaused?: number;
  ContainersStopped?: number;
  Driver?: string;
  CgroupDriver?: string;
  CgroupVersion?: string;
  OperatingSystem?: string;
  OSType?: string;
  KernelVersion?: string;
  Architecture?: string;
  DockerRootDir?: string;
}

const UNKNOWN = "unknown";

export async function getDaemonInfo(): Promise<DaemonInfo> {
  const client = getEngineClient();
  const [versionResponse, infoResponse, buildkitVersion] = await Promise.all([
    client.request("/version"),
    client.request("/info"),
    readBuildkitVersion(),
  ]);
  const version = JSON.parse(versionResponse.body) as RawVersion;
  const info = JSON.parse(infoResponse.body) as RawInfo;

  return {
    version: version.Version ?? UNKNOWN,
    apiVersion: version.ApiVersion ?? UNKNOWN,
    minApiVersion: version.MinAPIVersion,
    buildkitVersion,
    storageDriver: info.Driver ?? UNKNOWN,
    cgroupDriver: info.CgroupDriver ?? UNKNOWN,
    cgroupVersion: info.CgroupVersion,
    operatingSystem: info.OperatingSystem ?? UNKNOWN,
    osType: info.OSType ?? UNKNOWN,
    kernelVersion: info.KernelVersion ?? UNKNOWN,
    architecture: info.Architecture ?? UNKNOWN,
    rootDirectory: info.DockerRootDir ?? UNKNOWN,
    containers: {
      total: info.Containers ?? 0,
      running: info.ContainersRunning ?? 0,
      paused: info.ContainersPaused ?? 0,
      stopped: info.ContainersStopped ?? 0,
    },
  };
}

/** `undefined` when the buildx plugin is absent: an unreported version is not a failure of the whole reading. */
async function readBuildkitVersion(): Promise<string | undefined> {
  try {
    const output = await runDockerCapture(["buildx", "version"]);
    const match = output.match(/v?(\d+\.\d+\.\d+[^\s]*)/);
    return match ? match[1] : output.trim() || undefined;
  } catch {
    return undefined;
  }
}
