import { Router } from "express";
import type { Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import { getBaselineReport } from "./baseline-service.js";
import { getDiskUsage } from "./disk-usage-service.js";
import { getSystemOverview } from "./overview-service.js";
import { isDiskUsageCategoryId, pruneScope } from "./prune-service.js";

export const systemRouter = Router();

systemRouter.get("/disk-usage", async (_req, res) => {
  try {
    res.json(await getDiskUsage());
  } catch (error) {
    respondError(res, error);
  }
});

// The dashboard's single reading of the host (REQ-14, REQ-16): one request
// rather than one per area, so its tiles cannot disagree with each other.
systemRouter.get("/overview", async (_req, res) => {
  try {
    res.json(await getSystemOverview());
  } catch (error) {
    respondError(res, error);
  }
});

// The Docker baseline the coverage statement refers to, next to the daemon
// currently connected (REQ-106). An unreachable daemon is reported inside the
// body, not as a failed request: the declared half stands on its own.
systemRouter.get("/baseline", async (_req, res) => {
  try {
    res.json(await getBaselineReport());
  } catch (error) {
    respondError(res, error);
  }
});

// One endpoint serves both prunes of REQ-96: a per-category prune is a scope of
// one, and reports exactly as the system-wide run does.
systemRouter.post("/prune", async (req, res) => {
  const body = req.body as { scope?: unknown } | undefined;
  const scope = Array.isArray(body?.scope) ? body.scope : [];
  if (scope.length === 0 || !scope.every(isDiskUsageCategoryId)) {
    res.status(400).json({ error: "scope must be a non-empty array of known prune categories" });
    return;
  }
  try {
    res.json(await pruneScope(scope));
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
