// Container filesystem transport over the Engine API (REQ-43): export streams
// the tarball straight to the HTTP response as a browser download, import
// streams the uploaded tarball body straight into the Engine API — neither
// direction ever buffers the tarball on the server.
import type { IncomingMessage } from "node:http";
import type { Readable } from "node:stream";
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { NdjsonDecoder, sanitizeTarFilename, splitReference } from "../images/image-transfer-service.js";

export interface ContainerExportStream {
  /** The Engine API's raw tarball response; the caller pipes it straight to the HTTP response. */
  response: IncomingMessage;
  suggestedFilename: string;
}

export interface ContainerImportResult {
  id?: string;
  reference?: string;
}

/** Opens `id`'s export stream (REQ-43), `GET /containers/{id}/export`. */
export async function openContainerExportStream(id: string, filenameHint?: string): Promise<ContainerExportStream> {
  const response = await getEngineClient().requestStream(`/containers/${id}/export`);
  return { response, suggestedFilename: sanitizeTarFilename(filenameHint ?? `${id.slice(0, 12)}-filesystem`) };
}

/**
 * Imports an image from an uploaded filesystem tarball body, `POST
 * /images/create?fromSrc=-`, optionally naming the resulting reference and
 * applying Dockerfile-style `changes` (the `docker import` equivalent).
 */
export async function importFilesystemImage(
  body: Readable,
  targetReference: string | undefined,
  changes: string[] | undefined,
  handlers: { onError: (message: string) => void; onEnd: (result: ContainerImportResult) => void },
): Promise<() => void> {
  let stopped = false;

  const query = new URLSearchParams({ fromSrc: "-" });
  if (targetReference) {
    const { repository, tag } = splitReference(targetReference);
    query.set("repo", repository);
    query.set("tag", tag);
  }
  for (const change of changes ?? []) query.append("changes", change);

  const response = await getEngineClient().requestStream(`/images/create?${query.toString()}`, {
    method: "POST",
    headers: { "content-type": "application/x-tar" },
    body,
  });

  const decoder = new NdjsonDecoder();
  let lastStatus: string | undefined;

  response.on("data", (chunk: Buffer) => {
    if (stopped) return;
    decoder.push(chunk, (entry) => {
      if (stopped) return;
      if (typeof entry.error === "string") {
        stopped = true;
        handlers.onError(entry.error);
        return;
      }
      if (typeof entry.status === "string") lastStatus = entry.status;
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
    handlers.onEnd({ id: lastStatus, reference: targetReference });
  });

  return () => {
    if (stopped) return;
    stopped = true;
    body.destroy();
    response.destroy();
  };
}
