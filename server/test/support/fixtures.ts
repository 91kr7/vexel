import express, { type Express, type Router } from "express";
import type { AddressInfo } from "node:net";
import { ALPINE_IMAGE, ensureImage } from "./base-images.js";
import { execFileAsync } from "./docker-cli.js";
import { OWNER_LABEL, RUN_ID, ownershipArgs } from "./ownership.js";

// The ownership labels live one module down, where `base-images.ts` can reach
// them too, and are re-exported here so every existing caller keeps its single
// import of "the fixtures module".
export { CASE_LABEL, OWNER_LABEL, RUN_ID, ownershipArgs } from "./ownership.js";

/**
 * Small image whose entrypoint the fixtures override, so a container starts
 * instantly and needs no application init. Its presence on the daemon is not
 * assumed: every creator below ensures it first (see `base-images.ts`).
 */
export const BASE_IMAGE = ALPINE_IMAGE;

export interface RunningApp {
  url: string;
  close: () => Promise<void>;
}

/** Mounts a router on a throwaway app bound to an ephemeral port. */
export function startApp(app: Express): Promise<RunningApp> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((closeResolve) => {
            // An SSE response keeps its socket open; force it shut instead of
            // waiting on a graceful close no lingering client ever triggers.
            server.closeAllConnections();
            server.close(() => closeResolve());
          }),
      });
    });
  });
}

/** Builds an app exposing one router under one base path. */
export function buildApp(basePath: string, router: Router): Express {
  const app = express();
  app.use(express.json());
  app.use(basePath, router);
  return app;
}

/** A fixture name carrying the case it belongs to and the run that owns it. */
export function fixtureName(caseName: string): string {
  return `vexel-test-${caseName}-${RUN_ID}`;
}

/**
 * Starts a container that stays alive doing nothing, named and labelled for this
 * run. Returns its id and its name.
 */
export async function createSleepingContainer(
  caseName: string,
  extraArgs: string[] = [],
): Promise<{ id: string; name: string }> {
  const name = fixtureName(caseName);
  // Checked here rather than once per file: a prune spec in this pass prunes the host
  // mid-run, so an image present when the file was loaded may be gone by the
  // time this fixture is created.
  await ensureImage(BASE_IMAGE);
  const { stdout } = await execFileAsync("docker", [
    "run",
    "-d",
    "--name",
    name,
    ...ownershipArgs(caseName),
    ...extraArgs,
    "--entrypoint",
    "sleep",
    BASE_IMAGE,
    "300",
  ]);
  return { id: stdout.trim(), name };
}

/**
 * Starts a container running the given shell script, named and labelled for this
 * run. Returns its id and its name.
 */
export async function createScriptedContainer(
  caseName: string,
  script: string,
  extraArgs: string[] = [],
): Promise<{ id: string; name: string }> {
  const name = fixtureName(caseName);
  await ensureImage(BASE_IMAGE);
  const { stdout } = await execFileAsync("docker", [
    "run",
    "-d",
    "--name",
    name,
    ...ownershipArgs(caseName),
    ...extraArgs,
    "--entrypoint",
    "sh",
    BASE_IMAGE,
    "-c",
    script,
  ]);
  return { id: stdout.trim(), name };
}

export async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["rm", "-fv", name]).catch(() => undefined);
}

export async function removeVolumeQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["volume", "rm", "-f", name]).catch(() => undefined);
}

export async function removeNetworkQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["network", "rm", "-f", name]).catch(() => undefined);
}

export async function removeImageQuietly(reference: string): Promise<void> {
  await execFileAsync("docker", ["rmi", "-f", reference]).catch(() => undefined);
}

/**
 * Removes the containers this run owns. Scoped to the ownership label, so an
 * object the operator created is never a candidate.
 */
export async function sweepOwnFixtures(): Promise<void> {
  const { stdout } = await execFileAsync("docker", [
    "ps",
    "-aq",
    "--filter",
    `label=${OWNER_LABEL}=${RUN_ID}`,
  ]).catch(() => ({ stdout: "" }));
  const ids = stdout.split("\n").filter((id) => id.length > 0);
  if (ids.length === 0) return;
  await execFileAsync("docker", ["rm", "-fv", ...ids]).catch(() => undefined);
}
