/*
 * Vexel — Copyright (C) 2026 Christian Mariani
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Licensed under the GNU Affero General Public License v3, supplemented by the
 * additional terms permitted under its section 7 — attribution, marking of modified
 * versions and the project name. See LICENSE and LICENSE-ADDITIONAL-TERMS.md at the
 * repository root.
 */
import express from "express";
import { buildersRouter } from "./builders/builders-routes.js";
import { mountClientApp } from "./client-serving.js";
import { composeRouter } from "./compose/compose-routes.js";
import { connectivityRouter } from "./connectivity/connectivity-routes.js";
import { consoleRouter } from "./console/console-routes.js";
import { contextsRouter } from "./contexts/contexts-routes.js";
import { publishActiveEndpoint } from "./contexts/contexts-service.js";
import { handleContainerSessionUpgrade } from "./containers/container-sessions-routes.js";
import { containersRouter } from "./containers/containers-routes.js";
import { eventsRouter } from "./events/events-routes.js";
import { eventStreamService } from "./events/event-stream-service.js";
import { hostPathsRouter } from "./host-fs/host-path-routes.js";
import { imageAnalysisRouter } from "./image-analysis/image-analysis-routes.js";
import { sweepAbandonedExtractionContainers } from "./image-analysis/filesystem-extraction-service.js";
import { imagesRouter } from "./images/images-routes.js";
import { networksRouter } from "./networks/networks-routes.js";
import { registriesRouter } from "./registries/registries-routes.js";
import { pluginsRouter } from "./plugins/plugins-routes.js";
import { reclaimOrphans } from "./persistence/analysis-cache-store.js";
import { persistenceRouter } from "./persistence/persistence-routes.js";
import { refreshRouter } from "./refresh-cache/refresh-routes.js";
import { systemRouter } from "./system/system-routes.js";
import { volumesRouter } from "./volumes/volumes-routes.js";

const app = express();
const port = process.env.PORT ?? 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/connectivity", connectivityRouter);
app.use("/api/contexts", contextsRouter);
app.use("/api/containers", containersRouter);
app.use("/api/images", imagesRouter);
app.use("/api/images", imageAnalysisRouter);
app.use("/api/volumes", volumesRouter);
app.use("/api/networks", networksRouter);
app.use("/api/registries", registriesRouter);
app.use("/api/compose", composeRouter);
app.use("/api/builders", buildersRouter);
app.use("/api/plugins", pluginsRouter);
app.use("/api/system", systemRouter);
app.use("/api/console", consoleRouter);
app.use("/api/events", eventsRouter);
app.use("/api/persistence", persistenceRouter);
app.use("/api/host-paths", hostPathsRouter);
app.use("/api/refresh", refreshRouter);

// Mount order below is load-bearing. An address under /api that no router above
// claimed fails here as the API's own JSON error, so a mistyped or removed call
// cannot be answered with the interface and look like a success
// (plan-docker_management_app-single_process_serving/REQ-4).
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "No such API route." });
});

// The interface comes last of all, after /health and every /api route: nothing
// registered after its history fallback would still be reachable for a page
// request, and nothing registered before /api could shadow the API
// (plan-docker_management_app-single_process_serving/REQ-1).
mountClientApp(app);

// Point every area at the daemon of the active Docker context before anything
// dials it; a failure here leaves the default endpoint in place (REQ-93).
void publishActiveEndpoint();

eventStreamService.start();
// No sampler is started here: the per-container stats sampler runs only while a
// consumer holds a subscription to the sampled figures, so a server left running
// with no browser attached asks the daemon for nothing
// (plan-docker_management_app-containers_card_view/REQ-41, REQ-44).
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
