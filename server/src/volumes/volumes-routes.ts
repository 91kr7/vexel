import { Router } from "express";
import type { Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import { createVolume, getVolumeInspect, listVolumes, pruneVolumes, removeVolume } from "./volumes-service.js";

export const volumesRouter = Router();

volumesRouter.get("/", async (_req, res) => {
  try {
    res.json(await listVolumes());
  } catch (error) {
    respondError(res, error);
  }
});

volumesRouter.get("/:name/inspect", async (req, res) => {
  try {
    res.json(await getVolumeInspect(req.params.name));
  } catch (error) {
    respondError(res, error);
  }
});

volumesRouter.post("/", async (req, res) => {
  const body = req.body as { name?: unknown; driver?: unknown; driverOpts?: unknown; labels?: unknown } | undefined;
  try {
    const created = await createVolume({
      name: typeof body?.name === "string" ? body.name : undefined,
      driver: typeof body?.driver === "string" ? body.driver : undefined,
      driverOpts: isStringRecord(body?.driverOpts) ? body.driverOpts : undefined,
      labels: isStringRecord(body?.labels) ? body.labels : undefined,
    });
    res.status(201).json(created);
  } catch (error) {
    respondError(res, error);
  }
});

volumesRouter.delete("/:name", async (req, res) => {
  try {
    await removeVolume(req.params.name);
    res.status(204).end();
  } catch (error) {
    respondError(res, error);
  }
});

volumesRouter.post("/prune", async (_req, res) => {
  try {
    const result = await pruneVolumes();
    res.json({ removedNames: result.removedNames, reclaimedBytes: result.reclaimedBytes });
  } catch (error) {
    respondError(res, error);
  }
});

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function respondError(res: Response, error: unknown): void {
  if (error instanceof DockerDaemonError) {
    res.status(error.statusCode ?? 502).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: (error as Error).message });
}
