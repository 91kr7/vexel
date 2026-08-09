import { Router, type Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import { activateContext, createContext, listContexts, removeContext, type CreatableContextKind } from "./contexts-service.js";
import { getDaemonInfo } from "./daemon-info-service.js";

export const contextsRouter = Router();

const CREATABLE_KINDS: CreatableContextKind[] = ["local", "ssh"];

contextsRouter.get("/", async (_req, res) => {
  try {
    res.json(await listContexts());
  } catch (error) {
    respondError(res, error);
  }
});

/** Daemon information of the active context (REQ-94). Declared before `/:name` routes so the name never swallows it. */
contextsRouter.get("/daemon-info", async (_req, res) => {
  try {
    res.json(await getDaemonInfo());
  } catch (error) {
    respondError(res, error);
  }
});

contextsRouter.post("/", async (req, res) => {
  const body = req.body as { name?: unknown; kind?: unknown; host?: unknown; description?: unknown } | undefined;
  if (typeof body?.name !== "string" || body.name.trim() === "") {
    res.status(400).json({ error: "A 'name' string is required" });
    return;
  }
  if (typeof body.kind !== "string" || !CREATABLE_KINDS.includes(body.kind as CreatableContextKind)) {
    res.status(400).json({
      error: "'kind' must be 'local' or 'ssh'. A TCP+TLS context is created from the console, and is then listed and usable like any other.",
    });
    return;
  }
  const kind = body.kind as CreatableContextKind;
  const host = typeof body.host === "string" ? body.host.trim() : "";
  if (kind === "ssh" && host === "") {
    res.status(400).json({ error: "An SSH context needs a 'host' destination, e.g. user@host" });
    return;
  }
  try {
    const created = await createContext({
      name: body.name.trim(),
      kind,
      host: host === "" ? undefined : host,
      description: typeof body.description === "string" && body.description.trim() !== "" ? body.description.trim() : undefined,
    });
    res.status(201).json(created);
  } catch (error) {
    respondError(res, error);
  }
});

contextsRouter.post("/:name/use", async (req, res) => {
  try {
    res.json(await activateContext(req.params.name));
  } catch (error) {
    respondError(res, error);
  }
});

contextsRouter.delete("/:name", async (req, res) => {
  try {
    await removeContext(req.params.name);
    res.status(204).end();
  } catch (error) {
    respondError(res, error);
  }
});

function respondError(res: Response, error: unknown): void {
  if (error instanceof DockerDaemonError) {
    res.status(error.statusCode ?? 502).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: (error as Error).message });
}
