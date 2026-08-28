import { Router } from "express";
import { sendHeld } from "../refresh-cache/refresh-cache-response.js";
import { connectionStatusCache } from "./connection-status-service.js";

export const connectivityRouter = Router();

/** Answered from the value the refresh cache holds (REQ-9); only a status never read before waits for the daemon. */
connectivityRouter.get("/status", async (_req, res) => {
  sendHeld(res, await connectionStatusCache.read());
});
