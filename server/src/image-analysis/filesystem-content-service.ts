// File content read from an already-extracted image filesystem (REQ-59):
// text-vs-binary detection with an operator override, and a byte cap so an
// oversized file is truncated rather than fully buffered. Bytes are read at
// a known offset in the cached raw tarball — never by joining an entry's
// name onto a real filesystem path — so containment never depends on this
// service (REQ-62).
import { buildContainedArchiveIndex } from "./filesystem-archive-index.js";
import { getExtractedArchivePath, getExtractedFilesystem, normalizePath } from "./filesystem-extraction-service.js";
import { readTarEntryPrefix } from "./tar-reader.js";

export type FilesystemContentMode = "text" | "hex";

export interface FilesystemContentResult {
  path: string;
  mode: FilesystemContentMode;
  /** The mode auto-detection would have picked, shown by the caller when it differs from `mode` (an operator override). */
  autoMode: FilesystemContentMode;
  content: string;
  totalSizeBytes: number;
  truncated: boolean;
}

export type FilesystemContentOutcome = { result: FilesystemContentResult } | { refusal: string } | undefined;

/** Above this many bytes, a preview is truncated (REQ-59); large enough to preview any typical config/binary header, small enough to stay instant. */
export const MAX_PREVIEW_BYTES = 256 * 1024;
const HEX_ROW_LENGTH = 16;

/**
 * Reads `path`'s content for preview (REQ-59). `undefined` when the image
 * has no cached extraction or the archive is no longer cached (the operator
 * must re-extract); `{ refusal }` when `path` names a directory or a
 * symlink, neither of which has previewable content of its own.
 */
export async function readFilesystemEntryContent(
  imageId: string,
  path: string,
  requestedMode?: FilesystemContentMode,
): Promise<FilesystemContentOutcome> {
  const filesystem = await getExtractedFilesystem(imageId);
  if (!filesystem) return undefined;

  const normalized = normalizePath(path);
  const entry = filesystem.entries.find((candidate) => candidate.path === normalized);
  if (!entry) return undefined;
  if (entry.kind === "directory") return { refusal: "This entry is a directory; select a file to preview its content." };
  if (entry.kind === "symlink") return { refusal: `This entry is a symlink to "${entry.linkTarget}"; it has no content of its own to preview.` };

  const archivePath = getExtractedArchivePath(imageId);
  if (!archivePath) return { refusal: "This image's extracted archive is no longer cached; re-extract the filesystem to preview content." };

  const index = await buildContainedArchiveIndex(archivePath);
  const location = index.get(normalized);
  if (!location) return { refusal: "This entry could not be located in the extracted archive." };

  const buffer = await readTarEntryPrefix(archivePath, location, MAX_PREVIEW_BYTES);
  const autoMode = detectContentMode(buffer);
  const mode = requestedMode ?? autoMode;

  return {
    result: {
      path: normalized,
      mode,
      autoMode,
      content: mode === "text" ? decodeText(buffer) : toHexDump(buffer),
      totalSizeBytes: location.size,
      truncated: buffer.length < location.size,
    },
  };
}

/** Binary when the sampled bytes contain a NUL, or enough non-printable bytes that it plainly is not text. */
function detectContentMode(buffer: Buffer): FilesystemContentMode {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  if (sample.length === 0) return "text";
  let nonPrintable = 0;
  for (const byte of sample) {
    if (byte === 0) return "hex";
    const isPrintable = byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127) || byte >= 160;
    if (!isPrintable) nonPrintable += 1;
  }
  return nonPrintable / sample.length > 0.3 ? "hex" : "text";
}

function decodeText(buffer: Buffer): string {
  return buffer.toString("utf8");
}

/** `xxd`-style dump: 16 bytes per row as an 8-digit hex offset, hex bytes, and their printable-ASCII rendering. */
function toHexDump(buffer: Buffer): string {
  const lines: string[] = [];
  for (let offset = 0; offset < buffer.length; offset += HEX_ROW_LENGTH) {
    const row = buffer.subarray(offset, offset + HEX_ROW_LENGTH);
    const hex = Array.from(row, (byte) => byte.toString(16).padStart(2, "0")).join(" ").padEnd(HEX_ROW_LENGTH * 3 - 1, " ");
    const ascii = Array.from(row, (byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ".")).join("");
    lines.push(`${offset.toString(16).padStart(8, "0")}  ${hex}  |${ascii}|`);
  }
  return lines.join("\n");
}
