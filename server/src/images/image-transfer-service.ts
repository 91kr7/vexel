// Registry-facing image operations over the Engine API (REQ-38, REQ-39): pull
// and push stream per-layer progress, tag/untag/remove/prune are single calls.
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

interface NdjsonEntry {
  id?: string;
  status?: string;
  error?: string;
  progressDetail?: { current?: number; total?: number };
}

/** Docker's pull/push progress stream: one JSON object per line, not framed. */
class NdjsonDecoder {
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

function splitReference(reference: string): { repository: string; tag: string } {
  const digestIndex = reference.indexOf("@");
  if (digestIndex !== -1) return { repository: reference.slice(0, digestIndex), tag: reference.slice(digestIndex + 1) };
  const lastColon = reference.lastIndexOf(":");
  const lastSlash = reference.lastIndexOf("/");
  if (lastColon > lastSlash) return { repository: reference.slice(0, lastColon), tag: reference.slice(lastColon + 1) };
  return { repository: reference, tag: "latest" };
}
