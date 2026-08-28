import { Router, type Request, type Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import {
  loadImages,
  openImageSaveStream,
  pruneDanglingImages,
  pullImage,
  pushImage,
  removeImage,
  sanitizeTarFilename,
  tagImage,
  untagImage,
} from "./image-transfer-service.js";
import { sendHeld } from "../refresh-cache/refresh-cache-response.js";
import { getImageInspect, imageListCache } from "./images-service.js";

export const imagesRouter = Router();

/** Answered from the value the refresh cache holds (REQ-9); only a listing never read before waits for the daemon. */
imagesRouter.get("/", async (_req, res) => {
  try {
    sendHeld(res, await imageListCache.read());
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

/**
 * Saves one or several images as a tarball streamed straight to the HTTP
 * response as a browser download (REQ-42): no whole tarball ever sits in
 * server memory or on its filesystem. `filename` is an optional client
 * suggestion (e.g. the reference or "N-images"), sanitized either way.
 */
imagesRouter.get("/save", async (req, res) => {
  try {
    const references = readStringListQuery(req.query.references).filter((value) => value.trim() !== "");
    if (references.length === 0) {
      res.status(400).json({ error: "At least one reference is required" });
      return;
    }
    const filenameHint = typeof req.query.filename === "string" ? req.query.filename : undefined;
    const { response, suggestedFilename } = await openImageSaveStream(references, filenameHint);
    res.setHeader("Content-Type", "application/x-tar");
    res.setHeader("Content-Disposition", `attachment; filename="${sanitizeTarFilename(suggestedFilename)}"`);
    req.on("close", () => response.destroy());
    response.on("error", () => res.destroy());
    response.pipe(res);
  } catch (error) {
    respondError(res, error);
  }
});

/**
 * Loads images from an uploaded tarball request body (REQ-42): the body
 * streams straight into the Engine API, never buffered whole. Responds once
 * the daemon reports completion, carrying the references loaded.
 */
imagesRouter.post("/load", async (req, res) => {
  let cancel: (() => void) | undefined;
  let closed = false;
  let responded = false;
  // Bound to the response, not the request: the upload body finishes arriving
  // (and `req` closes) well before the daemon answers, so a `req`-bound
  // listener would cancel a still-legitimately-running load. `res` only
  // closes early like this on a genuine client disconnect; `responded` guards
  // the normal case where it closes afterwards (e.g. on keep-alive teardown).
  res.on("close", () => {
    if (responded) return;
    closed = true;
    cancel?.();
  });

  try {
    const result = await new Promise<{ references: string[] }>((resolve, reject) => {
      loadImages(req, {
        onError: (message) => reject(new Error(message)),
        onEnd: resolve,
      })
        .then((c) => {
          cancel = c;
          if (closed) cancel();
        })
        .catch(reject);
    });
    responded = true;
    res.json(result);
  } catch (error) {
    responded = true;
    if (closed) return;
    respondError(res, error);
  }
});

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

function readStringListQuery(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  return typeof value === "string" ? [value] : [];
}

function writeServerSentEvent(res: Response, event: string, payload: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function endWithEvent(res: Response, payload: unknown = {}): void {
  writeServerSentEvent(res, "end", payload);
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
