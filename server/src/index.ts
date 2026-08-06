import express from "express";
import { connectivityRouter } from "./connectivity/connectivity-routes.js";
import { eventsRouter } from "./events/events-routes.js";
import { eventStreamService } from "./events/event-stream-service.js";

const app = express();
const port = process.env.PORT ?? 3000;

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/connectivity", connectivityRouter);
app.use("/api/events", eventsRouter);

eventStreamService.start();

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
