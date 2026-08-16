/**
 * The programme's constraint sweep, run over the **whole plan's diff** rather
 * than over one batch's (`plan-ui-coherence-optimisation/REQ-83`, `REQ-84`,
 * `REQ-85`, `REQ-92`).
 *
 * Nineteen batches touched a great many surfaces, and four of the plan's
 * constraints are claims about what those batches did **not** do. A claim of
 * that kind cannot be checked against the working tree alone — a file is
 * unchanged only with respect to a revision — so what is read here is the
 * repository's own history, from the revision before batch 1 to the one under
 * test.
 *
 * `blur-policy.test.ts` and `ui-conformance-check.test.ts` already hold the
 * blur policy's *content* — the allow-list agreeing with CLAUDE.md, and the
 * check refusing a stray blur. Neither can say the file was not **edited**, and
 * that is the half REQ-84 exists for: "an edit to it is a signal that something
 * went wrong, reported rather than made".
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const clientRoot = process.cwd();
const repositoryRoot = join(clientRoot, '..');

/**
 * The revision the programme started from — `a363641^`, batch 1's parent — and
 * the two revisions REQ-92's evidence is read at.
 *
 * Pinned as hashes because that is what "unchanged since" means; a rebase moves
 * them, and the failure then says exactly that rather than something about the
 * product.
 */
const BEFORE_BATCH_1 = '4509b96';
const LAST_SCREEN_MIGRATION = 'a88fa57';
const THE_MIGRATION_AFTER_IT = '91bb8d4';

/**
 * **The revision at which the blur half took the shape it must keep**: `43c6187`
 * ("Leave the ended session dimmed, not out of focus", 2026-08-11), the last
 * edit the conformance script received before this programme began.
 *
 * It is pinned here because `BEFORE_BATCH_1` **cannot** carry this walk, and
 * quietly did not: `43c6187` is an *ancestor* of `4509b96`, so
 * `git log 4509b96..HEAD -- client/scripts/check-ui-conformance.mjs` lists
 * nothing at all — on this branch and on `main`. The per-revision assertion
 * below was therefore failing on its **premise** rather than on its claim, and
 * had been since the programme's own rebase, unnoticed for want of a full unit
 * run (found by batch 3's run of
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table`).
 *
 * The range starts one revision *before* it (`^`) so that the certified revision
 * is itself walked: the file's history contains that commit for good, so the
 * range cannot go empty by anything but a re-pin — and a re-pin past it fails
 * the two premise assertions below by name. A guard whose premise can go empty
 * is indistinguishable from a guard that passes, which is the defect this
 * constant exists to close.
 */
const BLUR_HALF_SETTLED = '43c6187';

const CONFORMANCE_SCRIPT = 'client/scripts/check-ui-conformance.mjs';

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** A file as a revision held it. */
function fileAt(revision: string, path: string): string {
  return git('show', `${revision}:${path}`);
}

/**
 * Every revision that has touched the conformance script since the blur half
 * settled, oldest first — and **never an empty list**: a walk with nothing to
 * walk asserts nothing, and would pass while saying so to no one.
 */
function revisionsTouchingSinceTheBlurHalfSettled(): string[] {
  const revisions = git('log', '--format=%H', '--reverse', `${BLUR_HALF_SETTLED}^..HEAD`, '--', CONFORMANCE_SCRIPT)
    .split('\n')
    .filter(Boolean);
  if (revisions.length === 0) {
    throw new Error(
      `${BLUR_HALF_SETTLED}^..HEAD contains no revision touching ${CONFORMANCE_SCRIPT}: the base has been moved past the file's own history, so the guard below has nothing to check`,
    );
  }
  if (!revisions.some((revision) => revision.startsWith(BLUR_HALF_SETTLED))) {
    throw new Error(
      `${BLUR_HALF_SETTLED} is not inside ${BLUR_HALF_SETTLED}^..HEAD: the revision that certified the blur half is not being walked, so what the walk compares against is unpinned`,
    );
  }
  return revisions;
}

