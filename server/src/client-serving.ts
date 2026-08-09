/*
 * Vexel — Copyright (C) 2026 Christian Mariani
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Licensed under the GNU Affero General Public License v3, supplemented by the
 * additional terms permitted under its section 7 — attribution, marking of modified
 * versions and the project name. See LICENSE and LICENSE-ADDITIONAL-TERMS.md at the
 * repository root.
 */
// Serves the built interface from the same origin and port as the API: the
// build's static assets, plus the history fallback that answers an ordinary page
// request with the entry document instead of a server "not found".
// REQ ids below belong to plan-docker_management_app-single_process_serving.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

const ENTRY_DOCUMENT = "index.html";

/** Points the server at a build elsewhere on disk, without rebuilding it (REQ-10). */
const DIST_DIR_ENV = "VEXEL_CLIENT_DIST";

const BUILD_COMMAND = "npm run build";

/**
 * `<repo>/client/dist`, resolved from this module's own URL and never from the
 * working directory: the process is started from the repository root
 * (`npm run serve`) and from its own workspace (`npm start -w server`), and only
 * a module-relative path is the same in both. The two `..` are the depth of this
 * file — `server/src/` under `tsx watch`, `server/dist/` under `node` — and have
 * to be kept in step with it if it ever moves deeper.
 */
function defaultDistDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../client/dist");
}

/** Where the built interface is looked for: the override when set, the default otherwise. */
export function resolveClientDistDir(): string {
  const override = process.env[DIST_DIR_ENV];
  return override !== undefined && override.trim() !== "" ? resolve(override) : defaultDistDir();
}

export interface ClientServingOptions {
  /** Overrides both the environment variable and the default location. */
  distDir?: string;
  /** Where the absence of a build is reported; `console.warn` by default. */
  report?: (message: string) => void;
}

/**
 * Mounts the built interface on an existing app. Mount it last, after `/health`
 * and every `/api` route: nothing registered after the history fallback that
 * follows would still be reachable for a page request.
 *
 * Returns whether the interface is being served. A build that is not there is
 * not an error: it is the ordinary state of a fresh checkout and of the
 * development flow, where Vite owns the client (REQ-8). The decision is taken
 * here, once, rather than probed on every request.
 */
export function mountClientApp(app: Express, options: ClientServingOptions = {}): boolean {
  const distDir = options.distDir !== undefined ? resolve(options.distDir) : resolveClientDistDir();
  const report = options.report ?? ((message: string) => console.warn(message));
  const entryDocument = join(distDir, ENTRY_DOCUMENT);

  if (!existsSync(entryDocument)) {
    report(
      `The interface has not been built: no ${ENTRY_DOCUMENT} under ${distDir}. ` +
        `Run "${BUILD_COMMAND}" at the repository root to build it; serving the API only until then.`,
    );
    return false;
  }

  // The entry document is the fallback's business alone, so exactly one handler
  // decides what a page request is answered with.
  app.use(express.static(distDir, { index: false }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (isApiPath(req.path)) {
      next();
      return;
    }
    res.sendFile(entryDocument);
  });

  return true;
}

/** The API's own space, which the fallback never answers for (REQ-4). */
function isApiPath(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}
