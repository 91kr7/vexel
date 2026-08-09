// CLI channel of the raw console (REQ-100): runs an arbitrary `docker` command
// line against the active context through the shared CLI runner, streaming
// stdout and stderr as they are produced and reporting the exit code.
import { runCliCommand } from "../docker/cli-runner.js";
import { resolveActiveEndpoint } from "../docker/endpoint.js";
import { parseCliCommandLine } from "./console-command.js";

export interface ConsoleOutputChunk {
  stream: "stdout" | "stderr";
  text: string;
}

export interface ConsoleCliHandlers {
  onOutput: (chunk: ConsoleOutputChunk) => void;
  /** The process ended; `null` when it was killed rather than exiting on its own. */
  onExit: (exitCode: number | null) => void;
  /** The process never ran (the binary is gone); exactly one of onExit/onError fires. */
  onError: (message: string) => void;
}

/**
 * Runs the line exactly as the operator typed it — parsed into an argv, never
 * rewritten — and returns the handle that cancels it.
 */
export function runConsoleCliCommand(commandLine: string, handlers: ConsoleCliHandlers): () => void {
  const argv = parseCliCommandLine(commandLine);
  // stdin is closed straight away: a command that would otherwise wait on input
  // nobody can type must fail rather than hang the console.
  const handle = runCliCommand(argv[0], argv.slice(1), resolveActiveEndpoint(), { stdin: "" });

  let settled = false;
  handle.onStdout((text) => handlers.onOutput({ stream: "stdout", text }));
  handle.onStderr((text) => handlers.onOutput({ stream: "stderr", text }));
  handle.onSpawnError((message) => {
    if (settled) return;
    settled = true;
    handlers.onError(message);
  });
  handle.done.then(({ exitCode }) => {
    if (settled) return;
    settled = true;
    handlers.onExit(exitCode);
  });

  return () => handle.cancel();
}
