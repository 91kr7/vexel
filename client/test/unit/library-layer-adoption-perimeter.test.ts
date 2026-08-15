/**
 * The perimeter of the library layer's adoption
 * (`plan-ui-coherence-optimisation/REQ-30`, `REQ-31`, `REQ-82`).
 *
 * This file succeeds `library-layer-not-yet-adopted.test.ts`, whose premise the
 * first migration retired **by construction**: batch 5 could say "no feature
 * file consumes the new props", batch 6 cannot, because volumes and networks now
 * do. The premise is not dropped with it — what the foundation batch was
 * protecting is that a screen does not acquire the new layer *quietly*, outside
 * the batch that migrates it and states what it deletes in exchange.
 *
 * So the claim becomes: **each new prop is stated only where a migrated screen
 * states it**, and the migrated screens are named. The expectation is pinned
 * rather than bounded, exactly as the `CardList` call-site budget beside it is:
 * it fails when an unmigrated screen acquires a prop, and it fails when a
 * migration lands without this file being widened in the same commit.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const clientRoot = process.cwd();

/**
 * The screens migrated onto the library layer so far, in batch order. One entry
 * per file, widened by the batch that migrates the next screen.
 *
 * - batch 6 — volumes and networks (`REQ-31` … `REQ-35`)
 * - batch 7 — registries (`REQ-36` … `REQ-38`)
 * - batch 8 — builders and build cache (`REQ-39` … `REQ-41`)
 */
const MIGRATED_FILES = [
  'src/builders/BuildersScreen.tsx',
  'src/registries/RegistriesScreen.tsx',
  'src/volumes-networks/NetworksPanel.tsx',
  'src/volumes-networks/VolumesPanel.tsx',
  'src/volumes-networks/VolumesNetworksScreen.tsx',
];

/** Every `.ts`/`.tsx` file of feature code — everything under `src/` except the library itself. */
function featureFiles(directory = join(clientRoot, 'src'), inUi = false): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return featureFiles(path, inUi || entry.name === 'ui');
    if (inUi || !/\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

/** The feature files stating `pattern`, named relative to the client workspace, in a stable order. */
function featureCallSites(pattern: RegExp): string[] {
  return featureFiles()
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => file.slice(clientRoot.length + 1).split('\\').join('/'))
    .sort();
}

describe('the library layer is consumed only by the screens migrated onto it (REQ-30, REQ-31)', () => {
  // data-table.md — `variant='comfortable'` is the object list the nine screens migrate onto, from
  // batch 6; volumes, networks, the registries screen's two lists and the builders screen's two
  // (`REQ-39`) are the ones that have
  it('has the comfortable list asked for by the migrated lists and nowhere else', () => {
    expect(featureCallSites(/variant=(?:"comfortable"|\{'comfortable'\}|\{"comfortable"\})/)).toEqual([
      'src/builders/BuildersScreen.tsx',
      'src/registries/RegistriesScreen.tsx',
      'src/volumes-networks/NetworksPanel.tsx',
      'src/volumes-networks/VolumesPanel.tsx',
    ]);
  });

  // data-table.md — the always-present row content: the networks list carries its attached-container
  // chips there, the repositories list its tag chips
  it('has row content rendered by the networks list and the repositories list', () => {
    expect(featureCallSites(/renderRowContent[=:]/)).toEqual([
      'src/registries/RegistriesScreen.tsx',
      'src/volumes-networks/NetworksPanel.tsx',
    ]);
  });

  // section-header.md — the same-baseline sublabel, whose first consumer is the swarm bottom row: no
  // migrated screen states one yet
  it('has no screen supplying a header sublabel', () => {
    expect(featureCallSites(/\bsublabel[=:]/)).toEqual([]);
  });

  // detail-panel.md — properties as a structural prop rather than a hand-built grid; the
  // build-cache record's panel is the third (builders-screen.md, REQ-39)
  it('has the panel properties stated through the new props by the migrated panels', () => {
    expect(featureCallSites(/\bproperties=\{/)).toEqual([
      'src/builders/BuildersScreen.tsx',
      'src/volumes-networks/NetworksPanel.tsx',
      'src/volumes-networks/VolumesPanel.tsx',
    ]);
    expect(featureCallSites(/\bpropertiesContentClass=/)).toEqual([
      'src/builders/BuildersScreen.tsx',
      'src/volumes-networks/NetworksPanel.tsx',
      'src/volumes-networks/VolumesPanel.tsx',
    ]);
  });

  // action-button-group.md — an action's weight is the only thing a caller says about it. The
  // registries screen states one because logging in weighs more than logging out (REQ-36); the
  // builders screen because switching the active builder is an action and removing one is
  // destructive (REQ-27, REQ-39).
  it('has an action weight declared by the migrated screens', () => {
    expect(featureCallSites(/\bweight\s*[:=]/)).toEqual([
      'src/builders/BuildersScreen.tsx',
      'src/registries/RegistriesScreen.tsx',
      'src/volumes-networks/NetworksPanel.tsx',
      'src/volumes-networks/VolumesPanel.tsx',
    ]);
  });

  // The pin above is only as good as the perimeter it is written against: every call site of every
  // new prop lies in a file this plan has migrated, so no screen can have acquired one quietly.
  it('states every new prop inside the migrated perimeter and nowhere outside it', () => {
    const everyNewProp =
      /variant=(?:"comfortable"|\{'comfortable'\}|\{"comfortable"\})|renderRowContent[=:]|\bsublabel[=:]|\bproperties=\{|\bpropertiesContentClass=|\bweight\s*[:=]/;

    expect(featureCallSites(everyNewProp).filter((file) => !MIGRATED_FILES.includes(file))).toEqual([]);
  });
});
