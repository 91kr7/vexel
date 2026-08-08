import { Router, type Request, type Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import { getComposeProject, listComposeProjects } from "./compose-discovery-service.js";
import { readComposeFiles, validateComposeFile, writeComposeFile } from "./compose-file-service.js";
import {
  runComposeDown,
  runComposeRestart,
  runComposeUp,
  scaleComposeService,
  type ComposeCommandHandlers,
} from "./compose-lifecycle-service.js";
import { streamComposeLogs } from "./compose-logs-service.js";

export const composeRouter = Router();

composeRouter.get("/projects", async (_req, res) => {
  try {
    res.json(await listComposeProjects());
  } catch (error) {
    respondError(res, error);
  }
});

composeRouter.post("/projects/:name/up", (req, res) => runLifecycle(req, res, runComposeUp));
composeRouter.post("/projects/:name/down", (req, res) => runLifecycle(req, res, runComposeDown));
composeRouter.post("/projects/:name/restart", (req, res) => runLifecycle(req, res, runComposeRestart));

composeRouter.post("/projects/:name/services/:service/scale", async (req, res) => {
  const body = req.body as { replicas?: unknown } | undefined;
  const replicas = typeof body?.replicas === "number" ? body.replicas : Number(body?.replicas);
  if (!Number.isFinite(replicas) || replicas < 0) {
    res.status(400).json({ error: "A non-negative 'replicas' number is required" });
    return;
  }
  const project = await safeGetProject(req.params.name, res);
  if (!project) return;
  runNdjsonCommand(req, res, (handlers) => scaleComposeService(project.name, project.configFiles, req.params.service, replicas, handlers));
});

composeRouter.get("/projects/:name/files", async (req, res) => {
  try {
    res.json(await readComposeFiles(req.params.name));
  } catch (error) {
    respondError(res, error);
  }
});

composeRouter.post("/projects/:name/files", async (req, res) => {
  const body = req.body as { path?: unknown; content?: unknown } | undefined;
  if (typeof body?.path !== "string" || typeof body?.content !== "string") {
    res.status(400).json({ error: "'path' and 'content' strings are required" });
    return;
  }
  try {
    res.json(await writeComposeFile(req.params.name, body.path, body.content));
  } catch (error) {
    respondError(res, error);
  }
});

composeRouter.post("/projects/:name/validate", async (req, res) => {
  try {
    res.json(await validateComposeFile(req.params.name));
  } catch (error) {
    respondError(res, error);
  }
});

composeRouter.get("/projects/:name/logs/stream", (req, res) =>
  runEventStream(req, res, async () => {
    const project = await getComposeProject(req.params.name);
    return streamComposeLogs(project.name, project.configFiles, {
      onLine: (line) => writeServerSentEvent(res, "line", line),
      onError: (message) => endWithError(res, message),
      onEnd: () => endWithEvent(res),
    });
  }),
);

async function safeGetProject(name: string, res: Response) {
  try {
    return await getComposeProject(name);
  } catch (error) {
    respondError(res, error);
    return undefined;
  }
}

/**
 * up/down/restart share the same shape: the project's own discovered config
 * files resolved first, then run through `runNdjsonCommand`.
 */
function runLifecycle(
  req: Request,
  res: Response,
  run: (name: string, configFiles: string[], handlers: ComposeCommandHandlers) => () => void,
): void {
  void (async () => {
    const project = await safeGetProject(String(req.params.name), res);
    if (!project) return;
    runNdjsonCommand(req, res, (handlers) => run(project.name, project.configFiles, handlers));
  })();
}

/**
 * Streams a compose command's output as newline-delimited JSON, ending with
 * exactly one `result` or `error` event — `EventSource` cannot issue a POST,
 * and the output is unbounded (mirrors the container-create endpoint).
 */
function runNdjsonCommand(req: Request, res: Response, open: (handlers: ComposeCommandHandlers) => () => void): void {
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();

  const cancel = open({
    onOutput: (line) => writeNdjson(res, { type: "output", line }),
    onResult: (project) => {
      writeNdjson(res, { type: "result", project });
      res.end();
    },
    onError: (message) => {
      writeNdjson(res, { type: "error", message });
      res.end();
    },
  });
  req.on("close", cancel);
}

async function runEventStream(req: Request, res: Response, open: () => Promise<() => void>): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let cancel: (() => void) | undefined;
  let closed = false;
  req.on("close", () => {
    closed = true;
    cancel?.();
  });
  try {
    cancel = await open();
    if (closed) cancel();
  } catch (error) {
    if (closed) return;
    endWithError(res, (error as Error).message);
  }
}

function writeNdjson(res: Response, payload: unknown): void {
  res.write(`${JSON.stringify(payload)}\n`);
}

function writeServerSentEvent(res: Response, event: string, payload: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function endWithEvent(res: Response, payload: unknown = {}): void {
  writeServerSentEvent(res, "end", payload);
  res.end();
}

function endWithError(res: Response, message: string): void {
  writeServerSentEvent(res, "error", { message });
  res.end();
}

function respondError(res: Response, error: unknown): void {
  if (error instanceof DockerDaemonError) {
    res.status(error.statusCode ?? 502).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: (error as Error).message });
}
