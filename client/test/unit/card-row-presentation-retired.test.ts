/**
 * **The retirement's closing statement**
 * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-1`,
 * `REQ-5`, `REQ-22`, `REQ-23`, `REQ-28`, `REQ-31`, `REQ-34`).
 *
 * Written in the shape this repository already uses for the previously retired
 * list component (`card-list-deleted.test.ts`): the decision is only as durable
 * as the tree agreeing with it, so what is checked is the tree — the vocabulary,
 * the export, the rules and the compensation the presentation needed.
 *
 * **It pins a list rather than asserting an empty one, and that is the whole
 * correction this file makes to the shape it inherits.** The conformance script
 * names the retired presentation *precisely in order to refuse it* (REQ-23), so
 * "no file names it" is false by construction and a check asserting it would
 * have to be weakened the day it was written. What holds instead is that the
 * **only** file naming it is the guard: the pin fails when another file acquires
 * the vocabulary, and it fails when the guard stops naming it — which is the
 * shape in which the guard could quietly stop guarding.
 *
 * **Contract and state only** (REQ-31): every box is zero in jsdom, so nothing
 * here measures one. The geometry these claims stand beside is in the browser
 * (`e2e/classic-table-criteria*.spec.ts`, `e2e/classic-table-sweep.spec.ts`,
 * `e2e/closing-invariants.spec.ts`).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as library from '../../src/ui';

const clientRoot = process.cwd();
const repositoryRoot = join(clientRoot, '..');

/**
 * The revision this plan starts from — the merge that shipped the condemned
 * presentation intact (`requirements.md`, F0). Pinned as a hash because that is
 * what "since" means here; a rebase past it fails the premise below by name
 * rather than turning a comparison into a tautology.
 */
const DELIVERED = 'd17e1df';

/**
 * The revision this plan **ends** at — its last commit, the closing e2e follow-up included. It is
 * the other end of the one claim below that is about the plan's own arithmetic rather than about a
 * state the product must stay in; every other claim in this file reads the working tree, so the
 * retirement goes on being enforced at whatever `HEAD` happens to be.
 */
const RETIREMENT_COMPLETE = 'e800961';

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Every source file the product ships or builds with: the client's own code and its build scripts. */
function productFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : productFiles(path);
    return /\.(tsx?|css|mjs)$/.test(entry.name) ? [path] : [];
  });
}

function filesMatching(pattern: RegExp, ...roots: string[]): string[] {
  return roots
    .flatMap((root) => productFiles(join(clientRoot, root)))
    .filter((path) => pattern.test(readFileSync(path, 'utf8')))
    .map((path) => path.slice(clientRoot.length + 1).split('\\').join('/'))
    .sort();
}

/**
 * **The retired presentation's vocabulary**, as the exact names it went by, each
 * with the reintroduction it must fire on and the citation it must not.
 *
 * The negative sample is not decoration: this plan's own slug carries the word
 * `comfortable`, and a pattern loose enough to fire on a plan reference would
 * report every file that cites the decision — teaching the next reader to ignore
 * the guard, which is how a guard becomes a formality (REQ-24). The positive
 * sample is the other half: a pattern that matches nothing anywhere is
 * indistinguishable from a pattern that passes, and the pin below rests on all
 * four of them being able to fire.
 */
