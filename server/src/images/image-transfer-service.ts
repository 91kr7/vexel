// Registry-facing image operations over the Engine API (REQ-38, REQ-39): pull
// and push stream per-layer progress, tag/untag/remove/prune are single calls.
// Save/load (REQ-42) stream a tarball straight through the browser: save opens
// the Engine API's own response for the caller to pipe to the HTTP response,
// load pipes the uploaded request body straight into the Engine API — neither
// direction ever buffers the tarball on the server.
import type { IncomingMessage } from "node:http";
import type { Readable } from "node:stream";
import { getEngineClient } from "../connectivity/connection-status-service.js";

export interface ImageTransferStep {
  /** The layer id the step is about, or "overall" for a summary line. */
  id: string;
  status: string;
  currentBytes?: number;
  totalBytes?: number;
}

export interface ImageTransferHandlers {
  onStep: (step: ImageTransferStep) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

export interface PruneResult {
  removedIds: string[];
  reclaimedBytes: number;
}

// Anonymous registry auth: lets pushes to public/already-authenticated
// (credential-helper-backed) registries proceed; the Registries feature area
// (a later batch) is responsible for real per-registry credentials.
const ANONYMOUS_REGISTRY_AUTH = Buffer.from("{}").toString("base64");

export async function pullImage(reference: string, platform: string | undefined, handlers: ImageTransferHandlers): Promise<() => void> {
  const { repository, tag } = splitReference(reference);
  const query = new URLSearchParams({ fromImage: repository, tag });
  if (platform && platform.trim() !== "") query.set("platform", platform.trim());
  return streamTransfer(`/images/create?${query.toString()}`, handlers);
}

export async function pushImage(reference: string, handlers: ImageTransferHandlers): Promise<() => void> {
  const { repository, tag } = splitReference(reference);
  const query = new URLSearchParams({ tag });
  return streamTransfer(`/images/${repository}/push?${query.toString()}`, handlers, { "X-Registry-Auth": ANONYMOUS_REGISTRY_AUTH });
}

export async function tagImage(id: string, newReference: string): Promise<void> {
  const { repository, tag } = splitReference(newReference);
  const query = new URLSearchParams({ repo: repository, tag });
  await getEngineClient().request(`/images/${id}/tag?${query.toString()}`, { method: "POST" });
}

/** Removes just this tag reference; the underlying image (and its other tags, if any) is left alone. */
export async function untagImage(tagReference: string): Promise<void> {
  await getEngineClient().request(`/images/${tagReference}`, { method: "DELETE" });
}

export async function removeImage(id: string): Promise<void> {
  await getEngineClient().request(`/images/${id}?force=true`, { method: "DELETE" });
}

export interface ImageSaveStream {
  /** The Engine API's raw tarball response; the caller pipes it straight to the HTTP response. */
  response: IncomingMessage;
  suggestedFilename: string;
}

export interface ImageLoadResult {
  references: string[];
}

/** Opens the save stream for one or several images (REQ-42), `GET /images/get`. */
export async function openImageSaveStream(references: string[], filenameHint?: string): Promise<ImageSaveStream> {
  const query = new URLSearchParams();
  for (const reference of references) query.append("names", reference);
  const response = await getEngineClient().requestStream(`/images/get?${query.toString()}`);
  return { response, suggestedFilename: sanitizeTarFilename(filenameHint ?? defaultSaveFilename(references)) };
}

/** Loads images from an uploaded tarball body (REQ-42), streamed straight into `POST /images/load`. */
export async function loadImages(
  body: Readable,
  handlers: { onError: (message: string) => void; onEnd: (result: ImageLoadResult) => void },
): Promise<() => void> {
  let stopped = false;
  const response = await getEngineClient().requestStream("/images/load", {
    method: "POST",
    headers: { "content-type": "application/x-tar" },
    body,
  });

  const decoder = new NdjsonDecoder();
  const references: string[] = [];
  response.on("data", (chunk: Buffer) => {
    if (stopped) return;
    decoder.push(chunk, (entry) => {
      if (stopped) return;
      if (typeof entry.error === "string") {
        stopped = true;
        handlers.onError(entry.error);
        return;
      }
      const loaded = typeof entry.stream === "string" ? extractLoadedReference(entry.stream) : undefined;
      if (loaded) references.push(loaded);
    });
  });
  response.on("error", (error: Error) => {
    if (stopped) return;
    stopped = true;
    handlers.onError(error.message);
  });
  response.on("end", () => {
    if (stopped) return;
    stopped = true;
    handlers.onEnd({ references });
  });

  return () => {
    if (stopped) return;
    stopped = true;
    body.destroy();
    response.destroy();
  };
}

/** Extracts a reference from one of the daemon's "Loaded image: <ref>" load status lines. */
function extractLoadedReference(streamLine: string): string | undefined {
  const match = /Loaded image(?: ID)?:\s*(\S+)/.exec(streamLine);
  return match?.[1];
}

function defaultSaveFilename(references: string[]): string {
  return references.length === 1 ? references[0] : `${references.length}-images`;
}

/** Turns a client-suggested or reference-derived name into a safe `.tar` file name for `Content-Disposition`. */
export function sanitizeTarFilename(hint: string): string {
  const base = hint.replace(/\.tar$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `${base || "download"}.tar`;
}

export async function pruneDanglingImages(): Promise<PruneResult> {
  const filters = encodeURIComponent(JSON.stringify({ dangling: ["true"] }));
  const response = await getEngineClient().request(`/images/prune?filters=${filters}`, { method: "POST" });
  const payload = JSON.parse(response.body) as { ImagesDeleted?: { Deleted?: string; Untagged?: string }[]; SpaceReclaimed?: number };
  const removedIds = (payload.ImagesDeleted ?? []).map((entry) => entry.Deleted ?? entry.Untagged ?? "").filter(Boolean);
  return { removedIds, reclaimedBytes: payload.SpaceReclaimed ?? 0 };
}

async function streamTransfer(path: string, handlers: ImageTransferHandlers, headers?: Record<string, string>): Promise<() => void> {
  const response = await getEngineClient().requestStream(path, { method: "POST", headers });
  // Guards every termination path (cancel, a daemon-reported error, a stream
  // error, or a clean end) so no handler ever fires again once one of them has
  // — in particular, no `onStep` after `onError`.
  let stopped = false;
  const decoder = new NdjsonDecoder();

  response.on("data", (chunk: Buffer) => {
    if (stopped) return;
    decoder.push(chunk, (entry) => {
      if (stopped) return;
      if (typeof entry.error === "string") {
        stopped = true;
        handlers.onError(entry.error);
        return;
      }
      handlers.onStep({
        id: entry.id ?? "overall",
        status: entry.status ?? "",
        currentBytes: entry.progressDetail?.current,
        totalBytes: entry.progressDetail?.total,
      });
    });
  });
  response.on("error", (error: Error) => {
    if (stopped) return;
    stopped = true;
    handlers.onError(error.message);
  });
  response.on("end", () => {
    if (stopped) return;
    stopped = true;
    handlers.onEnd();
  });

  return () => {
    if (stopped) return;
    stopped = true;
    response.destroy();
  };
}

export interface NdjsonEntry {
  id?: string;
  status?: string;
  error?: string;
  /** The daemon's own progress/status line, e.g. an `/images/load` "Loaded image: …" line. */
  stream?: string;
  progressDetail?: { current?: number; total?: number };
}

/** Docker's pull/push/load/import status stream: one JSON object per line, not framed. */
export class NdjsonDecoder {
  private pending = "";

  push(chunk: Buffer, emit: (entry: NdjsonEntry) => void): void {
    this.pending += chunk.toString("utf8");
    const lines = this.pending.split("\n");
    this.pending = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        emit(JSON.parse(trimmed) as NdjsonEntry);
      } catch {
        // malformed/partial line: skip it rather than fail the whole transfer
      }
    }
  }
}

export function splitReference(reference: string): { repository: string; tag: string } {
  const digestIndex = reference.indexOf("@");
  if (digestIndex !== -1) return { repository: reference.slice(0, digestIndex), tag: reference.slice(digestIndex + 1) };
  const lastColon = reference.lastIndexOf(":");
  const lastSlash = reference.lastIndexOf("/");
  if (lastColon > lastSlash) return { repository: reference.slice(0, lastColon), tag: reference.slice(lastColon + 1) };
  return { repository: reference, tag: "latest" };
}
