// Stack lifecycle over the CLI channel (REQ-76): up, down, restart and
// per-service scaling, streaming the command's own output and resolving with
// the project's resulting state.
import { runCliCommand } from "../docker/cli-runner.js";
import { resolveActiveEndpoint } from "../docker/endpoint.js";
import { composeProjectsCache, getComposeProject, type ComposeProjectSummary } from "./compose-discovery-service.js";

export interface ComposeCommandHandlers {
  onOutput: (line: string) => void;
  onResult: (project: ComposeProjectSummary) => void;
  onError: (message: string) => void;
}

function fileArgs(configFiles: string[]): string[] {
  return configFiles.flatMap((file) => ["-f", file]);
}

function runComposeCommand(name: string, args: string[], handlers: ComposeCommandHandlers): () => void {
  const handle = runCliCommand("docker", ["compose", ...args], resolveActiveEndpoint());
  let pending = "";

  const emitLines = (chunk: string) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) handlers.onOutput(line);
  };

  // `done` still resolves after a spawn failure (Node reports `close` right
  // after `error`), so this guard keeps exactly one of onResult/onError firing.
  let settled = false;
  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    handlers.onError(message);
  };

  handle.onStdout(emitLines);
  handle.onStderr(emitLines);
  handle.onSpawnError(fail);
  handle.done.then(async ({ exitCode }) => {
    if (settled) return;
    if (exitCode !== 0 && exitCode !== null) {
      fail(`docker compose exited with code ${exitCode}`);
      return;
    }
    // Every up/down/restart/scale ends here, so none of them can forget to say
    // the discovery has changed: without it the stack the operator just started
    // would wait for a timer to show (REQ-13).
    composeProjectsCache.markChanged();
    try {
      const project = await getComposeProject(name);
      if (settled) return;
      settled = true;
      handlers.onResult(project);
    } catch (error) {
      fail((error as Error).message);
    }
  });

  return () => handle.cancel();
}

export function runComposeUp(name: string, configFiles: string[], handlers: ComposeCommandHandlers): () => void {
  return runComposeCommand(name, [...fileArgs(configFiles), "-p", name, "up", "-d"], handlers);
}

export function runComposeDown(name: string, configFiles: string[], handlers: ComposeCommandHandlers): () => void {
  return runComposeCommand(name, [...fileArgs(configFiles), "-p", name, "down"], handlers);
}

export function runComposeRestart(name: string, configFiles: string[], handlers: ComposeCommandHandlers): () => void {
  return runComposeCommand(name, [...fileArgs(configFiles), "-p", name, "restart"], handlers);
}

/** Scales a single service to `replicas`, leaving the rest of the stack untouched. */
export function scaleComposeService(
  name: string,
  configFiles: string[],
  service: string,
  replicas: number,
  handlers: ComposeCommandHandlers,
): () => void {
  const args = [...fileArgs(configFiles), "-p", name, "up", "-d", "--no-recreate", "--scale", `${service}=${replicas}`, service];
  return runComposeCommand(name, args, handlers);
}
