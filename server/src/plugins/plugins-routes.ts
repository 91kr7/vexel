import { Router, type Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import { sendHeld } from "../refresh-cache/refresh-cache-response.js";
import { inspectPlugin } from "./daemon-plugins-service.js";
import { pluginsInventoryCache } from "./plugins-inventory-service.js";
import {
  disablePlugin,
  enablePlugin,
  getPluginPrivileges,
  installPlugin,
  removePlugin,
  type PluginPrivilege,
} from "./plugin-management-service.js";

export const pluginsRouter = Router();

/** Both inventories in one reading (REQ-98, REQ-99), answered from the round the refresh cache holds. */
pluginsRouter.get("/", async (_req, res) => {
  try {
    sendHeld(res, await pluginsInventoryCache.read());
  } catch (error) {
    respondError(res, error);
  }
});

/** The privileges a reference asks for, read before anything is installed (REQ-99, REQ-111). */
pluginsRouter.get("/privileges", async (req, res) => {
  const remote = typeof req.query.remote === "string" ? req.query.remote.trim() : "";
  if (remote === "") {
    res.status(400).json({ error: "A 'remote' plugin reference is required" });
    return;
  }
  try {
    res.json(await getPluginPrivileges(remote));
  } catch (error) {
    respondError(res, error);
  }
});

pluginsRouter.get("/inspect", async (req, res) => {
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  if (name === "") {
    res.status(400).json({ error: "A 'name' is required" });
    return;
  }
  try {
    res.json(await inspectPlugin(name));
  } catch (error) {
    respondError(res, error);
  }
});

pluginsRouter.post("/install", async (req, res) => {
  const body = req.body as { remote?: unknown; alias?: unknown; grantedPrivileges?: unknown; enable?: unknown } | undefined;
  const remote = typeof body?.remote === "string" ? body.remote.trim() : "";
  if (remote === "") {
    res.status(400).json({ error: "A 'remote' plugin reference is required" });
    return;
  }
  if (!Array.isArray(body?.grantedPrivileges)) {
    res.status(400).json({ error: "A 'grantedPrivileges' list is required: a plugin is never installed without its privileges being granted" });
    return;
  }
  try {
    const plugin = await installPlugin({
      remote,
      alias: typeof body.alias === "string" && body.alias.trim() !== "" ? body.alias.trim() : undefined,
      grantedPrivileges: body.grantedPrivileges as PluginPrivilege[],
      enable: body.enable !== false,
    });
    res.status(201).json(plugin);
  } catch (error) {
    respondError(res, error);
  }
});

pluginsRouter.post("/enable", async (req, res) => {
  await changeState(req.body as { name?: unknown } | undefined, res, enablePlugin);
});

pluginsRouter.post("/disable", async (req, res) => {
  await changeState(req.body as { name?: unknown } | undefined, res, disablePlugin);
});

pluginsRouter.delete("/", async (req, res) => {
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  if (name === "") {
    res.status(400).json({ error: "A 'name' is required" });
    return;
  }
  try {
    await removePlugin(name);
    res.status(204).end();
  } catch (error) {
    respondError(res, error);
  }
});

async function changeState(body: { name?: unknown } | undefined, res: Response, change: (name: string) => Promise<unknown>): Promise<void> {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name === "") {
    res.status(400).json({ error: "A 'name' is required" });
    return;
  }
  try {
    res.json(await change(name));
  } catch (error) {
    respondError(res, error);
  }
}

function respondError(res: Response, error: unknown): void {
  if (error instanceof DockerDaemonError) {
    res.status(error.statusCode ?? 502).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: (error as Error).message });
}
