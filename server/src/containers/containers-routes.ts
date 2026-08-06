import { Router, type Request, type Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import { streamContainerLogs, type ContainerLogOptions } from "./container-logs-service.js";
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

containersRouter.get("/:id/logs/stream", async (req, res) => {
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
    cancel = await streamContainerLogs(req.params.id, readLogOptions(req), {
      onLine: (line) => writeServerSentEvent(res, "line", line),
      onError: (message) => {
        writeServerSentEvent(res, "error", { message });
        res.end();
      },
      onEnd: () => {
        writeServerSentEvent(res, "end", {});
        res.end();
      },
    });
    // The client may have disconnected while the stream was being opened.
    if (closed) cancel();
  } catch (error) {
    if (closed) return;
    writeServerSentEvent(res, "error", { message: (error as Error).message });
    res.end();
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

function writeServerSentEvent(res: Response, event: string, payload: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
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
