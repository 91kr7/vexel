// Image listing and inspect over the Engine API (REQ-37, REQ-40).
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { byNamedThenUnnamedNewest, byNameThenIdentity, type NameKey } from "../list-order/list-order.js";

export interface ImageSummary {
  id: string;
  shortId: string;
  /** Repository:tag references; empty for a dangling (untagged) image. */
  tags: string[];
  digest?: string;
  /** `os/architecture[/variant]`; empty when the daemon does not report it for this image. */
  platforms: string[];
  sizeBytes: number;
  createdAt: string;
}

export interface ImageHistoryEntry {
  createdAt: string;
  createdBy: string;
  sizeBytes: number;
  comment?: string;
  emptyLayer: boolean;
}

export interface ImageInspect {
  id: string;
  tags: string[];
  digest?: string;
  platforms: string[];
  sizeBytes: number;
  createdAt: string;
  entrypoint: string[];
  command: string[];
  env: string[];
  labels: Record<string, string>;
  exposedPorts: string[];
  history: ImageHistoryEntry[];
  /** The full payload exactly as received from the Engine API. */
  raw: unknown;
}

interface RawImageSummary {
  Id: string;
  RepoTags?: string[];
  RepoDigests?: string[];
  Created: number;
  Size: number;
}

interface RawImageInspect {
  Id: string;
  RepoTags?: string[];
  RepoDigests?: string[];
  Created: string;
  Size: number;
  Os?: string;
  Architecture?: string;
  Variant?: string;
  Config?: {
    Entrypoint?: string[] | null;
    Cmd?: string[] | null;
    Env?: string[];
    Labels?: Record<string, string>;
    ExposedPorts?: Record<string, object>;
  };
}

interface RawHistoryEntry {
  Created: number;
  CreatedBy: string;
  Size: number;
  Comment?: string;
}

const NONE_TAG = "<none>:<none>";

export async function listImages(): Promise<ImageSummary[]> {
  const response = await getEngineClient().request("/images/json?all=false");
  const raw = JSON.parse(response.body) as RawImageSummary[];
  const rows = await Promise.all(
    raw.map(async (image) => {
      const summary = await toSummary(image);
      return { summary, sortName: sortNameOf(summary, image) };
    }),
  );
  return rows
    .sort(
      byNamedThenUnnamedNewest({
        name: (row) => row.sortName,
        createdAt: (row) => row.summary.createdAt,
        identity: (row) => row.summary.id,
      }),
    )
    .map((row) => row.summary);
}

/**
 * The key an image is placed by: its lowest tag (repository, then tag), never
 * the first tag the daemon happened to return. An image with no tag but a
 * digest reference is placed under that reference's repository — read from the
 * daemon's own `RepoDigests`, the emitted `digest` field having already dropped
 * it. `null` marks a genuinely dangling image, which is grouped last.
 */
function sortNameOf(summary: ImageSummary, raw: RawImageSummary): NameKey | null {
  const lowestTag = summary.tags[0];
  if (lowestTag !== undefined) return splitReference(lowestTag);
  const repository = lowestDigestRepository(raw.RepoDigests ?? []);
  return repository === undefined ? null : [repository];
}

/** `repository:tag` as its two comparable segments; a reference with no tag keeps an empty one. */
function splitReference(reference: string): [string, string] {
  const separatorIndex = reference.lastIndexOf(":");
  // A registry host may carry a port (`localhost:5000/nginx`), so only a colon
  // after the last path separator introduces a tag.
  if (separatorIndex === -1 || separatorIndex < reference.lastIndexOf("/")) return [reference, ""];
  return [reference.slice(0, separatorIndex), reference.slice(separatorIndex + 1)];
}

