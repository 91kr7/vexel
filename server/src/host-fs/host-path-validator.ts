// Single entry point every feature calls before using an operator-typed host
// path (REQ-116): existence, kind, readability/writability, and refusal of
// traversal or symlink escape outside an allowed root.
import { accessSync, constants, existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, sep } from "node:path";

export type HostPathKind = "file" | "directory";

export interface HostPathValidationRequest {
  path: string;
  kind?: HostPathKind;
  root?: string;
}

export interface HostPathValidationResult {
  valid: boolean;
  reason?: string;
  resolvedPath?: string;
  kind?: HostPathKind;
  readable?: boolean;
  writable?: boolean;
}

export function validateHostPath(request: HostPathValidationRequest): HostPathValidationResult {
  const { path: rawPath, kind, root } = request;

  if (!rawPath || !isAbsolute(rawPath)) {
    return { valid: false, reason: "The path must be an absolute path." };
  }
  if (rawPath.split(/[\\/]+/).includes("..")) {
    return { valid: false, reason: "The path may not contain '..' traversal segments." };
  }
  if (!existsSync(rawPath)) {
    return { valid: false, reason: "The path does not exist." };
  }

  const resolvedPath = realpathSync(rawPath);

  if (root) {
    const resolvedRoot = realpathSync(root);
    const withinRoot = resolvedPath === resolvedRoot || resolvedPath.startsWith(resolvedRoot + sep);
    if (!withinRoot) {
      return { valid: false, reason: "The path resolves outside the allowed root (symlink escape or traversal)." };
    }
  }

  const stats = statSync(resolvedPath);
  const actualKind: HostPathKind = stats.isDirectory() ? "directory" : "file";
  if (kind && kind !== actualKind) {
    return { valid: false, reason: `Expected a ${kind}, found a ${actualKind}.`, resolvedPath, kind: actualKind };
  }

  const readable = isAccessible(resolvedPath, constants.R_OK);
  const writable = isAccessible(resolvedPath, constants.W_OK);
  if (!readable) {
    return { valid: false, reason: "The path is not readable.", resolvedPath, kind: actualKind, readable, writable };
  }

  return { valid: true, resolvedPath, kind: actualKind, readable, writable };
}

function isAccessible(path: string, mode: number): boolean {
  try {
    accessSync(path, mode);
    return true;
  } catch {
    return false;
  }
}
