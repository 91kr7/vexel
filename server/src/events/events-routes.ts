import { Router, type Response } from "express";
import { eventStreamService, type DaemonEvent } from "./event-stream-service.js";

export const eventsRouter = Router();

eventsRouter.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // A browser that reconnects replays its last identity, so the catch-up
  // resumes just after the event it already has instead of handing the whole
  // backlog over a second time. An unknown identity (the backlog rolled past
  // it, or a context switch emptied it) falls back to the whole backlog:
  // re-delivering an event the client can recognize beats losing one.
  const backlog = eventStreamService.getBacklog();
  const lastDelivered = req.headers["last-event-id"];
  const resumeFrom = typeof lastDelivered === "string" ? backlog.findIndex((event) => event.id === lastDelivered) : -1;
  for (const event of backlog.slice(resumeFrom + 1)) writeEvent(res, event);

  const onEvent = (event: DaemonEvent) => writeEvent(res, event);
  eventStreamService.on("event", onEvent);

  req.on("close", () => {
    eventStreamService.off("event", onEvent);
  });
});

function writeEvent(res: Response, event: DaemonEvent): void {
  res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
}
