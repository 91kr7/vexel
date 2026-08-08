// Aggregated log streaming for every service of a project (REQ-78), through
// `docker compose logs --follow`: each line already carries its own service
// name, which this module extracts rather than re-deriving. Cancellable on
// consumer disconnect.
import { runCliCommand } from "../docker/cli-runner.js";
import { resolveActiveEndpoint } from "../docker/endpoint.js";

export interface ComposeLogLine {
  seq: number;
  service: string;
  timestamp?: string;
  text: string;
}

export interface ComposeLogHandlers {
  onLine: (line: ComposeLogLine) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

// `docker compose logs` prefixes every line with "<container-name>  | <content>";
// the container name carries an optional "-<replica index>" suffix.
const LOG_LINE_PATTERN = /^([\w.-]+?)(?:-\d+)?\s*\|\s?(.*)$/;

export function streamComposeLogs(projectName: string, configFiles: string[], handlers: ComposeLogHandlers): () => void {
  const args = [...configFiles.flatMap((file) => ["-f", file]), "-p", projectName, "logs", "--follow", "--no-color", "--timestamps"];
  const handle = runCliCommand("docker", ["compose", ...args], resolveActiveEndpoint());
  let seq = 0;
  let pending = "";
  let stderrBuffer = "";

  handle.onStdout((chunk) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const raw of lines) {
      const parsed = parseLogLine(raw);
      if (!parsed) continue;
      seq += 1;
      handlers.onLine({ seq, ...parsed });
    }
  });
  // `done` still resolves after a spawn failure (Node reports `close` right
  // after `error`), so this guard keeps exactly one of onEnd/onError firing.
  let settled = false;
  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    handlers.onError(message);
  };

  handle.onStderr((chunk) => (stderrBuffer += chunk));
  handle.onSpawnError(fail);
  handle.done.then(({ exitCode }) => {
    if (settled) return;
    if (exitCode !== 0 && exitCode !== null) {
      fail(stderrBuffer.trim() || `docker compose logs exited with code ${exitCode}`);
      return;
    }
    settled = true;
    handlers.onEnd();
  });

  return () => handle.cancel();
}

function parseLogLine(raw: string): { service: string; timestamp?: string; text: string } | undefined {
  const match = LOG_LINE_PATTERN.exec(raw);
  if (!match) return undefined;
  const [, service, rest] = match;
  const spaceIndex = rest.indexOf(" ");
  if (spaceIndex !== -1 && !Number.isNaN(Date.parse(rest.slice(0, spaceIndex)))) {
    return { service, timestamp: rest.slice(0, spaceIndex), text: rest.slice(spaceIndex + 1) };
  }
  return { service, text: rest };
}
