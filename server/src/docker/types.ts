// Shared types for the Docker access layer (Engine API client + CLI runner).

export interface TlsOptions {
  ca: string;
  cert: string;
  key: string;
}

export type DockerEndpoint =
  | { kind: "unix"; socketPath: string }
  | { kind: "tcp"; host: string; port: number; tls?: TlsOptions }
  | { kind: "ssh"; destination: string };
