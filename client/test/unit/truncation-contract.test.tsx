import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DefinitionList, MetaCell, StorageUsageRow, TwoLineCell } from '../../src/ui';

/**
 * The truncation contract at the component's own level
 * (plan-ui-coherence-optimisation/REQ-17, REQ-20; ui-library/specs/truncation-contract.md,
 * storage-usage-row.md, table-cells.md, definition-list.md).
 *
 * Two things are checked here, and neither of them is geometry. jsdom lays
 * nothing out, so whether a run really stops inking over its neighbour is
 * asserted in the browser, in `client/e2e/truncation-contract.spec.ts`. What this
 * file asserts is the part that has no geometry at all:
 *
 * - **REQ-17 — there is one contract, and it lives in the library.** The four
 *   classes are declared in exactly one stylesheet under `client/src/ui/`, the
 *   floor is a token rather than a length written on the spot, and no file
 *   outside the library expresses the rule for itself.
 * - **Which components carry it, and which deliberately do not.** The contract
 *   is carried by a class a row does or does not have, so "the wrapping variant
 *   withholds the line class" and "a property band takes none of them" are
 *   statements about the rendered markup — the boundary a later reader gets
 *   wrong, and the one that keeps a layout decision from becoming a data loss.
 */

const SOURCE_ROOT = join(process.cwd(), 'src');
const LIBRARY_ROOT = join(SOURCE_ROOT, 'ui');

/** The five classes `truncation-contract.md` names, and nothing else. */
const CONTRACT_CLASSES = [
  'ui-truncating-row',
  'ui-truncating-run',
  'ui-truncating-line',
  'ui-truncating-meta',
  // Added 2026-08-25 with the containers card's image field
  // (plan-docker_management_app-containers_card_view/REQ-5, REQ-28, REQ-31).
  'ui-truncating-line--start',
];

/** Every stylesheet shipped under `client/src/`, path and content. */
function stylesheets(directory = SOURCE_ROOT): { path: string; css: string }[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    // The conformance suite writes deliberately illegal stylesheets in its own
    // fixture directory while it runs, so this scan must not depend on whether
    // it is mid-run (CLAUDE.md, "Tests" — a test depends on nothing another did).
    if (entry.name === '__conformance-fixture__') return [];
    if (entry.isDirectory()) return stylesheets(path);
    return entry.name.endsWith('.css') ? [{ path, css: readFileSync(path, 'utf8') }] : [];
  });
}

/** The declarations of one CSS rule; jsdom loads no stylesheet, so the rule is read from the file. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\}|\\*/)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`no CSS rule for ${selector}`);
  return match[1];
}

/** Every source file under `client/src/`, with the library or not. */
function sourceFiles(directory = SOURCE_ROOT): { path: string; contents: string }[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.name === '__conformance-fixture__') return [];
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(entry.name) ? [{ path, contents: readFileSync(path, 'utf8') }] : [];
  });
}

function stylesheetsDeclaring(className: string): string[] {
  return stylesheets()
    .filter(({ css }) => new RegExp(`\\.${className}\\s*(,|\\{|:)`).test(css))
    .map(({ path }) => relative(SOURCE_ROOT, path));
}

afterEach(cleanup);

