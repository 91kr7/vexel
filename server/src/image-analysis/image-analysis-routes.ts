import { Router, type Request, type Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import { computeImageChangesets } from "./changeset-service.js";
import { getImageLayerStack } from "./layer-metadata-service.js";
import { getSharedLayerImages } from "./shared-layer-service.js";

export const imageAnalysisRouter = Router();

imageAnalysisRouter.get("/:id/layers", async (req, res) => {
  try {
    const stack = await getImageLayerStack(req.params.id);
    const diffIds = stack.layers.map((layer) => layer.diffId).filter((value): value is string => Boolean(value));
    const sharing = await getSharedLayerImages(req.params.id, diffIds);
    const layers = stack.layers.map((layer) => ({
      ...layer,
      sharedWith: layer.diffId ? (sharing[layer.diffId] ?? []) : [],
    }));
    res.json({ imageId: stack.imageId, layers });
  } catch (error) {
    respondError(res, error);
  }
});

/** Cancellable changeset analysis progress stream (REQ-49, REQ-51): reads the cache when available, otherwise exports and analyses the image, cancelling on client disconnect. */
imageAnalysisRouter.get("/:id/changesets/stream", (req, res) =>
  runEventStream(req, res, () =>
    computeImageChangesets(req.params.id, {
      onProgress: (progress) => writeServerSentEvent(res, "progress", progress),
      onError: (message) => endWithError(res, message),
      onEnd: (result) => {
        writeServerSentEvent(res, "result", result);
        endWithEvent(res);
      },
    }),
  ),
);

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

/** Opens an unbuffered SSE response and cancels the upstream analysis as soon as the client disconnects. */
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