/**
 * **The blur half's own source, by name.** REQ-84 names the *blur half* as what
 * must not be edited; whole-file byte-identity was a proxy for it, and a proxy
 * that forbids the file from ever growing for any reason — which is what
 * `.../classic-table/REQ-23` requires it to do, once, for the card row.
 *
 * So the proxy is replaced by the thing itself, and the replacement is
 * **stricter on the half it protects**: not the allow-list alone, but the six
 * declarations that read it or decide on it, byte-identical. Before this, those
 * six were guarded only by the whole-file identity being retired here; after it,
 * they are guarded by name — and at every revision, not only at the endpoints
 * (`.../classic-table/REQ-34`).
 */
const BLUR_HALF_DECLARATIONS = [
  'blurExceptionMarker',
  'blurAllowedOverlaySelectors',
  'blurTokenReference',
  'blurDeclarationValue',
  'ruleTargetsAllowedOverlay',
  'blurValueIsTokenBound',
  'checkBlurPolicy',
];

/**
 * One declaration of a version of the script, extracted by its own name rather
 * than by line numbers: the surrounding file moved over the programme, and moves
 * again here, while these must not. A version that declares none of them throws
 * rather than compares an empty string with an empty string.
 */
function declarationSource(source: string, name: string): string {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^(const|function)\\s+${name}\\b`).test(line));
  if (start < 0) throw new Error(`this version of the check declares no ${name} at all`);
  // Read by lines rather than by counting brackets: the pass is written with
  // regular expressions, and `/blur\(/` alone defeats a bracket counter. The
  // script is top-level and formatted, so a declaration ends at the first line
  // that closes it in column 0 — `}` for a function, a `;` for a const.
  const closes = lines[start]!.startsWith('function')
    ? (line: string) => line === '}'
    : (line: string) => line.endsWith(';');
  for (let index = start; index < lines.length; index += 1) {
    if (closes(lines[index]!)) return lines.slice(start, index + 1).join('\n');
  }
  throw new Error(`the declaration of ${name} has no end`);
}

/** The blur half of a version of the script: its allow-list and the pass that reads it. */
function blurHalfSource(source: string): string {
  return BLUR_HALF_DECLARATIONS.map((name) => declarationSource(source, name)).join('\n\n');
}

/**
 * Every source file of the client, by kind: the library, and the feature code the
 * boundary applies to.
 *
 * `__conformance-fixture__` is skipped, exactly as the three other scans of this
 * tree skip it (`blur-policy.test.ts`, `overlay-glass.test.tsx`,
 * `truncation-contract.test.tsx`): `ui-conformance-check.test.ts` writes
 * deliberately illegal sources there for the length of its own run, so a scan of
 * the live tree that read them would be reporting **another test's fixture** as
 * feature code — and would pass or fail depending on whether that suite happened
 * to be mid-run (CLAUDE.md, "Tests" — a test depends on nothing another test
 * did). One directory name, and nothing else about the check is relaxed: a real
 * blur in a real feature file still fails it.
 */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.name === '__conformance-fixture__') return [];
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

function featureFiles(): string[] {
  const uiRoot = join(clientRoot, 'src', 'ui');
  return sourceFiles(join(clientRoot, 'src')).filter((path) => !path.startsWith(uiRoot));
}

function relativeToClient(path: string): string {
  return path.slice(clientRoot.length + 1).split('\\').join('/');
}

/**
 * **Restated on 2026-08-16** by
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table`,
 * whose REQ-23 requires the conformance script to grow a third pass — the one
 * that refuses the card row — and whose REQ-34 leaves this guard's own subject,
 * the blur half, untouchable. REQ-28 of that plan forbids weakening a certified
 * assertion, so the restatement had to come out **stronger on the half it
 * protects**, and it does, in three ways:
 *
 *  - what is compared is no longer the whole file (a proxy for the blur half,
 *    and one that forbids the file from ever growing for any reason) but the
 *    blur half **by name** — the allow-list *and* the five declarations that
 *    read it or decide on it. Those five were guarded only by the proxy;
 *  - the by-name comparison runs at **every revision that has touched the file**,
 *    this plan's revisions included, not at the endpoints alone — the working
 *    tree beside them;
 *  - and the walk it runs over cannot be empty (`BLUR_HALF_SETTLED`), which the
 *    walk it replaces silently was.
 *
 * The hunk rule widens by exactly one term, this plan's own half, named. A hunk
 * mentioning neither it nor the retired list component's budget still fails.
 * (`plan-ui-coherence-optimisation/REQ-84`;
 * `.../classic-table/REQ-28`, `REQ-34`.)
 */
describe('REQ-84 — the conformance check’s blur half was never edited', () => {
  // REQ-84 — "`blurAllowedOverlaySelectors` stays byte-identical to its state before batch 1, which
  // is the half a green run cannot show", now read as the whole blur pass and not the list alone:
  // asserted at every revision that touched the file, since a list edited in batch 7 and restored in
  // batch 13 would satisfy the endpoints alone.
  it('carries the same blur half, by name, at every revision that has touched the file', () => {
    const certified = blurHalfSource(fileAt(BLUR_HALF_SETTLED, CONFORMANCE_SCRIPT));

    for (const revision of revisionsTouchingSinceTheBlurHalfSettled()) {
      expect(
        blurHalfSource(fileAt(revision, CONFORMANCE_SCRIPT)),
        `${revision.slice(0, 7)} changed the blur allow-list or the pass that reads it`,
      ).toBe(certified);
    }
  });

  // REQ-84 — and in the tree as delivered, which is where an edit lands before any revision holds
  // it. This is what the retired whole-file identity was standing in for, narrowed to its subject.
  it('carries that same blur half in the working tree', () => {
    expect(
      blurHalfSource(readFileSync(join(clientRoot, 'scripts', 'check-ui-conformance.mjs'), 'utf8')),
      'the working tree changed the blur allow-list or the pass that reads it',
    ).toBe(blurHalfSource(fileAt(BLUR_HALF_SETTLED, CONFORMANCE_SCRIPT)));
  });

  // REQ-84 — "Its boundary half receives exactly one planned addition — the call-site budget of
  // REQ-94 … anything else added to this file is the same signal." A hunk is the unit of an edit,
  // so every hunk of every version since must be about one of the two admitted changes.
  it('was edited for nothing but the retiring list component’s budget and the card row’s guard', () => {
    const strayEdits: string[] = [];
    for (const revision of revisionsTouchingSinceTheBlurHalfSettled()) {
      const diff = git('diff', '--unified=0', BLUR_HALF_SETTLED, revision, '--', CONFORMANCE_SCRIPT);
      for (const hunk of diff.split(/^@@/m).slice(1)) {
        const changed = hunk
          .split('\n')
          .filter((line) => /^[+-]/.test(line) && !/^[+-][+-]/.test(line))
          .join('\n');
        // The budget names the component it counts; its epitaph, which batch 13 left and batch 19
        // removed, names what it was. `card row` is the one term added on 2026-08-16, and it is the
        // whole of what `.../classic-table/REQ-23` admits: the pass that refuses the retired
        // presentation names it in every declaration it introduces. A hunk mentioning none of them
        // is an edit to something else.
        if (!/cardlist|call-site budget|list component|card[- ]?row/i.test(changed)) {
          strayEdits.push(`${revision.slice(0, 7)}:\n${changed}`);
        }
      }
    }

    expect(strayEdits, 'the conformance check was edited for something other than those two').toEqual([]);
  });
});

describe('REQ-85 — the background stayed static and pre-blurred', () => {
  // REQ-85 — "nothing added here animates the backdrop": nineteen batches and the backdrop's own
  // sources are untouched, which is the strongest form the claim can take.
  it('leaves the backdrop’s own sources untouched across the whole programme', () => {
    expect(git('diff', '--stat', BEFORE_BATCH_1, 'HEAD', '--', 'client/src/ui/background/').trim()).toBe('');
  });
});

describe('REQ-92 — the last migrated screens added nothing to the library', () => {
  // REQ-92 — "that is demonstrated by the fact that the last migrated screen added no new
  // primitive, no new variant and no new prop to the library": a screen composed from what was
  // already there changes no file of the library at all.
  for (const [name, revision] of [
    ['the last screen migration', LAST_SCREEN_MIGRATION],
    ['the migration after it', THE_MIGRATION_AFTER_IT],
  ] as const) {
    it(`${name} changed no file of the library`, () => {
      expect(git('show', '--stat', '--format=', revision, '--', 'client/src/ui').trim()).toBe('');
    });
  }
});

describe('REQ-83 — the UI boundary holds absolutely', () => {
  // REQ-83 — "no file outside `client/src/ui/` … hard-codes a colour, radius, blur, spacing,
  // shadow, font size or z-index". The raw tags, the CSS imports and the `style`/`className` props
  // are the conformance script's half; the token categories are this one's, since the script does
  // not read them.
  it('states no colour, blur, shadow, radius, font size or z-index literal in feature code', () => {
    const offences: string[] = [];
    for (const path of featureFiles()) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          const at = `${relativeToClient(path)}:${index + 1}`;
          if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(line)) offences.push(`${at} — colour literal: ${line.trim()}`);
          if (/\bblur\(|backdrop-filter|box-shadow|borderRadius|zIndex|z-index|fontSize|font-size/.test(line)) {
            offences.push(`${at} — a token category stated on the spot: ${line.trim()}`);
          }
        });
    }

    expect(offences, 'feature code states a value that belongs to the library’s tokens').toEqual([]);
  });

  // REQ-83 — spacing is the category with a shape of its own: it reaches feature code as a typed
  // prop naming a token step, never as a length. The lengths that do survive are neither spacing
  // nor any other token category — a column track's width and a pane's maximum height — and they
  // are declared here by the props that carry them so that a new one, of any other kind, fails.
  it('states no length in feature code but a track width or a pane’s own maximum', () => {
    const declaredNonTokenLengths = ['width', 'minWidth', 'maxWidth', 'maxHeight', 'startWidth', 'MAX_TABLE_HEIGHT'];
    const lengths: string[] = [];
    for (const path of featureFiles()) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          for (const match of line.matchAll(/([A-Za-z_]+)\s*[:=]\s*["'`][0-9.]+(?:px|rem|em)["'`]/g)) {
            if (!declaredNonTokenLengths.includes(match[1]!)) {
              lengths.push(`${relativeToClient(path)}:${index + 1} — ${match[0]}`);
            }
          }
          // A spacing prop takes a token step (`gap="md"`, `padding={4}`), never a length.
          for (const match of line.matchAll(/\b(gap|padding|margin|inset)\s*[:=]\s*["'`]?[0-9.]+(?:px|rem|em)/g)) {
            lengths.push(`${relativeToClient(path)}:${index + 1} — spacing stated as a length: ${match[0]}`);
          }
        });
    }

    expect(lengths, 'feature code states a length outside the two declared non-token kinds').toEqual([]);
  });
});

