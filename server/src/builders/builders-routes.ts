import { Router, type Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import { pruneBuildCache, listBuildCache } from "./build-cache-service.js";
import { createBuilder, listBuilders, removeBuilder, useBuilder } from "./builders-service.js";

export const buildersRouter = Router();

buildersRouter.get("/", async (_req, res) => {
  try {
    res.json(await listBuilders());
  } catch (error) {
    respondError(res, error);
  }
});

buildersRouter.post("/", async (req, res) => {
  const body = req.body as { name?: unknown; driver?: unknown; endpoint?: unknown; platforms?: unknown } | undefined;
  if (typeof body?.name !== "string" || body.name.trim() === "" || typeof body?.driver !== "string" || body.driver.trim() === "") {
    res.status(400).json({ error: "'name' and 'driver' strings are required" });
    return;
  }
  const platforms = Array.isArray(body.platforms) ? body.platforms.filter((platform): platform is string => typeof platform === "string") : [];
  try {
    const created = await createBuilder({
      name: body.name,
      driver: body.driver,
      endpoint: typeof body.endpoint === "string" && body.endpoint.trim() !== "" ? body.endpoint : undefined,
      platforms,
    });
    res.status(201).json(created);
  } catch (error) {
    respondError(res, error);
  }
});

buildersRouter.delete("/:name", async (req, res) => {
  try {
    await removeBuilder(req.params.name);
    res.status(204).end();
  } catch (error) {
    respondError(res, error);
  }
});

buildersRouter.post("/:name/use", async (req, res) => {
  try {
    res.json(await useBuilder(req.params.name));
  } catch (error) {
    respondError(res, error);
  }
});

buildersRouter.get("/cache", async (_req, res) => {
  try {
    res.json(await listBuildCache());
  } catch (error) {
    respondError(res, error);
  }
});

buildersRouter.post("/cache/prune", async (_req, res) => {
  try {
    res.json(await pruneBuildCache());
  } catch (error) {
    respondError(res, error);
  }
});

function respondError(res: Response, error: unknown): void {
  if (error instanceof DockerDaemonError) {
    res.status(error.statusCode ?? 502).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: (error as Error).message });
}
