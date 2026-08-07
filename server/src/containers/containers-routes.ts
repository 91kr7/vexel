import { Router, type Request, type Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import { createContainer, type ContainerCreateSpec } from "./container-create-service.js";
import { streamContainerLogs, type ContainerLogOptions } from "./container-logs-service.js";
import { listContainerProcesses } from "./container-processes-service.js";
import { streamContainerStats } from "./container-stats-service.js";
import { importFilesystemImage, openContainerExportStream } from "./container-transfer-service.js";
import { sanitizeTarFilename } from "../images/image-transfer-service.js";
import {
  getContainerInspect,
  killContainer,
  listContainers,
  pauseContainer,
  pruneStoppedContainers,
  removeContainer,
  renameContainer,
  restartContainer,
  startContainer,
  stopContainer,
  unpauseContainer,
  updateContainerConfig,
  type ContainerConfigUpdate,
} from "./containers-service.js";

export const containersRouter = Router();

containersRouter.get("/", async (_req, res) => {
  try {
    res.json(await listContainers());
  } catch (error) {
    respondError(res, error);
  }
});

/**
 * Creation (REQ-27, REQ-28, REQ-29). The configuration is too large for a query
 * string and the response has to carry pull progress, so this is a POST whose
 * body streams back newline-delimited JSON events rather than a server-sent
 * event stream (which the browser can only open with GET). The stream always
 * ends with exactly one `created` or `error` event, and the HTTP status stays
 * 200 even on a refusal — the daemon's own message travels in the `error`
 * event so the client can keep the operator's entered values.
 */
containersRouter.post("/", async (req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();

  const spec = (req.body ?? {}) as ContainerCreateSpec;
  await createContainer(spec, {
    onImageResolved: (pulled) => writeNdjson(res, { type: "image-resolved", pulled }),
    onPullStep: (step) => writeNdjson(res, { type: "pull-step", step }),
    onCreated: (result) => {
      writeNdjson(res, { type: "created", result });
      res.end();
    },
    onError: (message) => {
      writeNdjson(res, { type: "error", message });
      res.end();
    },
  });
});

containersRouter.post("/:id/start", (req, res) => runLifecycle(res, () => startContainer(req.params.id)));
containersRouter.post("/:id/stop", (req, res) => runLifecycle(res, () => stopContainer(req.params.id)));
containersRouter.post("/:id/restart", (req, res) => runLifecycle(res, () => restartContainer(req.params.id)));
containersRouter.post("/:id/pause", (req, res) => runLifecycle(res, () => pauseContainer(req.params.id)));
containersRouter.post("/:id/unpause", (req, res) => runLifecycle(res, () => unpauseContainer(req.params.id)));
containersRouter.post("/:id/kill", (req, res) => runLifecycle(res, () => killContainer(req.params.id)));
containersRouter.delete("/:id", (req, res) => runLifecycle(res, () => removeContainer(req.params.id)));

containersRouter.post("/:id/rename", async (req, res) => {
  const name = (req.body as { name?: unknown } | undefined)?.name;
  if (typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "A non-empty name is required" });
    return;
  }
  await runLifecycle(res, () => renameContainer(req.params.id, name));
});

/**
 * Imports an image from an uploaded filesystem tarball body (REQ-43): streams
 * straight into the Engine API, never buffered whole. Registered before
 * `/:id/inspect` so "import" is never read as a container id.
 */
containersRouter.post("/import", async (req, res) => {
  let cancel: (() => void) | undefined;
  let closed = false;
  let responded = false;
  // Bound to the response, not the request: the upload body finishes arriving
  // (and `req` closes) well before the daemon answers, so a `req`-bound
  // listener would cancel a still-legitimately-running import. `res` only
  // closes early like this on a genuine client disconnect; `responded` guards
  // the normal case where it closes afterwards (e.g. on keep-alive teardown).
  res.on("close", () => {
    if (responded) return;
    closed = true;
    cancel?.();
  });

  try {
    const targetReference = typeof req.query.targetReference === "string" && req.query.targetReference.trim() !== "" ? req.query.targetReference : undefined;
    const changes = readStringListQuery(req.query.changes).filter((value) => value.trim() !== "");
    const result = await new Promise<{ id?: string; reference?: string }>((resolve, reject) => {
      importFilesystemImage(req, targetReference, changes.length > 0 ? changes : undefined, {
        onError: (message) => reject(new Error(message)),
        onEnd: resolve,
      })
        .then((c) => {
          cancel = c;
          if (closed) cancel();
        })
        .catch(reject);
    });
    responded = true;
    res.json(result);
  } catch (error) {
    responded = true;
    if (closed) return;
    respondError(res, error);
  }
});

