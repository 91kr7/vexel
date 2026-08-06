import { Router } from "express";
import { getConnectionStatus } from "./connection-status-service.js";

export const connectivityRouter = Router();

connectivityRouter.get("/status", async (_req, res) => {
  const status = await getConnectionStatus();
  res.json(status);
});
