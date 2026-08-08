import express from "express";
import { connectivityRouter } from "./connectivity/connectivity-routes.js";
import { handleContainerSessionUpgrade } from "./containers/container-sessions-routes.js";
import { containersRouter } from "./containers/containers-routes.js";
import { startStatsSampler } from "./containers/containers-service.js";
import { eventsRouter } from "./events/events-routes.js";
import { eventStreamService } from "./events/event-stream-service.js";
import { hostPathsRouter } from "./host-fs/host-path-routes.js";
import { imageAnalysisRouter } from "./image-analysis/image-analysis-routes.js";
import { sweepAbandonedExtractionContainers } from "./image-analysis/filesystem-extraction-service.js";
import { imagesRouter } from "./images/images-routes.js";
import { networksRouter } from "./networks/networks-routes.js";
import { reclaimOrphans } from "./persistence/analysis-cache-store.js";
import { persistenceRouter } from "./persistence/persistence-routes.js";
import { volumesRouter } from "./volumes/volumes-routes.js";

const app = express();
const port = process.env.PORT ?? 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/connectivity", connectivityRouter);
app.use("/api/containers", containersRouter);
app.use("/api/images", imagesRouter);
app.use("/api/images", imageAnalysisRouter);
app.use("/api/volumes", volumesRouter);
app.use("/api/networks", networksRouter);
app.use("/api/events", eventsRouter);
app.use("/api/persistence", persistenceRouter);
app.use("/api/host-paths", hostPathsRouter);

eventStreamService.start();
startStatsSampler();
reclaimOrphans();
// The daemon may not be reachable yet at startup; a failed sweep here is not
// fatal, it only means a leftover container waits for the next successful one.
void sweepAbandonedExtractionContainers().catch(() => undefined);

const server = app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

server.on("upgrade", (request, socket, head) => {
  const handled = handleContainerSessionUpgrade(request, socket, head);
  if (!handled) socket.destroy();
});
