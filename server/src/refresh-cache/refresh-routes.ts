import { Router } from "express";
import { reloadHeldValues } from "./refresh-cache.js";

export const refreshRouter = Router();

/**
 * The operator's "read it all again now" (REQ-7). It answers only once every
 * read has ended, so a client that waits for this response knows the held
 * values are the ones it will be served next. A read that failed is reported
 * here rather than thrown: the kind keeps what it held (REQ-9).
 */
refreshRouter.post("/", async (_req, res) => {
  const report = await reloadHeldValues();
  res.json({ ok: report.failed.length === 0, ...report });
});