describe('the truncation contract is written once, in the library (REQ-17)', () => {
  // truncation-contract.md: "The stylesheet declares five classes and nothing
  // else ... Written once, in client/src/ui/, and carried by every primitive
  // that draws such a row."
  it.each(CONTRACT_CLASSES)('declares .%s in exactly one stylesheet of the library', (className) => {
    const declaring = stylesheetsDeclaring(className);

    expect(declaring, `.${className} is declared in ${declaring.length} stylesheets: ${declaring.join(', ')}`).toHaveLength(1);
    expect(declaring[0].split('/')[0], `.${className} is declared outside the library`).toBe('ui');
  });

  // truncation-contract.md: the run "may shrink, and it flexes from a zero basis
  // ... It never resolves narrower than --truncating-run-min-width", and "the
  // floor is the token; no length is written on the spot".
  it('floors the run on the token and writes no length of its own', () => {
    const path = join(LIBRARY_ROOT, stylesheetsDeclaring('ui-truncating-run')[0].replace(/^ui\//, ''));
    const css = readFileSync(path, 'utf8');
    const run = ruleBody(css, '.ui-truncating-run');

    expect(run).toMatch(/min-width:[^;]*--truncating-run-min-width/);
    expect(run, 'the run declares a length of its own beside the token').not.toMatch(/min-width:\s*\d+px/);
    expect(run, 'the run does not flex from a zero basis, so the line breaks on its content instead of its floor').toMatch(/flex:\s*1\s+1\s+0/);
    expect(readFileSync(join(LIBRARY_ROOT, 'tokens.css'), 'utf8')).toMatch(/--truncating-run-min-width:\s*\d+px/);
  });

  // truncation-contract.md: ".ui-truncating-line → one line of that run: a single
  // line, truncated with an ellipsis at the run's edge", and ".ui-truncating-meta
  // → the trailing metadata: its natural width, whatever the run does".
  it('states the line as one ellipsised line and the meta as an unshrinkable one', () => {
    const path = join(LIBRARY_ROOT, stylesheetsDeclaring('ui-truncating-line')[0].replace(/^ui\//, ''));
    const css = readFileSync(path, 'utf8');

    const line = ruleBody(css, '.ui-truncating-line');
    expect(line).toMatch(/overflow:\s*hidden/);
    expect(line).toMatch(/text-overflow:\s*ellipsis/);
    expect(line).toMatch(/white-space:\s*nowrap/);

    expect(ruleBody(css, '.ui-truncating-meta')).toMatch(/flex:\s*none|flex-shrink:\s*0/);
    // "when the row cannot hold the floored run and the trailing group side by
    // side, the trailing group takes a line of its own"
    expect(ruleBody(css, '.ui-truncating-row')).toMatch(/flex-wrap:\s*wrap/);
  });

  // truncation-contract.md, widened 2026-08-25: ".ui-truncating-line--start → the same one line,
  // ellipsised at its **front** instead of its end, for a value whose tail is the half that
  // identifies it… Carried together with .ui-truncating-line, never instead of it."
  it('moves the ellipsis to the front of the line without moving the line', () => {
    const path = join(LIBRARY_ROOT, stylesheetsDeclaring('ui-truncating-line--start')[0].replace(/^ui\//, ''));
    const css = readFileSync(path, 'utf8');
    const front = ruleBody(css, '.ui-truncating-line--start');

    // The overflow, and with it the ellipsis, moves to the start of the line…
    expect(front).toMatch(/direction:\s*rtl/);
    // …and the line itself stays where it was.
    expect(front).toMatch(/text-align:\s*left/);
    // Carried together with the one-line rule, never instead of it: it restates none of it.
    expect(front, 'the front variant restates the one-line rule instead of carrying it').not.toMatch(
      /overflow\s*:|text-overflow\s*:|white-space\s*:/,
    );
  });

  // REQ-17 — "No feature file expresses this itself, and no screen solves it
  // locally": the classes are the library's, and the screens say nothing about
  // truncation at all.
  it('leaves no truncation rule stated outside the library', () => {
    const offenders = sourceFiles()
      .filter(({ path }) => relative(SOURCE_ROOT, path).split('/')[0] !== 'ui')
      .filter(({ contents }) => CONTRACT_CLASSES.some((className) => contents.includes(className)) || /text-overflow|white-space:\s*nowrap/.test(contents))
      .map(({ path }) => relative(SOURCE_ROOT, path));

    expect(offenders, `these files outside the library express a truncation rule of their own: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('the components that carry the contract (REQ-17)', () => {
  // storage-usage-row.md: "the description shrinks and truncates with an
  // ellipsis, while sizeLabel and the action keep their width", and "the label is
  // outside the contract, deliberately: it is a fixed caption in the product's
  // own wording, not a machine value, so it wraps rather than losing characters."
  it('truncates a StorageUsageRow’s description while its label, size and action keep their width', () => {
    const { container } = render(
      <StorageUsageRow label="Unused volumes" description="3 volumes unattached" sizeLabel="2.1GB" action={{ label: 'Prune', onClick: () => {} }} />,
    );

    const row = container.querySelector('.ui-storage-usage-row') as HTMLElement;
    expect(row).toHaveClass('ui-truncating-row');
    expect(row.querySelector('.ui-storage-usage-row__text')).toHaveClass('ui-truncating-run');
    expect(screen.getByText('3 volumes unattached')).toHaveClass('ui-truncating-line');
    expect(screen.getByText('Unused volumes'), 'the fixed caption was put on the contract and now loses characters').not.toHaveClass(
      'ui-truncating-line',
    );
    expect(screen.getByText('2.1GB')).toHaveClass('ui-truncating-meta');
    expect(
      screen.getByRole('button', { name: 'Prune' }).closest('.ui-truncating-meta'),
      'the trailing action may shrink',
    ).not.toBeNull();
  });
});

describe('the boundary: a list row truncates, a property band wraps (REQ-20)', () => {
  // truncation-contract.md: "A line that reads as a sentence and is expected in
  // full does not take the line class, rather than taking it and overriding it.
  // That is how the wrapping variants of TwoLineCell and MetaCell stay wrapping:
  // they withhold the class."
  it('withholds the line class from the wrapping variants and gives it to the others', () => {
    const { container: truncating } = render(
      <>
        <TwoLineCell title="nginx" subtitle="a1b2c3d4" />
        <MetaCell>3.4MB</MetaCell>
      </>,
    );
    expect(truncating.querySelectorAll('.ui-truncating-line').length, 'the default cell variants stopped truncating').toBe(3);

    cleanup();

    const { container: wrapping } = render(
      <>
        <TwoLineCell wrap title="A sentence that is expected in full" subtitle="and its second half" />
        <MetaCell wrap>PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin</MetaCell>
      </>,
    );
    expect(
      wrapping.querySelectorAll('.ui-truncating-line'),
      'a wrapping cell variant took the line class, so it is clamped to one ellipsised line',
    ).toHaveLength(0);
  });

  // truncation-contract.md: "In a DataTable the floor is the column's, not the
  // run's ... a cell takes the line and meta classes and not .ui-truncating-run:
  // a second floor inside a 72px track would push the cell's inline action out
  // of it."
  it('gives a table cell no run of its own, and keeps its inline action unshrinkable', () => {
    const { container } = render(<TwoLineCell title="nginx" subtitle="a1b2c3d4" action={<button type="button">edit</button>} />);

    expect(container.querySelectorAll('.ui-truncating-run'), 'a table cell carries the run floor as well as the column minimum').toHaveLength(0);
    expect(screen.getByRole('button', { name: 'edit' }).closest('.ui-truncating-meta')).not.toBeNull();
  });

  // definition-list.md / REQ-20: the property grid is outside the contract —
  // "there a one-line clamp would turn a layout defect into a data loss".
  it('leaves a property band free of every class of the contract', () => {
    const { container } = render(
      <DefinitionList
        items={[
          { label: 'Mountpoint', value: '/var/lib/docker/volumes/fc95450b/_data' },
          { label: 'Driver', value: 'local' },
        ]}
      />,
    );

    for (const className of CONTRACT_CLASSES) {
      expect(container.querySelectorAll(`.${className}`), `a property band carries .${className} (REQ-20)`).toHaveLength(0);
    }
  });
});
