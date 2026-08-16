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
   * data-table.md — `variant='comfortable'` was the object list the nine screens migrated onto from
   * batch 6, and it is **being retired**
   * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table`): every list becomes
   * the one presentation containers and images ship, one batch at a time, and the prop leaves the
   * component's public interface in that plan's batch 5.
   *
   * So this pin now runs the other way: it is the list of screens **not yet converted**, narrowed by
   * the batch that converts the next one. It still fails in both directions — when a screen acquires
   * the presentation, and when a conversion lands without this file being narrowed in the same
   * commit — which is the whole point of pinning it rather than bounding it.
   *
   * - batch 1 — volumes, networks and the registries screen's two lists (`REQ-14`, `REQ-15`)
   * - batch 2 — the plain lists: builders & build cache, contexts, both plugin lists, and swarm's
   *   nodes, services (with the nested tasks list) and secrets (`REQ-16`, `REQ-17`, `REQ-18`,
   *   `REQ-20` in part — swarm's configs & stacks carries row content and is batch 3's)
   * - batch 3 — the nested lists: the compose projects list with its per-project services, and
   *   swarm's configs and stacks with the stacks' own services (`REQ-19`, `REQ-20` completed). A
   *   nested list states `nested` rather than a presentation: it is drawn inside its parent's
   *   surface, indented, and takes none of its own.
   * - batch 4 — the last three call sites: the efficiency & signals dialog's wasted files,
   *   duplicated content and flagged paths (`REQ-21`), which carry per-row **expansions** rather
   *   than row content and are the reason this screen has a batch of its own.
   *
   * **The list below is now empty, and it stays until batch 5.** Empty is not the same claim as
   * absent: it says that no feature file asks for the presentation *while the prop still exists*,
   * which is exactly what a regression would break. Batch 5 removes the prop from the component's
   * public interface, and this expectation goes with it in that same commit — as the same programme
   * retired the previous list component's call-site budget once nothing could state it.
   */
  it('has the retired presentation asked for by no feature file at all', () => {
    expect(featureCallSites(/variant=(?:"comfortable"|\{'comfortable'\}|\{"comfortable"\})/)).toEqual([]);
  });

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
  // stating its row content, its panel properties and its action weights; what it stops stating is
  // the presentation, which is pinned on its own above.
  it('states every new prop inside the migrated perimeter and nowhere outside it', () => {
    const everyNewProp =
      /variant=(?:"comfortable"|\{'comfortable'\}|\{"comfortable"\})|renderRowContent[=:]|\bsublabel[=:]|\bproperties=\{|\bpropertiesContentClass=|\bweight\s*[:=]/;

    expect(featureCallSites(everyNewProp).filter((file) => !MIGRATED_FILES.includes(file))).toEqual([]);
  });
});
