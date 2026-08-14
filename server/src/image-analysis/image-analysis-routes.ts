import { Router, type Request, type Response } from "express";
import { DockerDaemonError } from "../docker/errors.js";
import { computeImageChangesets } from "./changeset-service.js";
import { readFilesystemEntryContent, type FilesystemContentMode } from "./filesystem-content-service.js";
import { resolveRequestPath } from "./filesystem-containment.js";
import { getFilesystemEntryMetadata } from "./filesystem-entry-service.js";
import { getSubtreeExportSummary, openFilesystemEntryDownload, openSubtreeArchiveDownload } from "./filesystem-export-service.js";
import { extractImageFilesystem, getKeptFilesystemExtraction, listImageFilesystemChildren } from "./filesystem-extraction-service.js";
import { compareImageFilesystems, listDiffChildren } from "./image-diff-service.js";
import { searchFilesystemEntries } from "./filesystem-search-service.js";
import { getImageBuildCacheTrace } from "./layer-build-cache-service.js";
import { getImageLayerStack } from "./layer-metadata-service.js";
import { analyzeLayerSignals } from "./layer-signals-service.js";
import { getSharedLayerImages } from "./shared-layer-service.js";
import { sanitizeTarFilename } from "../images/image-transfer-service.js";

export const imageAnalysisRouter = Router();

/** Cancellable cross-image filesystem comparison stream (REQ-63, REQ-64): extracts each side (reusing its cache when already extracted), then compares, cancelling on client disconnect. */
imageAnalysisRouter.get("/diff/stream", (req, res) =>
  runEventStream(req, res, () =>
    compareImageFilesystems(String(req.query.a ?? ""), String(req.query.b ?? ""), {
      onProgress: (progress) => writeServerSentEvent(res, "progress", progress),
      onError: (message) => endWithError(res, message),
      onEnd: (result) => {
        writeServerSentEvent(res, "result", result);
        endWithEvent(res);
      },
    }),
  ),
);

/** Direct children of a path in the last compared pair's diff tree (REQ-63), lazily read one directory level at a time. */
imageAnalysisRouter.get("/diff/entries", (req, res) => {
  const a = String(req.query.a ?? "");
  const b = String(req.query.b ?? "");
  const path = typeof req.query.path === "string" ? req.query.path : undefined;
  const entries = listDiffChildren(a, b, path);
  if (!entries) {
    res.status(404).json({ error: "These two images have not been compared yet." });
    return;
  }
  res.json({ path: path ?? "", entries });
});

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

