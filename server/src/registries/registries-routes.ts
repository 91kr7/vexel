// Registry endpoints (REQ-85, REQ-86, REQ-87). The login endpoint is the only
// one that ever receives a secret: it accepts it, hands it to the credential
// store and answers with nothing but the registry's resulting state. No
// endpoint here returns, echoes or logs a credential.
import { Router, type Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import { listRepositoryTags, searchRepositories } from "./registry-catalog-service.js";
import { getRegistry, listRegistries, loginToRegistry, logoutFromRegistry } from "./registries-service.js";

export const registriesRouter = Router();

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

registriesRouter.get("/", async (_req, res) => {
  try {
    res.json(await listRegistries());
  } catch (error) {
    respondError(res, error);
  }
});

/** Repositories of a registry, searched by term. Declared before `/:host` shapes so no host swallows it. */
registriesRouter.get("/repositories", async (req, res) => {
  const host = typeof req.query.host === "string" ? req.query.host.trim() : "";
  if (host === "") {
    res.status(400).json({ error: "A 'host' query parameter is required" });
    return;
  }
  try {
    const registry = await getRegistry(host);
    res.json(await searchRepositories(registry, typeof req.query.query === "string" ? req.query.query : "", readLimit(req.query.limit)));
  } catch (error) {
    respondError(res, error);
  }
});

registriesRouter.get("/tags", async (req, res) => {
  const host = typeof req.query.host === "string" ? req.query.host.trim() : "";
  const repository = typeof req.query.repository === "string" ? req.query.repository.trim() : "";
  if (host === "" || repository === "") {
    res.status(400).json({ error: "Both a 'host' and a 'repository' query parameter are required" });
    return;
  }
  try {
    const registry = await getRegistry(host);
    res.json(await listRepositoryTags(registry, repository, readLimit(req.query.limit)));
  } catch (error) {
    respondError(res, error);
  }
});

/**
 * Logs in to a registry. The secret is read from the request body, passed
 * straight to the credential store through the CLI and dropped; it is never
 * stored by the application, never written to a log and never part of any
 * response — including an error one (REQ-87).
 */
registriesRouter.post("/login", async (req, res) => {
  const body = req.body as { host?: unknown; username?: unknown; secret?: unknown } | undefined;
  if (typeof body?.host !== "string" || body.host.trim() === "") {
    res.status(400).json({ error: "A 'host' string is required" });
    return;
  }
  if (typeof body.username !== "string" || body.username.trim() === "") {
    res.status(400).json({ error: "A 'username' string is required" });
    return;
  }
  if (typeof body.secret !== "string" || body.secret === "") {
    res.status(400).json({ error: "A 'secret' string is required" });
    return;
  }
  try {
    res.json(await loginToRegistry({ host: body.host, username: body.username, secret: body.secret }));
  } catch (error) {
    respondError(res, error);
  }
});

registriesRouter.post("/logout", async (req, res) => {
  const host = (req.body as { host?: unknown } | undefined)?.host;
  if (typeof host !== "string" || host.trim() === "") {
    res.status(400).json({ error: "A 'host' string is required" });
    return;
  }
  try {
    res.json(await logoutFromRegistry(host));
  } catch (error) {
    respondError(res, error);
  }
});

function readLimit(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function respondError(res: Response, error: unknown): void {
  if (error instanceof DockerDaemonError) {
    res.status(error.statusCode ?? 502).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: (error as Error).message });
}
