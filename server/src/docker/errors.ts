// Typed Docker daemon error: preserves the daemon's own message instead of an
// opaque low-level socket/HTTP error.
export type DockerErrorCode = "DaemonUnreachable" | "DaemonRejected" | "UnsupportedApiVersion";

export class DockerDaemonError extends Error {
  readonly code: DockerErrorCode;
  readonly statusCode?: number;

  constructor(code: DockerErrorCode, message: string, cause?: unknown, statusCode?: number) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "DockerDaemonError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