/** Each layer of the image paired with the build-cache record behind it, or with the reason that association does not exist (REQ-68). */
imageAnalysisRouter.get("/:id/layers/build-cache", async (req, res) => {
  try {
    res.json(await getImageBuildCacheTrace(req.params.id));
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

/** Cancellable layer-efficiency and secret-signal analysis progress stream (REQ-65–67): shares the changeset job/cache of `/changesets/stream` (REQ-49), reporting the same progress and then the derived waste, duplicate-content and secret-pattern findings, cancelling on client disconnect. */
imageAnalysisRouter.get("/:id/signals/stream", (req, res) =>
  runEventStream(req, res, () =>
    analyzeLayerSignals(req.params.id, {
      onProgress: (progress) => writeServerSentEvent(res, "progress", progress),
      onError: (message) => endWithError(res, message),
      onEnd: (result) => {
        writeServerSentEvent(res, "result", result);
        endWithEvent(res);
      },
    }),
  ),
);

/** Cancellable filesystem extraction stream (REQ-52–56, REQ-113): serves the analysis cache when available (or `force=true` bypasses it), otherwise creates an unstarted container, exports it and indexes it, cancelling — and cleaning up — on client disconnect. */
imageAnalysisRouter.get("/:id/filesystem/stream", (req, res) =>
  runEventStream(req, res, () =>
    extractImageFilesystem(
      req.params.id,
      { force: req.query.force === "true" },
      {
        onProgress: (progress) => writeServerSentEvent(res, "progress", progress),
        onError: (message) => endWithError(res, message),
        onEnd: (result) => {
          writeServerSentEvent(res, "result", result);
          endWithEvent(res);
        },
      },
    ),
  ),
);

/**
 * Whether an extraction result is still kept for this image's content, and its summary when there
 * is one — the free read the browse action's two shapes are decided by
 * (filesystem_browse_direct/REQ-4, REQ-16). A cache lookup and nothing else: no daemon call, no
 * container, no extraction
 * started, nothing written. "Nothing kept" is an answer with a `200`, not a `404`: absence is
 * precisely what the caller is asking about.
 */
imageAnalysisRouter.get("/:id/filesystem/kept", async (req, res) => {
  try {
    const summary = await getKeptFilesystemExtraction(req.params.id);
    res.json(summary ? { kept: true, summary } : { kept: false });
  } catch (error) {
    respondError(res, error);
  }
});

/** Direct children of a path in a previously extracted filesystem (REQ-52), lazily read one directory level at a time. */
imageAnalysisRouter.get("/:id/filesystem/entries", async (req, res) => {
  try {
    const path = typeof req.query.path === "string" ? req.query.path : undefined;
    const entries = await listImageFilesystemChildren(req.params.id, path);
    if (!entries) {
      res.status(404).json({ error: "This image's filesystem has not been extracted yet." });
      return;
    }
    res.json({ path: path ?? "", entries });
  } catch (error) {
    respondError(res, error);
  }
});

/** A previously extracted entry's metadata (REQ-58). */
imageAnalysisRouter.get("/:id/filesystem/metadata", async (req, res) => {
  try {
    const path = requireContainedPath(req, res);
    if (path === undefined) return;
    const metadata = await getFilesystemEntryMetadata(req.params.id, path);
    if (!metadata) {
      res.status(404).json({ error: "No such entry in this image's extracted filesystem." });
      return;
    }
    res.json({ metadata });
  } catch (error) {
    respondError(res, error);
  }
});

/** A file's content, auto-detected text/hex unless `mode` overrides it, truncated past the preview bound (REQ-59). */
imageAnalysisRouter.get("/:id/filesystem/content", async (req, res) => {
  try {
    const path = requireContainedPath(req, res);
    if (path === undefined) return;
    const requestedMode = req.query.mode === "text" || req.query.mode === "hex" ? (req.query.mode as FilesystemContentMode) : undefined;
    const outcome = await readFilesystemEntryContent(req.params.id, path, requestedMode);
    if (!outcome) {
      res.status(404).json({ error: "This image's filesystem has not been extracted yet." });
      return;
    }
    if ("refusal" in outcome) {
      res.status(409).json({ error: outcome.refusal });
      return;
    }
    res.json({ result: outcome.result });
  } catch (error) {
    respondError(res, error);
  }
});

/** Name/path fragment search across the extracted tree, bounded in result count (REQ-60). */
imageAnalysisRouter.get("/:id/filesystem/search", async (req, res) => {
  try {
    const query = typeof req.query.query === "string" ? req.query.query : "";
    const result = await searchFilesystemEntries(req.params.id, query);
    if (!result) {
      res.status(404).json({ error: "This image's filesystem has not been extracted yet." });
      return;
    }
    res.json(result);
  } catch (error) {
    respondError(res, error);
  }
});

/** Preview of what a subtree download would contain, before the operator confirms it (REQ-61). */
imageAnalysisRouter.get("/:id/filesystem/subtree-summary", async (req, res) => {
  try {
    const path = requireContainedPath(req, res);
    if (path === undefined) return;
    const outcome = await getSubtreeExportSummary(req.params.id, path);
    if (!outcome) {
      res.status(404).json({ error: "This image's filesystem has not been extracted yet." });
      return;
    }
    if ("refusal" in outcome) {
      res.status(409).json({ error: outcome.refusal });
      return;
    }
    res.json({ summary: outcome.summary });
  } catch (error) {
    respondError(res, error);
  }
});

/** Streams a single entry's file content straight to the response as a browser download (REQ-61, REQ-62). */
imageAnalysisRouter.get("/:id/filesystem/download", async (req, res) => {
  try {
    const path = requireContainedPath(req, res);
    if (path === undefined) return;
    const outcome = await openFilesystemEntryDownload(req.params.id, path);
    if (!outcome) {
      res.status(404).json({ error: "This image's filesystem has not been extracted yet." });
      return;
    }
    if ("refusal" in outcome) {
      res.status(409).json({ error: outcome.refusal });
      return;
    }
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${sanitizeDownloadFilename(outcome.download.suggestedFilename)}"`);
    req.on("close", () => outcome.download.stream.destroy());
    outcome.download.stream.pipe(res);
  } catch (error) {
    respondError(res, error);
  }
});

/** Streams a subtree as one freshly built tar archive, straight to the response as a browser download (REQ-61, REQ-62). */
imageAnalysisRouter.get("/:id/filesystem/subtree-download", async (req, res) => {
  try {
    const path = requireContainedPath(req, res);
    if (path === undefined) return;
    const outcome = await openSubtreeArchiveDownload(req.params.id, path);
    if (!outcome) {
      res.status(404).json({ error: "This image's filesystem has not been extracted yet." });
      return;
    }
    if ("refusal" in outcome) {
      res.status(409).json({ error: outcome.refusal });
      return;
    }
    res.setHeader("Content-Type", "application/x-tar");
    res.setHeader("Content-Disposition", `attachment; filename="${sanitizeTarFilename(outcome.archive.suggestedFilename)}"`);
    req.on("close", () => outcome.archive.stream.destroy());
    outcome.archive.stream.pipe(res);
  } catch (error) {
    respondError(res, error);
  }
});

/** Validates the `path` query param against the tree before it drives any lookup (REQ-62); answers `400` and returns `undefined` when it escapes. */
function requireContainedPath(req: Request, res: Response): string | undefined {
  const raw = typeof req.query.path === "string" ? req.query.path : "";
  const resolved = resolveRequestPath(raw);
  if ("refusal" in resolved) {
    res.status(400).json({ error: resolved.refusal.reason });
    return undefined;
  }
  return resolved.path;
}

function sanitizeDownloadFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_") || "download";
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
