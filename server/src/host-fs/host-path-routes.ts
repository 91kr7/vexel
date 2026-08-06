import { Router } from "express";
import { validateHostPath, type HostPathKind } from "./host-path-validator.js";

export const hostPathsRouter = Router();

hostPathsRouter.post("/validate", (req, res) => {
  const { path, kind, root } = (req.body ?? {}) as { path?: unknown; kind?: HostPathKind; root?: string };
  if (typeof path !== "string") {
    res.status(400).json({ valid: false, reason: "A 'path' string is required." });
    return;
  }
  res.json(validateHostPath({ path, kind, root }));
});
