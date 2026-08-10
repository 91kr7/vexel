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
import { test as base } from '@playwright/test';
import { E2E_DATA_DIR } from './fixtures.js';
import { emptyStoredNamespaces } from '../../../server/test/support/run-data-dir.js';

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
});

export { expect } from '@playwright/test';
export type { APIResponse, Download, Locator, Page, Request, Response, Route, TestInfo } from '@playwright/test';
