import { Router } from "express";
import { timingScale } from "./timing-scale.js";

export const timingScaleRouter = Router();

// The browser has no environment to read, so the process that has one answers for it. No daemon call.
timingScaleRouter.get("/", (_req, res) => {
  res.json({ scale: timingScale });
});
