// Typed description of the server's container stats stream and process
// listing (REQ-32, REQ-33).

export interface ContainerStatsSample {
  at: string;
  cpuPercent: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
  networkRxBytes: number;
  networkTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  pids: number;
}

export interface ContainerProcess {
  pid: number;
  user: string;
  command: string;
  cpuPercent?: number;
  memoryPercent?: number;
}

export interface ContainerProcessList {
  titles: string[];
  processes: ContainerProcess[];
}

/** URL of the live stats stream for a container. */
export function containerStatsStreamUrl(id: string): string {
  return `/api/containers/${encodeURIComponent(id)}/stats/stream`;
}

export async function fetchContainerProcesses(id: string): Promise<ContainerProcessList> {
  const response = await fetch(`/api/containers/${encodeURIComponent(id)}/processes`);
  if (!response.ok) {
    let message = `Request failed with HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // no JSON body; keep the generic message
    }
    throw new Error(message);
  }
  return (await response.json()) as ContainerProcessList;
}
