import { Router, type Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import { buildCacheListCache, pruneBuildCache } from "./build-cache-service.js";
import { getBuildCacheUsage } from "./build-cache-usage-service.js";
import { builderListCache, createBuilder, removeBuilder, useBuilder } from "./builders-service.js";
import { sendHeld } from "../refresh-cache/refresh-cache-response.js";

export const buildersRouter = Router();

/** Answered from the value the refresh cache holds (REQ-9); only an inventory never read before waits for the CLI. */
buildersRouter.get("/", async (_req, res) => {
  try {
    sendHeld(res, await builderListCache.read());
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

/** Answered from the value the refresh cache holds (REQ-9); only an inventory never read before waits for the CLI. */
buildersRouter.get("/cache", async (_req, res) => {
  try {
    sendHeld(res, await buildCacheListCache.read());
  } catch (error) {
    respondError(res, error);
  }
});

/** The images and layers a cache record relates to, or the reason none can be named (REQ-69). */
buildersRouter.get("/cache/:id/usage", async (req, res) => {
  try {
    const usage = await getBuildCacheUsage(req.params.id);
    if (!usage) {
      res.status(404).json({ error: `No build-cache record with id "${req.params.id}".` });
      return;
    }
    res.json(usage);
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
