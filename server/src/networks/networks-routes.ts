import { Router } from "express";
import type { Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import {
  attachContainer,
  createNetwork,
  detachContainer,
  getNetworkInspect,
  listNetworks,
  pruneNetworks,
  removeNetwork,
} from "./networks-service.js";

export const networksRouter = Router();

networksRouter.get("/", async (_req, res) => {
  try {
    res.json(await listNetworks());
  } catch (error) {
    respondError(res, error);
  }
});

networksRouter.get("/:id/inspect", async (req, res) => {
  try {
    res.json(await getNetworkInspect(req.params.id));
  } catch (error) {
    respondError(res, error);
  }
});

networksRouter.post("/", async (req, res) => {
  const body = req.body as
    | {
        name?: unknown;
        driver?: unknown;
        subnet?: unknown;
        gateway?: unknown;
        ipRange?: unknown;
        options?: unknown;
        labels?: unknown;
      }
    | undefined;
  if (typeof body?.name !== "string" || body.name.trim() === "") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  try {
    const created = await createNetwork({
      name: body.name,
      driver: typeof body.driver === "string" ? body.driver : undefined,
      subnet: typeof body.subnet === "string" ? body.subnet : undefined,
      gateway: typeof body.gateway === "string" ? body.gateway : undefined,
      ipRange: typeof body.ipRange === "string" ? body.ipRange : undefined,
      options: isStringRecord(body.options) ? body.options : undefined,
      labels: isStringRecord(body.labels) ? body.labels : undefined,
    });
    res.status(201).json(created);
  } catch (error) {
    respondError(res, error);
  }
});

networksRouter.delete("/:id", async (req, res) => {
  try {
    await removeNetwork(req.params.id);
    res.status(204).end();
  } catch (error) {
    respondError(res, error);
  }
});

networksRouter.post("/prune", async (_req, res) => {
  try {
    res.json(await pruneNetworks());
  } catch (error) {
    respondError(res, error);
  }
});

networksRouter.post("/:id/attach", async (req, res) => {
  const body = req.body as { containerId?: unknown } | undefined;
  if (typeof body?.containerId !== "string" || body.containerId.trim() === "") {
    res.status(400).json({ error: "containerId is required" });
    return;
  }
  try {
    res.json(await attachContainer(req.params.id, body.containerId));
  } catch (error) {
    respondError(res, error);
  }
});

networksRouter.post("/:id/detach", async (req, res) => {
  const body = req.body as { containerId?: unknown } | undefined;
  if (typeof body?.containerId !== "string" || body.containerId.trim() === "") {
    res.status(400).json({ error: "containerId is required" });
    return;
  }
  try {
    res.json(await detachContainer(req.params.id, body.containerId));
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
