import { Router, type Response } from "express";
import { eventStreamService, type DaemonEvent } from "../events/event-stream-service.js";
import { openChannel } from "./held-value-publisher.js";

export const liveChannelRouter = Router();

/** The one connection a window opens: the daemon events and every value the server holds (REQ-1, REQ-2, REQ-3). */
liveChannelRouter.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // An unknown identity falls back to the whole backlog: re-delivering an event
  // the client can recognize beats losing one.
  const backlog = eventStreamService.getBacklog();
  const lastDelivered = req.headers["last-event-id"];
  const resumeFrom = typeof lastDelivered === "string" ? backlog.findIndex((event) => event.id === lastDelivered) : -1;
  for (const event of backlog.slice(resumeFrom + 1)) writeEvent(res, event);

  const onEvent = (event: DaemonEvent) => writeEvent(res, event);
  eventStreamService.on("event", onEvent);

  const closeChannel = openChannel({
    sendValue: (payload) => void res.write(`event: value\ndata: ${payload}\n\n`),
    sendDiscarded: () => void res.write(`event: discarded\ndata: {}\n\n`),
    sendReloadEnded: () => void res.write(`event: reloaded\ndata: {}\n\n`),
  });

  req.on("close", () => {
    eventStreamService.off("event", onEvent);
    closeChannel();
  });
});

/** Only a daemon event carries an identity: `Last-Event-ID` names one of those and nothing else. */
function writeEvent(res: Response, event: DaemonEvent): void {
  res.write(`id: ${event.id}\nevent: daemon-event\ndata: ${JSON.stringify(event)}\n\n`);
}
