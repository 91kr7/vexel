/**
 * F5 — the foundation batch adds capability and consumes none of it
 * (`plan-ui-coherence-optimisation/REQ-30`, `REQ-28`).
 *
 * REQ-30's claim is a negative one: with the primitives extended and exported
 * and **nothing yet consuming them**, all thirteen screens render exactly as
 * they did. The measured half of that lives in
 * `client/e2e/library-layer-screens-unmoved.spec.ts`; this is the half that
 * says *why* it can be true — every prop the batch adds is opt-in and has no
 * feature call site, so no screen can have moved through one of them.
 *
 * **This stops being true at the first migration.** Batch 6 is where volumes
 * and networks adopt the object-list primitive and the panel's property grid,
 * and the batch that lands an adoption lowers this file's expectations in the
 * same commit, exactly as it lowers the `CardList` call-site budget beside it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const clientRoot = process.cwd();

/** Every `.ts`/`.tsx` file of feature code — everything under `src/` except the library itself. */
function featureFiles(directory = join(clientRoot, 'src'), inUi = false): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return featureFiles(path, inUi || entry.name === 'ui');
    if (inUi || !/\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

/** The feature files stating `pattern`, named relative to the client workspace. */
function featureCallSites(pattern: RegExp): string[] {
  return featureFiles()
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => file.slice(clientRoot.length + 1));
}

describe('the library layer is added and not yet consumed (REQ-30)', () => {
  // data-table.md — `variant='comfortable'` is the object list the nine screens migrate onto,
  // starting with batch 6; no screen asks for it in this batch
  it('has no screen asking for the comfortable list', () => {
    expect(featureCallSites(/variant=(?:"comfortable"|\{'comfortable'\}|\{"comfortable"\})/)).toEqual([]);
  });

  // data-table.md — the always-present row content, and the grouped list built on it
  it('has no screen rendering row content in a list', () => {
    expect(featureCallSites(/renderRowContent[=:]/)).toEqual([]);
  });

  // section-header.md — the same-baseline sublabel, whose first consumer is the swarm bottom row
  it('has no screen supplying a header sublabel', () => {
    expect(featureCallSites(/\bsublabel[=:]/)).toEqual([]);
  });

  // detail-panel.md — properties as a structural prop rather than a hand-built grid
  it('has no screen stating a panel’s properties through the new prop', () => {
    expect(featureCallSites(/\bproperties=\{/)).toEqual([]);
    expect(featureCallSites(/\bpropertiesContentClass=/)).toEqual([]);
  });

  // action-button-group.md — an action's weight; the delivered call sites still say `destructive`
  it('has no screen declaring an action weight', () => {
    expect(featureCallSites(/\bweight\s*[:=]/)).toEqual([]);
  });
});
