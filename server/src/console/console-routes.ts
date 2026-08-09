import { Router, type Request, type Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import { callEngineApi } from "./console-api-service.js";
import { runConsoleCliCommand } from "./console-cli-service.js";
import { classifyCommand, ConsoleInputError, type ConsoleChannel } from "./console-command.js";
import { appendConsoleHistoryEntry, readConsoleHistory, type NewConsoleHistoryEntry } from "./console-history-store.js";

export const consoleRouter = Router();

consoleRouter.post("/classify", (req, res) => {
  const input = readCommandInput(req, res);
  if (!input) return;
  res.json(classifyCommand(input.channel, input.command));
});

/**
 * Streams the CLI channel's output as newline-delimited JSON, ending with
 * exactly one `exit` or `error` event — `EventSource` cannot issue a POST, and
 * the output is unbounded. Closing the connection cancels the process.
 */
consoleRouter.post("/cli", (req, res) => {
  const body = req.body as { command?: unknown } | undefined;
  if (typeof body?.command !== "string") {
    res.status(400).json({ error: "A 'command' string is required" });
    return;
  }

  // Started before the stream headers go out: a line that cannot be run at all
  // (not a docker command, unterminated quote) is a rejected request, not a
  // stream that opens only to carry one error. Output cannot arrive before the
  // headers below — the child's first `data` event is a later tick.
  let cancel: () => void;
  try {
    cancel = runConsoleCliCommand(body.command, {
      onOutput: (chunk) => writeNdjson(res, { type: "output", ...chunk }),
      onExit: (exitCode) => {
        writeNdjson(res, { type: "exit", exitCode });
        res.end();
      },
      onError: (message) => {
        writeNdjson(res, { type: "error", message });
        res.end();
      },
    });
  } catch (error) {
    respondError(res, error);
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();
  // The *response*, not the request: since Node 16 a request emits `close` as
  // soon as its body has been read, which here is before the command has even
  // started. The response closes when the client goes away — the disconnect
  // that must cancel the process — or when this handler ended it, in which case
  // killing an already-exited child does nothing.
  res.on("close", () => cancel());
});

consoleRouter.post("/api", async (req, res) => {
  const body = req.body as { command?: unknown } | undefined;
  if (typeof body?.command !== "string") {
    res.status(400).json({ error: "A 'command' string is required" });
    return;
  }
  try {
    res.json(await callEngineApi(body.command));
  } catch (error) {
    respondError(res, error);
  }
});

consoleRouter.get("/history", (_req, res) => {
  res.json({ entries: readConsoleHistory() });
});

consoleRouter.post("/history", async (req, res) => {
  const body = req.body as Partial<NewConsoleHistoryEntry> | undefined;
  if (typeof body?.command !== "string" || (body.channel !== "cli" && body.channel !== "api")) {
    res.status(400).json({ error: "A 'command' string and a 'cli' or 'api' channel are required" });
    return;
  }
  try {
    const entries = await appendConsoleHistoryEntry(body as NewConsoleHistoryEntry);
    res.json({ entries });
  } catch (error) {
    respondError(res, error);
  }
});

function readCommandInput(req: Request, res: Response): { channel: ConsoleChannel; command: string } | undefined {
  const body = req.body as { channel?: unknown; command?: unknown } | undefined;
  if (typeof body?.command !== "string" || (body.channel !== "cli" && body.channel !== "api")) {
    res.status(400).json({ error: "A 'command' string and a 'cli' or 'api' channel are required" });
    return undefined;
  }
  return { channel: body.channel, command: body.command };
}

function writeNdjson(res: Response, payload: unknown): void {
  res.write(`${JSON.stringify(payload)}\n`);
}

function respondError(res: Response, error: unknown): void {
  if (error instanceof ConsoleInputError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof DockerDaemonError) {
    res.status(error.statusCode ?? 502).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: (error as Error).message });
}
