/**
 * The `test` every spec in this suite uses, and the one guarantee it adds:
 * **every test starts from a clean application state**, the way it starts with a
 * clean browser.
 *
 * `VEXEL_DATA_DIR` holds everything the application persists — the operator's
 * preferences, the console history, the analysis cache and its index — and one
 * server process serves the whole run, so all of it outlives the spec that wrote
 * it. That is the widest shared state the suite has, and leaving any of it
 * standing breaks the same rule twice over:
 *
 * - **a spec inherits another's state** — the second spec to analyse the same
 *   content is handed the first one's result, and a spec that expects the
 *   default preferences finds settings somebody else chose;
 * - **and a spec stops running the code it exists to drive** — a cache hit skips
 *   the extraction outright. A test that has quietly stopped testing anything is
 *   worse than a slow one, and it is invisible: it passes.
 *
 * Cleared *before* each test and never during: a spec that populates state and
 * then relies on it is contracting exactly that (`filesystem-browser.spec.ts`,
 * "reuses the cached extraction the next time the image is browsed") and owns it
 * for its own duration.
 *
 * Two mechanisms, because the two halves are not equivalent. The analysis cache
 * is emptied **through the server's own endpoint**: it owns the artifacts the
 * index points at and holds an in-process write queue, so it is asked rather
 * than undercut. The remaining namespaces have no such endpoint, and removing
 * their files is a state the store reads correctly by design — it re-reads each
 * one on every call and falls back to the defaults when it is missing (see
 * `server/test/support/run-data-dir.ts`).
 *
 * An **automatic** fixture, so it applies to every test of every spec without
 * one of them having to remember it — which is why specs import `test` from here
 * instead of from `@playwright/test` directly.
 */
import { test as base, type Page } from '@playwright/test';
import { E2E_DATA_DIR } from './fixtures.js';
import { emptyStoredNamespaces } from '../../../server/test/support/run-data-dir.js';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Set by the coverage run alone (plan-test_coverage_code_quality/REQ-3, REQ-17).
const coverageDirectory = process.env.VEXEL_COVERAGE_DIR;
const builtClient = fileURLToPath(new URL('../../dist/', import.meta.url));

// The file the browser actually ran, so the coverage of the bundle can be mapped
// back to `client/src` through the source map beside it.
function servedFrom(url: string): string | null {
  const path = URL.canParse(url) ? join(builtClient, new URL(url).pathname) : null;
  return path && existsSync(path) ? path : null;
}

// Off the coverage run there is no such fixture at all, so no test asks for a
// page it would not otherwise have used.
const browserCoverage = coverageDirectory === undefined ? {} : {
  recordedBrowserCoverage: [
    async ({ page }: { page: Page }, use: () => Promise<void>) => {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      await use();
      const result = (await page.coverage.stopJSCoverage()).flatMap((script) => {
        const path = servedFrom(script.url);
        return path ? [{ scriptId: script.scriptId, url: pathToFileURL(path).href, functions: script.functions }] : [];
      });
      if (result.length === 0) return;
      const directory = join(coverageDirectory, 'e2e-browser');
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, `browser-${randomUUID()}.json`), JSON.stringify({ result }));
    },
    { auto: true },
  ],
};

export const test = base.extend<{ freshApplicationState: void }>({
  freshApplicationState: [
    async ({ baseURL }, use) => {
      const response = await fetch(`${baseURL}/api/persistence/analysis-cache/clear`, { method: 'POST' });
      if (!response.ok) {
        throw new Error(`could not empty the analysis cache before this test: the server answered ${response.status}`);
      }
      emptyStoredNamespaces(E2E_DATA_DIR);
      await use();
    },
    { auto: true },
  ],
  ...browserCoverage,
});

export { expect } from '@playwright/test';
export type { APIResponse, Download, Locator, Page, Request, Response, Route, TestInfo } from '@playwright/test';
