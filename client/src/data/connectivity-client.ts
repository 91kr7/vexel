// Typed client for the server's connectivity endpoint (REQ-9, REQ-10, REQ-13, REQ-110).
export interface CliToolStatus {
  available: boolean;
  version?: string;
}

export interface CliAvailability {
  docker: CliToolStatus;
  compose: CliToolStatus;
  buildx: CliToolStatus;
}

export interface ConnectionStatus {
  daemon: { reachable: boolean; cause?: string };
  apiVersion?: string;
  engineVersion?: string;
  cli: CliAvailability;
  unavailableCapabilities: string[];
}

/** Reads the server's live connectivity report. */
export async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const response = await fetch("/api/connectivity/status");
  if (!response.ok) throw new Error(`Connectivity status request failed with HTTP ${response.status}`);
  return (await response.json()) as ConnectionStatus;
}