/** Exports `id`'s current filesystem as a tarball streamed to the HTTP response as a browser download (REQ-43). */
containersRouter.get("/:id/export", async (req, res) => {
  try {
    const filenameHint = typeof req.query.filename === "string" ? req.query.filename : undefined;
    const { response, suggestedFilename } = await openContainerExportStream(req.params.id, filenameHint);
    res.setHeader("Content-Type", "application/x-tar");
    res.setHeader("Content-Disposition", `attachment; filename="${sanitizeTarFilename(suggestedFilename)}"`);
    req.on("close", () => response.destroy());
    response.on("error", () => res.destroy());
    response.pipe(res);
  } catch (error) {
    respondError(res, error);
  }
});

containersRouter.get("/:id/inspect", async (req, res) => {
  try {
    res.json(await getContainerInspect(req.params.id));
  } catch (error) {
    respondError(res, error);
  }
});

containersRouter.patch("/:id/config", async (req, res) => {
  try {
    const update = (req.body ?? {}) as ContainerConfigUpdate;
    res.json(await updateContainerConfig(req.params.id, update));
  } catch (error) {
    respondError(res, error);
  }
});

containersRouter.get("/:id/logs/stream", (req, res) =>
  runEventStream(req, res, () =>
    streamContainerLogs(req.params.id, readLogOptions(req), {
      onLine: (line) => writeServerSentEvent(res, "line", line),
      onError: (message) => endWithError(res, message),
      onEnd: () => endWithEvent(res),
    }),
  ),
);

containersRouter.get("/:id/stats/stream", (req, res) =>
  runEventStream(req, res, () =>
    streamContainerStats(req.params.id, {
      onSample: (sample) => writeServerSentEvent(res, "sample", sample),
      onError: (message) => endWithError(res, message),
      onEnd: () => endWithEvent(res),
    }),
  ),
);

containersRouter.get("/:id/processes", async (req, res) => {
  try {
    res.json(await listContainerProcesses(req.params.id));
  } catch (error) {
    respondError(res, error);
  }
});

containersRouter.post("/prune", async (_req, res) => {
  try {
    const result = await pruneStoppedContainers();
    res.json({ removedCount: result.removedIds.length, reclaimedBytes: result.reclaimedBytes });
  } catch (error) {
    respondError(res, error);
  }
});

function readLogOptions(req: Request): ContainerLogOptions {
  const query = req.query as Record<string, string | undefined>;
  const tail = query.tail;
  return {
    stdout: readBooleanQuery(query.stdout, true),
    stderr: readBooleanQuery(query.stderr, true),
    follow: readBooleanQuery(query.follow, true),
    timestamps: readBooleanQuery(query.timestamps, false),
    tail: tail === undefined || tail === "all" || Number.isNaN(Number(tail)) ? "all" : Number(tail),
    since: query.since,
    until: query.until,
  };
}

function readBooleanQuery(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value !== "false" && value !== "0";
}

function writeNdjson(res: Response, payload: unknown): void {
  res.write(`${JSON.stringify(payload)}\n`);
}

function readStringListQuery(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  return typeof value === "string" ? [value] : [];
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

/** Opens an unbuffered SSE response and cancels the upstream stream as soon as the client disconnects. */
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
    // The client may have disconnected while the stream was being opened.
    if (closed) cancel();
  } catch (error) {
    if (closed) return;
    endWithError(res, (error as Error).message);
  }
}

async function runLifecycle(res: Response, action: () => Promise<void>): Promise<void> {
  try {
    await action();
    res.status(204).end();
  } catch (error) {
    respondError(res, error);
  }
}

function respondError(res: Response, error: unknown): void {
  if (error instanceof DockerDaemonError) {
    res.status(error.statusCode ?? 502).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: (error as Error).message });
}
