import { Router, type Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import {
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

containersRouter.post("/prune", async (_req, res) => {
  try {
    const result = await pruneStoppedContainers();
    res.json({ removedCount: result.removedIds.length, reclaimedBytes: result.reclaimedBytes });
  } catch (error) {
    respondError(res, error);
  }
});

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
