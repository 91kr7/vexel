// CLI channel of the registries area: runs `docker` and the host's credential
// helpers to completion and buffers their output. Internal to this module —
// registry credentials live in the local Docker configuration and in the
// credential store, which only these binaries own.
//
// Two rules this helper exists to enforce (REQ-87): a secret is handed over on
// standard input, never in `argv` where `ps` would show it, and every message
// leaving here — thrown, returned or logged by a caller — is passed through
// redaction first, so a secret can never ride out on an error string.
import { runCliCommand } from "../docker/cli-runner.js";
import { resolveActiveEndpoint } from "../docker/endpoint.js";
import { DockerDaemonError } from "../docker/errors.js";

const REDACTED = "***";

export interface CaptureOptions {
  /** Written to the child's standard input, which is then closed. */
  stdin?: string;
  /** Values redacted from anything this helper produces or throws. */
  redact?: string[];
}

/** Replaces every occurrence of each secret with a fixed marker. */
export function redact(message: string, secrets: string[] | undefined): string {
  if (!secrets || secrets.length === 0) return message;
  return secrets.reduce((current, secret) => (secret === "" ? current : current.split(secret).join(REDACTED)), message);
}

/**
 * Runs `command args…` to completion, resolving with its full stdout. Standard
 * input is always closed: nothing here is interactive, and a credential helper
 * left waiting on a stdin that never ends would hang the request.
 */
export async function runCapture(command: string, args: string[], options: CaptureOptions = {}): Promise<string> {
  const handle = runCliCommand(command, args, resolveActiveEndpoint(), { stdin: options.stdin ?? "" });
  let stdout = "";
  let stderr = "";
  let spawnError: string | undefined;
  handle.onStdout((chunk) => (stdout += chunk));
  handle.onStderr((chunk) => (stderr += chunk));
  handle.onSpawnError((message) => (spawnError = message));

  const { exitCode } = await handle.done;
  if (spawnError !== undefined) throw new DockerDaemonError("DaemonRejected", redact(spawnError, options.redact));
  if (exitCode !== 0) {
    const message = stderr.trim() || stdout.trim() || `${command} exited with code ${exitCode}`;
    throw new DockerDaemonError("DaemonRejected", redact(message, options.redact));
  }
  return stdout;
}