describe('REQ-81 — one answer to each of the five questions, in the library’s own exports', () => {
  const entryPoint = readFileSync(join(clientRoot, 'src', 'ui', 'index.ts'), 'utf8');

  /** The value bindings the library's public entry point exports, types excluded. */
  function exportedValues(): string[] {
    return [...entryPoint.matchAll(/export\s*{([^}]*)}\s*from/g)]
      .flatMap((block) => block[1]!.split(','))
      .map((name) => name.trim())
      .filter((name) => name !== '' && !name.startsWith('type '))
      .map((name) => (name.includes(' as ') ? name.split(' as ')[1]!.trim() : name));
  }

  // REQ-81, REQ-82 — the counted half is the screens' (`e2e/closing-invariants.spec.ts`); what can
  // be settled from the tree is that the library offers **one** of each answer to export, since "a
  // component left exported is the next screen's fifth answer".
  it('exports one list primitive, one detail reveal, one action place, one empty state and one section header', () => {
    const values = exportedValues();
    for (const answer of ['DataTable', 'DetailPanel', 'ScreenToolbar', 'EmptyState', 'SectionHeader']) {
      const exported = values.filter((name) => name === answer);
      expect(exported.length, `the library exports ${answer} ${exported.length} times`).toBe(1);
    }
  });

  // REQ-82 — the arrangements the migrations replaced, each deleted with the screen that held it.
  it('exports none of the arrangements the migrations replaced', () => {
    for (const retired of ['CardList', 'GroupedRowsPanel']) {
      expect(entryPoint, `${retired} is still exported from the library`).not.toMatch(new RegExp(`\\b${retired}\\b`));
    }
  });
});
