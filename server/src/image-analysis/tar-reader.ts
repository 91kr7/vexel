// Minimal reader for POSIX/GNU tar archives (the format `docker save`
// exports): sequential header/data access plus GNU long-name support, and a
// random-access index by entry name. No write path — analysis only reads.
//
// A layer's own content, referenced from the outer export tar, may itself be
// gzip-compressed: verified against a running daemon (Docker Desktop 4.62,
// containerd image store) — `docker save hello-world`'s layer blob starts
// with the gzip magic bytes `1f 8b`. Both shapes occur across image stores,
// so `openEntryContentStream` sniffs and decompresses on the fly rather than
// assuming either one.
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import type { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

export interface TarEntry {
  name: string;
  size: number;
  typeFlag: string;
}

export interface TarEntryLocation {
  offset: number;
  size: number;
}

const BLOCK_SIZE = 512;

class ChunkCursor {
  private iterator: AsyncIterator<Buffer>;
  private buffer = Buffer.alloc(0);
  private ended = false;

  constructor(source: AsyncIterable<Buffer>) {
    this.iterator = source[Symbol.asyncIterator]();
  }

  private async pull(): Promise<boolean> {
    if (this.ended) return false;
    const { value, done } = await this.iterator.next();
    if (done) {
      this.ended = true;
      return false;
    }
    this.buffer = Buffer.concat([this.buffer, value]);
    return true;
  }

  async take(n: number): Promise<Buffer> {
    while (this.buffer.length < n && (await this.pull())) {
      // keep pulling until enough bytes are buffered or the source ends
    }
    const size = Math.min(n, this.buffer.length);
    const result = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    return result;
  }

  async drop(n: number): Promise<void> {
    let remaining = n;
    while (remaining > 0) {
      if (this.buffer.length === 0 && !(await this.pull())) return;
      const dropped = Math.min(remaining, this.buffer.length);
      this.buffer = this.buffer.subarray(dropped);
      remaining -= dropped;
    }
  }
}

function paddedSize(size: number): number {
  return Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
}

function isZeroBlock(block: Buffer): boolean {
  return block.every((byte) => byte === 0);
}

function readCString(buffer: Buffer, start: number, length: number): string {
  const slice = buffer.subarray(start, start + length);
  const nulIndex = slice.indexOf(0);
  return (nulIndex === -1 ? slice : slice.subarray(0, nulIndex)).toString("utf8");
}

function parseHeader(header: Buffer): { name: string; size: number; typeFlag: string; prefix: string } {
  return {
    name: readCString(header, 0, 100),
    size: parseInt(readCString(header, 124, 12).trim() || "0", 8) || 0,
    typeFlag: String.fromCharCode(header[156] ?? 48),
    prefix: readCString(header, 345, 155),
  };
}

/**
 * A tar header's checksum field covers every other header byte (its own 8
 * bytes counted as spaces); bytes that are not a valid tar header at all
 * (e.g. gzip-compressed content fed in raw) fail this check on the very
 * first header, which is exactly when the caller must fail loudly instead of
 * walking on and emitting whatever garbage the bytes happen to parse into.
 */
function assertValidHeaderChecksum(header: Buffer): void {
  const stored = parseInt(readCString(header, 148, 8).trim() || "0", 8);
  let computed = 0;
  for (let i = 0; i < BLOCK_SIZE; i += 1) computed += i >= 148 && i < 156 ? 0x20 : (header[i] ?? 0);
  if (computed !== stored) throw new Error("Not a valid tar archive: header checksum mismatch");
}

/**
 * Walks every entry of `source` in archive order. For each entry, `onEntry`
 * receives its metadata plus `readAll()` (buffers the entry's content) and
 * `skip()` (discards it); the caller must await exactly one of the two
 * before the walk advances, since tar entries are only readable in sequence.
 */
export async function forEachTarEntry(
  source: AsyncIterable<Buffer>,
  onEntry: (entry: TarEntry, readAll: () => Promise<Buffer>, skip: () => Promise<void>) => Promise<void>,
): Promise<void> {
  const cursor = new ChunkCursor(source);
  let pendingLongName: string | undefined;

  for (;;) {
    const header = await cursor.take(BLOCK_SIZE);
    if (header.length < BLOCK_SIZE || isZeroBlock(header)) return;
    assertValidHeaderChecksum(header);

    const { name: rawName, size, typeFlag, prefix } = parseHeader(header);
    const padded = paddedSize(size);

    if (typeFlag === "L") {
      const data = await cursor.take(padded);
      pendingLongName = data.subarray(0, size).toString("utf8").replace(/\0+$/, "");
      continue;
    }

    const name = pendingLongName ?? (prefix ? `${prefix}/${rawName}` : rawName);
    pendingLongName = undefined;

    let consumed = false;
    await onEntry(
      { name, size, typeFlag },
      async () => {
        consumed = true;
        const data = await cursor.take(padded);
        return data.subarray(0, size);
      },
      async () => {
        consumed = true;
        await cursor.drop(padded);
      },
    );
    if (!consumed) await cursor.drop(padded);
  }
}

/** Locates every entry's byte offset/size within a tar file on disk, for later random-access reads. */
export async function indexTarFile(filePath: string): Promise<Map<string, TarEntryLocation>> {
  const handle = await open(filePath, "r");
  try {
    const map = new Map<string, TarEntryLocation>();
    let position = 0;
    let pendingLongName: string | undefined;
    const headerBuffer = Buffer.alloc(BLOCK_SIZE);
    for (;;) {
      const { bytesRead } = await handle.read(headerBuffer, 0, BLOCK_SIZE, position);
      if (bytesRead < BLOCK_SIZE || isZeroBlock(headerBuffer)) return map;
      assertValidHeaderChecksum(headerBuffer);
      position += BLOCK_SIZE;
      const { name: rawName, size, typeFlag, prefix } = parseHeader(headerBuffer);
      const padded = paddedSize(size);
      if (typeFlag === "L") {
        const longNameBuffer = Buffer.alloc(size);
        await handle.read(longNameBuffer, 0, size, position);
        pendingLongName = longNameBuffer.toString("utf8").replace(/\0+$/, "");
        position += padded;
        continue;
      }
      const name = pendingLongName ?? (prefix ? `${prefix}/${rawName}` : rawName);
      pendingLongName = undefined;
      map.set(name, { offset: position, size });
      position += padded;
    }
  } finally {
    await handle.close();
  }
}

/** Reads a located entry's raw bytes at a known offset/size (no header re-parsing needed). */
export async function readTarEntryAt(filePath: string, location: TarEntryLocation): Promise<Buffer> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(location.size);
    await handle.read(buffer, 0, location.size, location.offset);
    return buffer;
  } finally {
    await handle.close();
  }
}

const GZIP_MAGIC_BYTE_0 = 0x1f;
const GZIP_MAGIC_BYTE_1 = 0x8b;

/**
 * Opens a located entry's content for streaming, decompressing on the fly
 * when it is gzip-compressed (sniffed from its first two bytes) and passing
 * it through untouched otherwise — both shapes occur across image stores, so
 * neither is assumed. A truncated entry (fewer than two bytes) is passed
 * through untouched; `forEachTarEntry` fails loudly on it if it is then read
 * as a nested tar.
 */
export async function openEntryContentStream(filePath: string, location: TarEntryLocation): Promise<Readable> {
  const probe = await readTarEntryAt(filePath, { offset: location.offset, size: Math.min(2, location.size) });
  const raw = createReadStream(filePath, { start: location.offset, end: location.offset + location.size - 1 });
  const isGzip = probe.length === 2 && probe[0] === GZIP_MAGIC_BYTE_0 && probe[1] === GZIP_MAGIC_BYTE_1;
  return isGzip ? raw.pipe(createGunzip()) : raw;
}
