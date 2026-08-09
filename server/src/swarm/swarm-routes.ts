// Swarm endpoints (REQ-79 to REQ-84).
//
// Two properties hold across this router. A *reading* never fails because the
// daemon is not a swarm manager: it answers 200 with an empty listing and the
// reason, so the screen states the situation instead of showing an error. And
// no response ever carries a secret's or a config's value — the creation
// endpoints are the only place a value is accepted, and they take it in a body.
//
// Nothing here deploys a stack: no endpoint takes a compose file or a path
// (departure Three).
import { Router, type Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import { listNodes, removeNode, updateNode, type SwarmNodeAvailability, type SwarmNodeRole } from "./swarm-nodes-service.js";
import {
  createSwarmData,
  getSwarmDataMetadata,
  listSwarmData,
  removeSwarmData,
  type SwarmDataKind,
} from "./swarm-secrets-service.js";
import {
  createService,
  getServiceDetail,
  listServices,
  removeService,
  updateService,
  type SwarmServiceMode,
  type SwarmServicePort,
} from "./swarm-services-service.js";
import { listStacks, removeStack } from "./swarm-stacks-service.js";
import {
  getJoinTokens,
  getSwarmState,
  initialiseSwarm,
  joinSwarm,
  leaveSwarm,
  rotateJoinToken,
} from "./swarm-state-service.js";

export const swarmRouter = Router();

const NODE_ROLES: SwarmNodeRole[] = ["manager", "worker"];
const NODE_AVAILABILITIES: SwarmNodeAvailability[] = ["active", "pause", "drain"];

swarmRouter.get("/", async (_req, res) => {
  try {
    res.json(await getSwarmState());
  } catch (error) {
    respondError(res, error);
  }
});

swarmRouter.post("/init", async (req, res) => {
  const body = (req.body ?? {}) as { advertiseAddr?: unknown; listenAddr?: unknown };
  try {
    res.json(await initialiseSwarm({ advertiseAddr: asString(body.advertiseAddr), listenAddr: asString(body.listenAddr) }));
  } catch (error) {
    respondError(res, error);
  }
});

swarmRouter.post("/join", async (req, res) => {
  const body = (req.body ?? {}) as { remoteAddrs?: unknown; joinToken?: unknown; advertiseAddr?: unknown; listenAddr?: unknown };
  const remoteAddrs = Array.isArray(body.remoteAddrs) ? body.remoteAddrs.filter((entry): entry is string => typeof entry === "string") : [];
  if (remoteAddrs.length === 0) {
    res.status(400).json({ error: "At least one manager address is required to join a swarm." });
    return;
  }
  if (typeof body.joinToken !== "string" || body.joinToken.trim() === "") {
    res.status(400).json({ error: "A join token is required to join a swarm." });
    return;
  }
  try {
    res.json(
      await joinSwarm({
        remoteAddrs,
        joinToken: body.joinToken,
        advertiseAddr: asString(body.advertiseAddr),
        listenAddr: asString(body.listenAddr),
      }),
    );
  } catch (error) {
    respondError(res, error);
  }
});

swarmRouter.post("/leave", async (req, res) => {
  const force = (req.body as { force?: unknown } | undefined)?.force === true;
  try {
    res.json(await leaveSwarm(force));
  } catch (error) {
    respondError(res, error);
  }
});

swarmRouter.get("/tokens", async (_req, res) => {
  try {
    res.json(await getJoinTokens());
  } catch (error) {
    respondError(res, error);
  }
});

swarmRouter.post("/tokens/rotate", async (req, res) => {
  const target = (req.body as { target?: unknown } | undefined)?.target;
  if (target !== "worker" && target !== "manager") {
    res.status(400).json({ error: "A 'target' of 'worker' or 'manager' is required" });
    return;
  }
  try {
    res.json(await rotateJoinToken(target));
  } catch (error) {
    respondError(res, error);
  }
});

swarmRouter.get("/nodes", async (_req, res) => {
  try {
    res.json(await listNodes());
  } catch (error) {
    respondError(res, error);
  }
});

swarmRouter.post("/nodes/:id/update", async (req, res) => {
  const body = (req.body ?? {}) as { role?: unknown; availability?: unknown };
  if (body.role !== undefined && !NODE_ROLES.includes(body.role as SwarmNodeRole)) {
    res.status(400).json({ error: "A 'role' must be 'manager' or 'worker'" });
    return;
  }
  if (body.availability !== undefined && !NODE_AVAILABILITIES.includes(body.availability as SwarmNodeAvailability)) {
    res.status(400).json({ error: "An 'availability' must be 'active', 'pause' or 'drain'" });
    return;
  }
  try {
    res.json(await updateNode(req.params.id, { role: body.role as SwarmNodeRole | undefined, availability: body.availability as SwarmNodeAvailability | undefined }));
  } catch (error) {
    respondError(res, error);
  }
});

swarmRouter.delete("/nodes/:id", async (req, res) => {
  try {
    await removeNode(req.params.id, req.query.force === "true");
    res.status(204).end();
  } catch (error) {
    respondError(res, error);
  }
});

swarmRouter.get("/services", async (_req, res) => {
  try {
    res.json(await listServices());
  } catch (error) {
    respondError(res, error);
  }
});

swarmRouter.post("/services", async (req, res) => {
  const body = (req.body ?? {}) as { name?: unknown; image?: unknown; mode?: unknown; replicas?: unknown; env?: unknown; ports?: unknown; labels?: unknown };
  if (typeof body.name !== "string" || body.name.trim() === "") {
    res.status(400).json({ error: "A 'name' string is required" });
    return;
  }
  if (typeof body.image !== "string" || body.image.trim() === "") {
    res.status(400).json({ error: "An 'image' string is required" });
    return;
  }
  if (body.mode !== undefined && body.mode !== "replicated" && body.mode !== "global") {
    res.status(400).json({ error: "A 'mode' must be 'replicated' or 'global'" });
    return;
  }
  try {
    res.json(
      await createService({
        name: body.name,
        image: body.image,
        mode: (body.mode as SwarmServiceMode | undefined) ?? "replicated",
        replicas: asCount(body.replicas),
        env: asStringList(body.env),
        ports: asPorts(body.ports),
        labels: asLabels(body.labels),
      }),
    );
  } catch (error) {
    respondError(res, error);
  }
});

swarmRouter.get("/services/:id", async (req, res) => {
  try {
    res.json(await getServiceDetail(req.params.id));
  } catch (error) {
    respondError(res, error);
  }
});

swarmRouter.post("/services/:id/update", async (req, res) => {
  const body = (req.body ?? {}) as { image?: unknown; replicas?: unknown; env?: unknown; ports?: unknown };
  try {
    res.json(
      await updateService(req.params.id, {
        image: asString(body.image),
        replicas: asCount(body.replicas),
        env: asStringList(body.env),
        ports: asPorts(body.ports),
      }),
    );
  } catch (error) {
    respondError(res, error);
  }
});

swarmRouter.delete("/services/:id", async (req, res) => {
  try {
    await removeService(req.params.id);
    res.status(204).end();
  } catch (error) {
    respondError(res, error);
  }
});

swarmRouter.get("/stacks", async (_req, res) => {
  try {
    res.json(await listStacks());
  } catch (error) {
    respondError(res, error);
  }
});

swarmRouter.delete("/stacks/:name", async (req, res) => {
  try {
    res.json(await removeStack(req.params.name));
  } catch (error) {
    respondError(res, error);
  }
});

registerSwarmDataRoutes("secret", "/secrets");
registerSwarmDataRoutes("config", "/configs");

/**
 * Secrets and configs are the same four operations over two collections; the
 * value they accept never comes back out of any of them (REQ-84).
 */
function registerSwarmDataRoutes(kind: SwarmDataKind, base: string): void {
  swarmRouter.get(base, async (_req, res) => {
    try {
      res.json(await listSwarmData(kind));
    } catch (error) {
      respondError(res, error);
    }
  });

  swarmRouter.post(base, async (req, res) => {
    const body = (req.body ?? {}) as { name?: unknown; value?: unknown; labels?: unknown };
    if (typeof body.name !== "string" || body.name.trim() === "") {
      res.status(400).json({ error: "A 'name' string is required" });
      return;
    }
    if (typeof body.value !== "string" || body.value === "") {
      res.status(400).json({ error: "A 'value' string is required" });
      return;
    }
    try {
      res.json(await createSwarmData(kind, { name: body.name, value: body.value, labels: asLabels(body.labels) }));
    } catch (error) {
      respondError(res, error);
    }
  });

  swarmRouter.get(`${base}/:id`, async (req, res) => {
    try {
      res.json(await getSwarmDataMetadata(kind, req.params.id));
    } catch (error) {
      respondError(res, error);
    }
  });

  swarmRouter.delete(`${base}/:id`, async (req, res) => {
    try {
      await removeSwarmData(kind, req.params.id);
      res.status(204).end();
    } catch (error) {
      respondError(res, error);
    }
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function asCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === "string");
}

function asLabels(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const labels: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") labels[key] = entry;
  }
  return labels;
}

function asPorts(value: unknown): SwarmServicePort[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry) => ({
      published: typeof entry.published === "number" ? entry.published : undefined,
      target: typeof entry.target === "number" ? entry.target : 0,
      protocol: typeof entry.protocol === "string" && entry.protocol !== "" ? entry.protocol : "tcp",
    }))
    .filter((port) => port.target > 0);
}

function respondError(res: Response, error: unknown): void {
  if (error instanceof DockerDaemonError) {
    res.status(error.statusCode ?? 502).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: (error as Error).message });
}