const RETIRED_VOCABULARY: { what: string; pattern: RegExp; fires: string; doesNotFire: string }[] = [
  {
    what: 'the classes it painted',
    pattern: /ui-data-table--comfortable|ui-data-table__row--comfortable/,
    fires: '.ui-data-table--comfortable .ui-data-table__body { gap: var(--space-3); }',
    doesNotFire: 'see plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-22',
  },
  {
    what: 'the type that offered it',
    pattern: /DataTableVariant/,
    fires: "export type DataTableVariant = 'dense' | 'comfortable';",
    doesNotFire: 'export interface DataTableProps<T> { columns: DataTableColumn<T>[] }',
  },
  {
    what: 'the surface each row was drawn on',
    pattern: /ComfortableRowCarrier/,
    fires: 'const Carrier = comfortable ? ComfortableRowCarrier : Fragment;',
    doesNotFire: 'the card each row was drawn on went with the presentation',
  },
  {
    what: 'the value a call site stated',
    pattern: /(['"])comfortable\1/,
    fires: '<DataTable variant="comfortable" rows={volumes} />',
    doesNotFire: 'plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table, batch 5',
  },
];

const ANY_RETIRED_NAME = new RegExp(RETIRED_VOCABULARY.map((entry) => entry.pattern.source).join('|'));

/** The one file allowed to name it: the guard, which names it in order to refuse it (REQ-23). */
const THE_GUARD = 'scripts/check-ui-conformance.mjs';

describe('the card-per-row presentation is gone from the product (REQ-22)', () => {
  // The premise the pin below rests on. Four regular expressions are only a vocabulary if each of
  // them fires on the thing it names — and only usable if none fires on a citation of the decision.
  it.each(RETIRED_VOCABULARY)('names $what, firing on the reintroduction and not on a citation', (entry) => {
    expect(entry.pattern.test(entry.fires), `the pattern for ${entry.what} does not fire on ${entry.fires}`).toBe(true);
    expect(
      entry.pattern.test(entry.doesNotFire),
      `the pattern for ${entry.what} fires on a citation of the plan that retired it: ${entry.doesNotFire}`,
    ).toBe(false);
  });

  /**
   * REQ-22, REQ-23 — **the pin, and why it is a pin rather than an emptiness**.
   *
   * The previously retired list component could be asserted absent outright
   * (`card-list-deleted.test.ts`) because nothing in the product had to name it.
   * This one is different: REQ-23 requires a command the developer already runs
   * to refuse the presentation by name, so the guard states the vocabulary and
   * must go on stating it. An expectation of `[]` would therefore have been
   * false the moment the guard landed, and the only ways to make it true are to
   * exempt the guard — which is the check checking itself — or to delete the
   * guard.
   *
   * So the list is stated. It fails in both directions: another file acquiring
   * the vocabulary, and the guard ceasing to name it.
   *
   * **The patterns are written unanchored on purpose, and it was measured.**
   * Anchored with `\b`, as the guard's own copies are, none of the four finds
   * the guard at all: it states them inside regular-expression literals, where
   * the character before `ui-data-table--comfortable` is the `b` of `\b` and the
   * leading boundary therefore never matches. A pin written that way expects
   * `[]`, passes, and would go on passing with the whole pass deleted — the
   * failure this file exists to refuse, three lines into itself. That each name
   * is still **refused** rather than merely mentioned is demonstrated by driving
   * the guard, in `ui-conformance-check.test.ts`.
   */
  it('is named by the guard that refuses it and by no other file of the client', () => {
    expect(
      filesMatching(ANY_RETIRED_NAME, 'src', 'scripts'),
      'the retired presentation is named somewhere other than the guard that refuses it',
    ).toEqual([THE_GUARD]);
  });

  // REQ-22 — the export, which is what makes a deleted thing still reachable, in both of the forms
  // this library exports: a value binding and a re-exported type.
  it('is exported from the library’s public entry point in neither of the two forms', () => {
    expect(Object.keys(library).filter((name) => /Comfortable|DataTableVariant/.test(name))).toEqual([]);

    const entryPoint = readFileSync(join(clientRoot, 'src', 'ui', 'index.ts'), 'utf8');
    expect(entryPoint, 'the library still re-exports the retired presentation’s type').not.toMatch(ANY_RETIRED_NAME);
  });

  /**
   * REQ-1 — "no second list primitive, no 'list card' component, no compatibility
   * wrapper for the screens that used to have cards … a smaller public interface
   * than it had".
   *
   * Read as what the entry point gained and lost over the **whole plan**, since
   * a compatibility wrapper is precisely something a plan adds while removing
   * what it replaces: the plan may take a name away and may take nothing new in
   * exchange.
   *
   * **Bounded at both ends, and it has to be** (2026-08-25). Read against `HEAD`,
   * this claim stops being about *this* plan the moment any later one extends the
   * library at all — and the first to do so, the containers card view, extends it
   * for exactly the reason its own REQ-30 demands a new component only where
   * neither reuse nor a variant carries the material (`MetricStrip`, and the
   * prop types of two widened components). None of those is a list primitive, a
   * list card or a compatibility wrapper, so nothing REQ-1 forbids came back;
   * what a `HEAD` reading would report is later work, under this plan's name. The
   * durable half of the promise — the retired vocabulary is named by the guard
   * and by nobody else, and neither retired name is exported again — is asserted
   * against `HEAD` in the two tests above, and stays there.
   */
  it('cost the library’s public interface exactly one name over this plan, and gained none', () => {
    const namesAt = (source: string): string[] =>
      [...source.matchAll(/export\s+(?:type\s+)?{([^}]*)}\s*from/g)]
        .flatMap((block) => block[1]!.split(','))
        .map((name) => name.trim().replace(/^type\s+/, ''))
        .filter(Boolean)
        .map((name) => (name.includes(' as ') ? name.split(' as ')[1]!.trim() : name))
        .sort();

    const before = namesAt(git('show', `${DELIVERED}:client/src/ui/index.ts`));
    const after = namesAt(git('show', `${RETIREMENT_COMPLETE}:client/src/ui/index.ts`));
    // The premise: the two readings are of a real entry point, not of a path that has moved.
    expect(before.length, `${DELIVERED} exports nothing at all, so this comparison reads the wrong file`).toBeGreaterThan(10);

    expect(after.filter((name) => !before.includes(name)), 'this plan added a name to the library’s public interface').toEqual([]);
    expect(before.filter((name) => !after.includes(name)), 'this plan removed something other than the retired type').toEqual([
      'DataTableVariant',
    ]);
  });

  /**
   * REQ-22's own enumeration — "the carrier surface, its stylesheet block, its
   * body gap, its row padding, its expansion rule and its header-inset
   * compensation are **gone, not left behind unreferenced**" — read one entry at
   * a time, each against the build that shipped it.
   *
   * The premise is read at `DELIVERED` rather than assumed: a pattern that
   * matches nothing at the revision that *had* the presentation is a pattern
   * that would report the removal of something which was never there, and eight
   * of those in a row read exactly like a thorough deletion.
   */
  it.each([
    ['the carrier surface each row was drawn on', 'client/src/ui/data/DataTable.tsx', /function ComfortableRowCarrier/],
    ['the type that offered the choice', 'client/src/ui/data/DataTable.tsx', /export type DataTableVariant/],
    ['the prop a call site stated it through', 'client/src/ui/data/DataTable.tsx', /variant\?: DataTableVariant/],
    ['the class the table carried', 'client/src/ui/data/DataTable.tsx', /ui-data-table--comfortable/],
    // REQ-6's own subject, and the reason the removal had to be one change: the slot four lists draw
    // their chips and their nested lists through was read **only** in the retired presentation, so a
    // list converted away from it lost its content with no error and no shorter list.
    ['the gate the row content used to sit behind', 'client/src/ui/data/DataTable.tsx', /comfortable && renderRowContent/],
    ['the body gap between two cards', 'client/src/ui/data/data-table.css', /\.ui-data-table--comfortable \.ui-data-table__body \{[^}]*\bgap:/],
    ['the row’s own padding', 'client/src/ui/data/data-table.css', /\.ui-data-table__row--comfortable \{[^}]*\bpadding:/],
    [
      'the header-inset compensation',
      'client/src/ui/data/data-table.css',
      /\.ui-data-table--comfortable \.ui-data-table__header \{[^}]*\bpadding-inline:/,
    ],
    ['the expansion’s own rule', 'client/src/ui/data/data-table.css', /\.ui-data-table--comfortable \.ui-data-table__expanded \{/],
  ])('deleted %s rather than leaving it unreferenced', (what, path, pattern) => {
    expect(
      pattern.test(git('show', `${DELIVERED}:${path}`)),
      `${what} is not in ${path} at ${DELIVERED} either, so its absence now says nothing`,
    ).toBe(true);

    expect(readFileSync(join(repositoryRoot, path), 'utf8'), `${what} survives in ${path}`).not.toMatch(pattern);
  });

  // …and it is a deletion rather than a rename: the component takes no presentation to choose
  // between, and no longer depends on the surface primitive the carrier was made of. The figures the
  // batch is reported on stand beside it, measured rather than asserted — the file grew over the
  // plan as a whole (batch 3's nested list) while this batch removed the presentation from it.
  it('leaves the component with no presentation to choose and no surface to draw one on', () => {
    const dataTable = readFileSync(join(clientRoot, 'src', 'ui', 'data', 'DataTable.tsx'), 'utf8');
    for (const path of ['client/src/ui/data/DataTable.tsx', 'client/src/ui/data/data-table.css']) {
      console.log(
        `[b5/REQ-22] ${path}: ${git('show', `${DELIVERED}:${path}`).split('\n').length} lines at ${DELIVERED}, ${
          readFileSync(join(repositoryRoot, path), 'utf8').split('\n').length
        } now`,
      );
    }

    expect(dataTable, 'the component still takes a presentation to choose between').not.toMatch(/\bvariant\b/);
    expect(dataTable, 'the component still depends on the surface primitive each retired row was drawn on').not.toMatch(
      /from '\.\.\/glass\/Surface'/,
    );
  });
});

/**
 * **REQ-5's other clause, which is the one the rejected build satisfied nothing
 * of**: "The header and the rows are inset identically **by construction**: no
 * compensating inset rule exists anywhere in the library, the existence of such
 * a compensation being the retired presentation's own signature."
 *
 * The left-edge half of REQ-5 is geometry and is measured in the browser — and
 * it read **green on the rejected build**, because the retired presentation
 * carried a header inset written for exactly that (the 2026-08-16 amendment to
 * REQ-18). What was red there, and is what this file states, is the existence of
 * the compensation itself: two different inline insets for the header and the
 * rows, with a rule reconciling them.
 */
describe('the alignment is structural, with nothing compensating for it (REQ-5)', () => {
  /** Every declaration of a library stylesheet, with the rule that carries it, at any nesting depth. */
  function declarations(css: string): { prelude: string; property: string; value: string }[] {
    const out: { prelude: string; property: string; value: string }[] = [];
    const preludes: string[] = [];
    let buffer = '';
    for (let index = 0; index < css.length; index += 1) {
      const char = css[index]!;
      if (char === '/' && css[index + 1] === '*') {
        const close = css.indexOf('*/', index + 2);
        index = (close === -1 ? css.length : close + 2) - 1;
        continue;
      }
      if (char === '{') {
        preludes.push(buffer.trim());
        buffer = '';
        continue;
      }
      if (char === '}' || char === ';') {
        const separator = buffer.indexOf(':');
        if (separator > -1) {
          out.push({
            prelude: preludes[preludes.length - 1] ?? '',
            property: buffer.slice(0, separator).trim().toLowerCase(),
            value: buffer.slice(separator + 1).trim(),
          });
        }
        buffer = '';
        if (char === '}') preludes.pop();
        continue;
      }
      buffer += char;
    }
    return out;
  }

  /** A shorthand's values, split on the spaces that are not inside `calc()` or `var()`. */
  function values(value: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of value) {
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (/\s/.test(char) && depth === 0) {
        if (current.length > 0) parts.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    if (current.length > 0) parts.push(current);
    return parts;
  }

  /** What this declaration insets the element by on the inline axis, if it insets it at all. */
  function inlineInsets(property: string, value: string): string[] {
    if (property === 'padding') {
      const parts = values(value);
      if (parts.length === 1) return [parts[0]!];
      return parts.length === 4 ? [parts[1]!, parts[3]!] : [parts[1]!];
    }
    if (property === 'padding-inline') {
      const parts = values(value);
      return parts.length === 1 ? [parts[0]!] : parts;
    }
    if (/^padding-(left|right|inline-start|inline-end)$/.test(property)) return [value];
    return [];
  }

  /** The element a rule paints — its rightmost compound, stripped of pseudos and functional tails. */
  function targets(prelude: string): string[] {
    if (prelude.length === 0 || prelude.startsWith('@')) return [];
    return prelude
      .split(',')
      .map((selector) => selector.trim())
      .filter(Boolean)
      .flatMap((selector) => {
        const compounds = selector.split(/[\s>+~]+/).filter(Boolean);
        const last = (compounds[compounds.length - 1] ?? '').split(':')[0]!;
        return [...last.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => `.${match[1]}`);
      });
  }

  const HEADER = /^\.ui-data-table__header(--[\w-]+)?$/;
  const ROW = /^\.ui-data-table__row(-content)?(--[\w-]+)?$/;

  // REQ-5 — the header and the rows are inset by the same token, stated by every rule that insets
  // either of them, in every stylesheet of the library. A second value is a compensation, whichever
  // of the two it belongs to: the tracks are laid inside each grid's content box, so two insets are
  // two different grids and the header's label parts company with its column.
  it('insets the header and every row by one and the same value, everywhere in the library', () => {
    const found: { at: string; target: string; inset: string }[] = [];
    for (const path of productFiles(join(clientRoot, 'src', 'ui')).filter((file) => file.endsWith('.css'))) {
      const css = readFileSync(path, 'utf8');
      for (const declaration of declarations(css)) {
        const kind = targets(declaration.prelude).some((target) => HEADER.test(target))
          ? 'header'
          : targets(declaration.prelude).some((target) => ROW.test(target))
            ? 'row'
            : null;
        if (kind === null) continue;
        for (const inset of inlineInsets(declaration.property, declaration.value)) {
          found.push({ at: `${path.slice(clientRoot.length + 1)} "${declaration.prelude}"`, target: kind, inset });
        }
      }
    }

    console.log(`[b5/REQ-5] inline insets of the header and the rows: ${JSON.stringify(found.map((entry) => `${entry.target}=${entry.inset}`))}`);

    // The premise, and it is the one that has gone empty twice in this plan: a scan that found no
    // header rule and no row rule would report one distinct inset — none — and pass.
    expect(found.filter((entry) => entry.target === 'header').length, 'no rule of the library insets the column header at all').toBeGreaterThan(0);
    expect(found.filter((entry) => entry.target === 'row').length, 'no rule of the library insets a row at all').toBeGreaterThan(0);

    expect(
      [...new Set(found.map((entry) => entry.inset))].sort(),
      'the header and the rows are inset by more than one value, so something has to compensate for the difference',
    ).toEqual(['var(--space-4)']);
  });
});

/**
 * **REQ-34 — no blur is added, moved or removed anywhere**, read over this plan's
 * own diff rather than over the working tree.
 *
 * `blur-policy.test.ts` holds the allow-list's *content* and
 * `programme-constraints.test.ts` holds the conformance script's blur half
 * byte-identical at every revision. Neither can say that no **other** stylesheet
 * of the client gained or lost a blur while these lists were being converted,
 * and that is the half REQ-34 names: "an edit to them is a signal that something
 * has gone wrong, to be reported rather than made".
 */
describe('REQ-34 — this plan moved no blur and did not touch the background', () => {
  const PLAN_DIFF = ['diff', DELIVERED, 'HEAD', '--', 'client/src', 'client/scripts'];

  /**
   * The premise both claims below rest on: `DELIVERED` is still in the history,
   * and the plan still has a diff against it. A rebase past it, or a comparison
   * of HEAD with itself, turns "nothing changed" into a tautology — which is the
   * one thing a claim about what did *not* happen must never be allowed to
   * become. Stated in each test rather than once, since either can be run alone.
   */
  function planDiffOrThrow(): string {
    expect(git('merge-base', '--is-ancestor', DELIVERED, 'HEAD') === '', `${DELIVERED} is not an ancestor of HEAD`).toBe(true);
    const diff = git(...PLAN_DIFF);
    expect(diff.length, 'this plan changes nothing under client/src, so there is nothing to read for a blur').toBeGreaterThan(0);
    return diff;
  }

  it('adds and removes no blur declaration anywhere in the client’s own sources', () => {
    const blurEdits = planDiffOrThrow()
      .split('\n')
      .filter((line) => /^[+-][^+-]/.test(line))
      .filter((line) => /backdrop-filter|filter:\s*blur|blur\(/.test(line));

    expect(blurEdits, 'this plan adds, moves or removes a blur declaration').toEqual([]);
  });

  it('leaves the pre-blurred background’s own sources untouched', () => {
    planDiffOrThrow();
    expect(git('diff', '--stat', DELIVERED, 'HEAD', '--', 'client/src/ui/background/').trim()).toBe('');
  });
});

/**
 * **The 2026-08-25 exception is recorded where the retirement is stated**
 * (`plan-docker_management_app-containers_card_view/REQ-62`, `REQ-63`).
 *
 * The guard is driven in `ui-conformance-check.test.ts`; what is left is the
 * half REQ-62 names, and it is the half a green run cannot show: a reader
 * arriving cold at the 2026-08-16 record, at the plan artefacts that carry it as
 * delivered behaviour, or at the two component specs that state the rule, finds
 * a **bounded exception with a date and a pointer** rather than a record the
 * product silently contradicts.
 *
 * The certified requirements are read against the revision that last held them
 * before the amendment: "annotate, do not renumber" is a claim about a change,
 * so it is checked against the state that changed.
 */
describe('the containers exception is recorded, dated and bounded (REQ-62)', () => {
  /** The record as certified, the last revision before the 2026-08-25 amendment. */
  const BEFORE_THE_AMENDMENT = 'c434700';
  const RETIREMENT_PLAN = '.sdd/archived/plans/plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table';
  const PLAN_REQUIREMENTS = `${RETIREMENT_PLAN}/requirements.md`;
  /** The same file at the certified revision, which predates the move into `.sdd/archived/`. */
  const PLAN_REQUIREMENTS_THEN = PLAN_REQUIREMENTS.replace('.sdd/archived/', '.sdd/');

  it.each([
    '.sdd/archived/analysis/ui-coherence-optimisation-comfortable_variant_retired-classic_table.md',
    PLAN_REQUIREMENTS,
    `${RETIREMENT_PLAN}/batches.md`,
    `${RETIREMENT_PLAN}/closing-state.md`,
    '.sdd/modules/ui-library/specs/ui-conformance-check.md',
    '.sdd/modules/ui-library/specs/data-table.md',
  ])('%s states the exception, its date and where it is written', (path) => {
    const text = readFileSync(join(repositoryRoot, path), 'utf8');

    expect(text, 'the artefact carries the retirement with no amendment dated 2026-08-25').toMatch(/2026-08-25/);
    expect(text, 'the amendment does not name the one screen it is bounded to').toMatch(/containers/i);
    expect(text, 'the amendment points at no record a later reader could follow').toMatch(
      /docker_management_app-containers_card_view/,
    );
  });

  // REQ-62 — "do not renumber, delete or rewrite a certified requirement: annotate it". The ids are
  // read as a set against the certified revision, and the three geometric claims the exception
  // narrows are read as text: an amendment that removed the criterion instead of bounding it would
  // leave the record silent about what still holds on every other list.
  it('annotates the certified requirements of the retirement instead of renumbering or deleting them', () => {
    const ids = (text: string): string[] => [...text.matchAll(/^\| (REQ-\d+) \|/gm)].map((match) => match[1]!);

    const before = ids(git('show', `${BEFORE_THE_AMENDMENT}:${PLAN_REQUIREMENTS_THEN}`));
    // The premise: a revision that holds no requirement table at all would make the comparison below
    // an equality between two empty lists.
    expect(before.length, `${BEFORE_THE_AMENDMENT} states no requirement, so this comparison reads the wrong file`).toBeGreaterThan(10);

    const now = readFileSync(join(repositoryRoot, PLAN_REQUIREMENTS), 'utf8');
    expect(ids(now), 'a certified requirement of the retirement was renumbered, deleted or added to').toEqual(before);
    for (const criterion of ['Rows are flush', 'Rows are not cards', 'One surface']) {
      expect(now, `the amendment removed "${criterion}" instead of bounding it`).toContain(criterion);
    }
  });

  // REQ-63 — the exception is a screen: what the record admits is the containers list, and it says
  // in the same breath that every other object list is unchanged. Read on the artefact the guard's
  // own violations point a reader at.
  it('records the exception as one screen with every other list unchanged', () => {
    const record = readFileSync(
      join(repositoryRoot, '.sdd/archived/analysis/ui-coherence-optimisation-comfortable_variant_retired-classic_table.md'),
      'utf8',
    );
    const amendment = record.slice(record.indexOf('2026-08-25'));

    for (const list of ['images', 'volumes', 'networks', 'compose', 'swarm', 'registries', 'contexts', 'plugins', 'dashboard']) {
      expect(amendment, `the amendment does not say what became of the ${list} list`).toMatch(new RegExp(list, 'i'));
    }
  });
});