/** The repositories of `repo@algorithm:hash` references, ordered; the daemon's own order is not relied on. */
function lowestDigestRepository(digests: string[]): string | undefined {
  return digests
    .map((reference) => {
      const atIndex = reference.indexOf("@");
      return atIndex === -1 ? "" : reference.slice(0, atIndex);
    })
    .filter((repository) => repository !== "" && !repository.startsWith("<none>"))
    .sort(byNameThenIdentity({ name: (repository) => repository, identity: (repository) => repository }))[0];
}

/** A row's own tag list, lowest first: it is what the row displays and what its sort key is taken from. */
function orderReferences(references: string[]): string[] {
  return references.sort(byNameThenIdentity({ name: splitReference, identity: (reference) => reference }));
}

export async function getImageInspect(id: string): Promise<ImageInspect> {
  const client = getEngineClient();
  const inspectResponse = await client.request(`/images/${id}/json`);
  const raw = JSON.parse(inspectResponse.body) as RawImageInspect;
  const historyResponse = await client.request(`/images/${id}/history`);
  const history = JSON.parse(historyResponse.body) as RawHistoryEntry[];
  return toInspect(raw, history);
}

async function toSummary(raw: RawImageSummary): Promise<ImageSummary> {
  return {
    id: raw.Id,
    shortId: shortDigest(raw.Id),
    tags: orderReferences((raw.RepoTags ?? []).filter((tag) => tag !== NONE_TAG)),
    digest: raw.RepoDigests?.[0] ? shortDigest(raw.RepoDigests[0]) : undefined,
    platforms: await resolvePlatforms(raw.Id),
    sizeBytes: raw.Size,
    createdAt: new Date(raw.Created * 1000).toISOString(),
  };
}

/** Best-effort per-image platform lookup; an inspect failure degrades to an empty list rather than failing the whole listing. */
async function resolvePlatforms(id: string): Promise<string[]> {
  try {
    const response = await getEngineClient().request(`/images/${id}/json`);
    const raw = JSON.parse(response.body) as RawImageInspect;
    return raw.Os && raw.Architecture ? [formatPlatform(raw.Os, raw.Architecture, raw.Variant)] : [];
  } catch {
    return [];
  }
}

function toInspect(raw: RawImageInspect, history: RawHistoryEntry[]): ImageInspect {
  const config = raw.Config ?? {};
  return {
    id: raw.Id,
    tags: (raw.RepoTags ?? []).filter((tag) => tag !== NONE_TAG),
    digest: raw.RepoDigests?.[0] ? shortDigest(raw.RepoDigests[0]) : undefined,
    platforms: raw.Os && raw.Architecture ? [formatPlatform(raw.Os, raw.Architecture, raw.Variant)] : [],
    sizeBytes: raw.Size,
    createdAt: raw.Created,
    entrypoint: config.Entrypoint ?? [],
    command: config.Cmd ?? [],
    env: config.Env ?? [],
    labels: config.Labels ?? {},
    exposedPorts: Object.keys(config.ExposedPorts ?? {}),
    history: history.map((entry) => ({
      createdAt: new Date(entry.Created * 1000).toISOString(),
      createdBy: entry.CreatedBy,
      sizeBytes: entry.Size,
      comment: entry.Comment,
      emptyLayer: entry.Size === 0,
    })),
    raw,
  };
}

function formatPlatform(os: string, architecture: string, variant?: string): string {
  return variant ? `${os}/${architecture}/${variant}` : `${os}/${architecture}`;
}

/** `value` is either a bare `algorithm:hash` (an image id) or a `repo@algorithm:hash` (a RepoDigest); only the `algorithm:hash` part is shortened. */
function shortDigest(value: string): string {
  const atIndex = value.indexOf("@");
  const digest = atIndex === -1 ? value : value.slice(atIndex + 1);
  const separatorIndex = digest.indexOf(":");
  if (separatorIndex === -1) return digest.slice(0, 12);
  return `${digest.slice(0, separatorIndex)}:${digest.slice(separatorIndex + 1, separatorIndex + 13)}`;
}
