// Image listing and inspect over the Engine API (REQ-37, REQ-40).
import { getEngineClient } from "../connectivity/connection-status-service.js";

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
  return Promise.all(raw.map(toSummary));
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
    tags: (raw.RepoTags ?? []).filter((tag) => tag !== NONE_TAG),
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
