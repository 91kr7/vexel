import { Router, type Response } from "express";
import { eventStreamService, type DaemonEvent } from "./event-stream-service.js";

export const eventsRouter = Router();

eventsRouter.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  for (const event of eventStreamService.getBacklog()) writeEvent(res, event);

  const onEvent = (event: DaemonEvent) => writeEvent(res, event);
  eventStreamService.on("event", onEvent);

  req.on("close", () => {
    eventStreamService.off("event", onEvent);
  });
});

function writeEvent(res: Response, event: DaemonEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
