// Compose file read, validated write-back and on-demand validation (REQ-77,
// REQ-116). The path is never operator-typed: it is one of the project's own
// discovered config files, still run through the batch-3 host-path
// validator before every read or write.
import { readFile, writeFile } from "node:fs/promises";
import { validateHostPath } from "../host-fs/host-path-validator.js";
import { runComposeJson } from "./compose-cli.js";
import { getComposeProject } from "./compose-discovery-service.js";

export interface ComposeFileContent {
  path: string;
  content: string;
}

export type ComposeFileReadResult = { ok: true; files: ComposeFileContent[] } | { ok: false; reason: string };
export type ComposeFileWriteResult = { ok: true } | { ok: false; reason: string };

export interface ComposeValidationResult {
  valid: boolean;
  errors: string[];
  services: string[];
  volumes: string[];
  networks: string[];
}

interface RawComposeConfig {
  services?: Record<string, unknown>;
  volumes?: Record<string, unknown>;
  networks?: Record<string, unknown>;
}

/** Reads every discovered compose file of a project, refusing as soon as one fails validation. */
export async function readComposeFiles(projectName: string): Promise<ComposeFileReadResult> {
  const project = await getComposeProject(projectName);
  if (project.configFiles.length === 0) {
    return { ok: false, reason: "No compose file was discovered for this project." };
  }
  const files: ComposeFileContent[] = [];
  for (const path of project.configFiles) {
    const validation = validateHostPath({ path, kind: "file" });
    if (!validation.valid) return { ok: false, reason: validation.reason ?? "The compose file could not be read." };
    files.push({ path, content: await readFile(validation.resolvedPath ?? path, "utf8") });
  }
  return { ok: true, files };
}

/** Writes back to one of the project's own discovered compose files; refuses any other path. */
export async function writeComposeFile(projectName: string, path: string, content: string): Promise<ComposeFileWriteResult> {
  const project = await getComposeProject(projectName);
  if (!project.configFiles.includes(path)) {
    return { ok: false, reason: "That path is not one of this project's discovered compose files." };
  }
  const validation = validateHostPath({ path, kind: "file" });
  if (!validation.valid) return { ok: false, reason: validation.reason ?? "The compose file could not be written." };
  if (validation.writable === false) return { ok: false, reason: "The path is not writable." };
  await writeFile(validation.resolvedPath ?? path, content, "utf8");
  return { ok: true };
}

/** Asks `docker compose config` to resolve the project's file(s); a non-zero exit means the file is invalid. */
export async function validateComposeFile(projectName: string): Promise<ComposeValidationResult> {
  const project = await getComposeProject(projectName);
  const args = [...project.configFiles.flatMap((file) => ["-f", file]), "-p", projectName, "config", "--format", "json"];
  try {
    const parsed = await runComposeJson<RawComposeConfig>(args);
    return {
      valid: true,
      errors: [],
      services: Object.keys(parsed.services ?? {}),
      volumes: Object.keys(parsed.volumes ?? {}),
      networks: Object.keys(parsed.networks ?? {}),
    };
  } catch (error) {
    return { valid: false, errors: [(error as Error).message], services: [], volumes: [], networks: [] };
  }
}
