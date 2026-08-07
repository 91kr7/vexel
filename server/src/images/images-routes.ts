import { Router, type Request, type Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import {
  pruneDanglingImages,
  pullImage,
  pushImage,
  removeImage,
  tagImage,
  untagImage,
} from "./image-transfer-service.js";
import { getImageInspect, listImages } from "./images-service.js";

export const imagesRouter = Router();

imagesRouter.get("/", async (_req, res) => {
  try {
    res.json(await listImages());
  } catch (error) {
    respondError(res, error);
  }
});

imagesRouter.get("/:id/inspect", async (req, res) => {
  try {
    res.json(await getImageInspect(req.params.id));
  } catch (error) {
    respondError(res, error);
  }
});

imagesRouter.get("/pull/stream", (req, res) =>
  runEventStream(req, res, () => {
    const reference = String(req.query.reference ?? "");
    const platform = typeof req.query.platform === "string" ? req.query.platform : undefined;
    return pullImage(reference, platform, {
      onStep: (step) => writeServerSentEvent(res, "step", step),
      onError: (message) => endWithError(res, message),
      onEnd: () => endWithEvent(res),
    });
  }),
);

imagesRouter.get("/:id/push/stream", (req, res) =>
  runEventStream(req, res, () => {
    const reference = typeof req.query.reference === "string" && req.query.reference !== "" ? req.query.reference : req.params.id;
    return pushImage(reference, {
      onStep: (step) => writeServerSentEvent(res, "step", step),
      onError: (message) => endWithError(res, message),
      onEnd: () => endWithEvent(res),
    });
  }),
);

imagesRouter.post("/:id/tag", async (req, res) => {
  const reference = (req.body as { reference?: unknown } | undefined)?.reference;
  if (typeof reference !== "string" || reference.trim() === "") {
    res.status(400).json({ error: "A non-empty reference is required" });
    return;
  }
  try {
    await tagImage(req.params.id, reference.trim());
    res.status(204).end();
  } catch (error) {
    respondError(res, error);
  }
});

imagesRouter.delete("/untag", async (req, res) => {
  const reference = String(req.query.reference ?? "");
  if (reference.trim() === "") {
    res.status(400).json({ error: "A non-empty reference is required" });
    return;
  }
  try {
    await untagImage(reference);
    res.status(204).end();
  } catch (error) {
    respondError(res, error);
  }
});

imagesRouter.delete("/:id", async (req, res) => {
  try {
    await removeImage(req.params.id);
    res.status(204).end();
  } catch (error) {
    respondError(res, error);
  }
});

imagesRouter.post("/prune", async (_req, res) => {
  try {
    const result = await pruneDanglingImages();
    res.json({ removedCount: result.removedIds.length, reclaimedBytes: result.reclaimedBytes });
  } catch (error) {
    respondError(res, error);
  }
});

function writeServerSentEvent(res: Response, event: string, payload: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function endWithEvent(res: Response): void {
  writeServerSentEvent(res, "end", {});
  res.end();
}

function endWithError(res: Response, message: string): void {
  writeServerSentEvent(res, "error", { message });
  res.end();
}

/** Opens an unbuffered SSE response and cancels the upstream stream as soon as the client disconnects. */
async function runEventStream(req: Request, res: Response, open: () => Promise<() => void>): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let cancel: (() => void) | undefined;
  let closed = false;

  req.on("close", () => {
    closed = true;
    cancel?.();
  });

  try {
    cancel = await open();
    if (closed) cancel();
  } catch (error) {
    if (closed) return;
    endWithError(res, (error as Error).message);
  }
}

function respondError(res: Response, error: unknown): void {
  if (error instanceof DockerDaemonError) {
    res.status(error.statusCode ?? 502).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: (error as Error).message });
}
