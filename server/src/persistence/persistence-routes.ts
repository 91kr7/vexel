import { Router } from "express";
import { clear, totalSizeBytes } from "./analysis-cache-store.js";
import { readNamespace, writeNamespace } from "./local-store.js";

export interface OperatorPreferences {
  lastScreenId?: string;
  selectedContext?: string;
  listFilters: Record<string, unknown>;
  logFollow: boolean;
  logTimestamps: boolean;
}

export const DEFAULT_PREFERENCES: OperatorPreferences = {
  listFilters: {},
  logFollow: true,
  logTimestamps: false,
};

export const persistenceRouter = Router();

persistenceRouter.get("/preferences", (_req, res) => {
  res.json(readNamespace("preferences", DEFAULT_PREFERENCES));
});

persistenceRouter.put("/preferences", async (req, res) => {
  const stored = readNamespace("preferences", DEFAULT_PREFERENCES);
  const merged: OperatorPreferences = { ...stored, ...(req.body ?? {}) };
  await writeNamespace("preferences", merged);
  res.json(merged);
});

persistenceRouter.get("/analysis-cache", (_req, res) => {
  res.json({ totalSizeBytes: totalSizeBytes() });
});

persistenceRouter.post("/analysis-cache/clear", async (_req, res) => {
  await clear();
  res.status(204).end();
});
