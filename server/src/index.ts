import express from "express";
import { connectivityRouter } from "./connectivity/connectivity-routes.js";
import { eventsRouter } from "./events/events-routes.js";
import { eventStreamService } from "./events/event-stream-service.js";
import { hostPathsRouter } from "./host-fs/host-path-routes.js";
import { reclaimOrphans } from "./persistence/analysis-cache-store.js";
import { persistenceRouter } from "./persistence/persistence-routes.js";

const app = express();
const port = process.env.PORT ?? 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/connectivity", connectivityRouter);
app.use("/api/events", eventsRouter);
app.use("/api/persistence", persistenceRouter);
app.use("/api/host-paths", hostPathsRouter);

eventStreamService.start();
reclaimOrphans();

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
