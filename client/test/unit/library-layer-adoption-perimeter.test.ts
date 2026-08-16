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
 * rather than bounded, exactly as the retired list component's call-site budget was:
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
 * - batch 9 — contexts (`REQ-42` … `REQ-45`)
 * - batch 10 — plugins (`REQ-46` … `REQ-48`)
 * - batch 11 — compose (`REQ-49` … `REQ-51`)
 * - batch 12 — swarm (`REQ-52` … `REQ-56`)
 * - batch 13 — images and layers: the detail panel takes the primitive's own property grid
 *   (`REQ-61`) and the efficiency view's three lists take the object list, which is what let the
 *   retired list component be deleted (`REQ-82`)
 */
const MIGRATED_FILES = [
  'src/builders/BuildersScreen.tsx',
  'src/compose/ComposeScreen.tsx',
  'src/contexts/ContextsScreen.tsx',
  'src/images/ImageDetailPanel.tsx',
  'src/images/LayerEfficiencyView.tsx',
  'src/plugins/PluginsScreen.tsx',
  'src/registries/RegistriesScreen.tsx',
  'src/swarm/SwarmConfigsStacksPanel.tsx',
  'src/swarm/SwarmNodesPanel.tsx',
  'src/swarm/SwarmSecretsPanel.tsx',
  'src/swarm/SwarmServicesPanel.tsx',
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
  /**
   * The pin over the retired presentation stood here until 2026-08-16, and it was **removed with the
   * prop it counted**, not left asserting an empty list
   * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-22`, `REQ-28`;
   * the same programme retired the previous list component's call-site budget the same way, for the
   * same reason). It counted the feature files stating `variant='comfortable'`, narrowing batch by
   * batch as the conversions landed, and reached zero at batch 4. Batch 5 removed the prop from the
   * component's public interface, so what is left to count is a name nothing declares — an
   * expectation of `[]` against a prop that cannot be written is not a guard, and the guard that
   * replaces it is the conformance script's own third pass, which refuses the presentation by name
   * anywhere under `src/` and `scripts/` (that plan's REQ-23, `ui-conformance-check.md`).
   */

  // data-table.md — the always-present row content: the networks list carries its attached-container
  // chips there, the repositories list its tag chips, and the compose list the nested header-less
  // list of a project's services — which is the composition `GroupedRowsPanel` was retired against
  // (`REQ-49`), so it is stated here rather than answered by a component of its own.
  //
  // The four are unchanged by the classic-table conversion, and that is the point of them: the slot
  // is **conditional on nothing** since `.../classic-table/REQ-6`, so all four supply it while
  // asking for no presentation at all — the chips of the first two exactly as before, and the
  // nested lists of the last two now stating `nested`, which is a property of the child list and
  // not a presentation of the parent.
  it('has row content rendered by the networks list, the repositories list, the compose list and the stacks list', () => {
    expect(featureCallSites(/renderRowContent[=:]/)).toEqual([
      'src/compose/ComposeScreen.tsx',
      'src/registries/RegistriesScreen.tsx',
      'src/swarm/SwarmConfigsStacksPanel.tsx',
      'src/volumes-networks/NetworksPanel.tsx',
    ]);
  });

  /**
   * section-header.md — the same-baseline sublabel, which **no screen consumes and none is now
   * expected to**.
   *
   * This expectation was written awaiting "the swarm bottom row" as its first consumer, on the
   * premise that `Configs & stacks` carried a `CONFIGS` sublabel its neighbour `Secrets` did not.
   * Batch 12 established there never was one — `sublabel` appears nowhere in `src/` outside the
   * library, before the migration or after it — and that the 25.4px offset REQ-54 measured came from
   * a `SectionHeader variant="eyebrow"` **inside the card body**, which is what a single card
   * holding two inventories needed. Two cards, one per inventory, remove the cause; the sublabel had
   * nothing to repair. So the empty list below is a **fact about the tree**, not a debt awaiting a
   * first consumer, and the primitive's own guarantee stays covered by its unit test.
   */
  it('has no screen supplying a header sublabel', () => {
    expect(featureCallSites(/\bsublabel[=:]/)).toEqual([]);
  });

  // detail-panel.md — properties as a structural prop rather than a hand-built grid; the
  // build-cache record's panel is the third (builders-screen.md, REQ-39), the context's the fourth,
  // where it is the route out of the endpoint the row truncates (REQ-21, REQ-42), the daemon
  // plugin's inspection the fifth (plugins-screen.md, REQ-46), the compose project's the sixth
  // (compose-screen.md, REQ-50), swarm's four panels the last of the list migrations (REQ-55) and
  // the image detail panel the last of all (REQ-61)
  it('has the panel properties stated through the new props by the migrated panels', () => {
    const panelsWithProperties = [
      'src/builders/BuildersScreen.tsx',
      'src/compose/ComposeScreen.tsx',
      'src/contexts/ContextsScreen.tsx',
      'src/images/ImageDetailPanel.tsx',
      'src/plugins/PluginsScreen.tsx',
      'src/swarm/SwarmConfigsStacksPanel.tsx',
      'src/swarm/SwarmNodesPanel.tsx',
      'src/swarm/SwarmSecretsPanel.tsx',
      'src/swarm/SwarmServicesPanel.tsx',
      'src/volumes-networks/NetworksPanel.tsx',
      'src/volumes-networks/VolumesPanel.tsx',
    ];
    expect(featureCallSites(/\bproperties=\{/)).toEqual(panelsWithProperties);
    // The image panel is the one that states **no** content class: its properties take the default
    // short scalar, which is how the certified column rule resolves exactly as it did
    // (plan-docker_management_app-detail_property_columns, `image-detail-panel.md`).
    expect(featureCallSites(/\bpropertiesContentClass=/)).toEqual(panelsWithProperties.filter((file) => file !== 'src/images/ImageDetailPanel.tsx'));
  });

  // action-button-group.md — an action's weight is the only thing a caller says about it. The
  // registries screen states one because logging in weighs more than logging out (REQ-36); the
  // builders screen because switching the active builder is an action and removing one is
  // destructive (REQ-27, REQ-39); the contexts screen because the switch is the most consequential
  // click on it and must not read as the statement beside it (REQ-43); the plugins screen because
  // removing a daemon plugin takes its data with it (REQ-46, plugins-screen.md); the compose screen
  // because bringing a stack down removes every container of it while bringing it up does not
  // (REQ-49, compose-screen.md); and each swarm panel because removing a node, a service, a secret,
  // a config or a stack is destructive (REQ-55).
  it('has an action weight declared by the migrated screens', () => {
    expect(featureCallSites(/\bweight\s*[:=]/)).toEqual([
      'src/builders/BuildersScreen.tsx',
      'src/compose/ComposeScreen.tsx',
      'src/contexts/ContextsScreen.tsx',
      'src/plugins/PluginsScreen.tsx',
      'src/registries/RegistriesScreen.tsx',
      'src/swarm/SwarmConfigsStacksPanel.tsx',
      'src/swarm/SwarmNodesPanel.tsx',
      'src/swarm/SwarmSecretsPanel.tsx',
      'src/swarm/SwarmServicesPanel.tsx',
      'src/volumes-networks/NetworksPanel.tsx',
      'src/volumes-networks/VolumesPanel.tsx',
    ]);
  });

  // The pin above is only as good as the perimeter it is written against: every call site of every
  // new prop lies in a file this plan has migrated, so no screen can have acquired one quietly. The
  // perimeter is **not** narrowed by the classic-table conversion — a converted screen goes on
  // stating its row content, its panel properties and its action weights; what it stopped stating is
  // the presentation, which no longer exists to state.
  it('states every new prop inside the migrated perimeter and nowhere outside it', () => {
    const everyNewProp =
      /renderRowContent[=:]|\bsublabel[=:]|\bproperties=\{|\bpropertiesContentClass=|\bweight\s*[:=]/;

    expect(featureCallSites(everyNewProp).filter((file) => !MIGRATED_FILES.includes(file))).toEqual([]);
  });
});

/**
 * **Content-sized rows, pinned per file with the reason on the spot**
 * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-23`, `REQ-39`,
 * added by that plan's 2026-08-16 amendment).
 *
 * REQ-39 states equality with the reference lists — containers and images — as a measurement, and
 * one half of it can be settled from the tree instead: **a converted list does not buy itself a
 * taller row**. `autoRowHeight` is how it would, and the reference's own two-line cell (a title over
 * a monospace subtitle) sits unclipped inside the reference's fixed row, so a second line is not a
 * reason to state it.
 *
 * It cannot be a blanket ban — the library documents the prop for a reference table whose cells
 * carry wrapping text — so it is a **pinned list with a reason per entry**, failing in both
 * directions: when a list acquires the prop, and when a new legitimate case lands without this file
 * being widened in the same commit. What it deliberately does **not** try to settle is the other
 * half of REQ-39, the surface a list sits in: that is an AST question across files, defeated by a
 * list rendered through a helper, and a static check that silently passes on a screen it could not
 * read is the failure this plan exists to close. That half is geometry, and it is measured in the
 * browser (`e2e/classic-table-criteria-layer-efficiency.spec.ts`, `e2e/classic-table-sweep.spec.ts`).
 */
describe('content-sized rows are stated only where the library documents the case for them (REQ-39)', () => {
  const CONTENT_SIZED_ROW_CALL_SITES = [
    // The coverage matrix is a reference table, not an inventory: its cells carry the text of a
    // requirement and of the checks that cover it — sentences, wrapping over several lines — which
    // is the case `autoRowHeight` was added for (`plan-docker_management_app/REQ-105`).
    'src/coverage/CoverageMatrixScreen.tsx',
  ];

  it('has the prop stated by the pinned files and by no object list', () => {
    expect(featureCallSites(/\bautoRowHeight\b/)).toEqual(CONTENT_SIZED_ROW_CALL_SITES);
  });

  // …and the pin is over something that exists: with the prop gone from the library, the expectation
  // above would be a list of files stating a name nothing declares, passing while checking nothing.
  it('pins a prop the library still offers', () => {
    const dataTable = readFileSync(join(clientRoot, 'src', 'ui', 'data', 'DataTable.tsx'), 'utf8');
    expect(dataTable, 'the library no longer offers content-sized rows, so the pin above asserts nothing').toMatch(
      /autoRowHeight\?: boolean/,
    );
  });
});
