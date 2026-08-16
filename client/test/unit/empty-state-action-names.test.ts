/**
 * **An empty state's way out is named apart from the toolbar's own action**
 * (`ui-library/specs/empty-state.md`, `plan-ui-coherence-optimisation/REQ-41`,
 * `plan-docker_management_app/REQ-25`).
 *
 * Where a surface's toolbar already offers the resolving action, one action is
 * offered through two controls, both drawn at the same time while the list is
 * empty — and the rule the primitive states is that the two must be **tellable
 * apart by their accessible names, with neither name containing the other**. A
 * suffix is not a different name: anything that finds a control *by name*
 * matches on the name it is given, so `New secret` resolves `New secret…` too.
 *
 * **This check reads the source tree rather than a list of labels**, and that is
 * the whole reason it exists. Eight panels shipped the collision and nineteen
 * batches of per-panel checks passed over it, because each of them was written
 * against the strings that panel happened to carry. A ninth panel added
 * tomorrow must fail here without anyone editing anything: the panels are
 * discovered by what they compose — a `ScreenToolbar` carrying an action and an
 * `EmptyState` carrying one — and the names are read out of the source.
 *
 * **The perimeter is the file**, because the panels this rule is about draw
 * their toolbar and their empty state together, and a screen file that holds two
 * sections (`SwarmConfigsStacksPanel`) draws both of them at once as well. It
 * makes no claim about two controls that never share a screen.
 *
 * **It makes no runtime claim.** It reads JSX; it cannot compute an accessible
 * name, and a label built at runtime is invisible to it — which is why it also
 * insists that every action it inspects yields a name it could read, rather than
 * passing quietly on the one it could not. The runtime half, over the two panels
 * whose data a unit test controls, is in `volumes-panel.test.tsx` and
 * `networks-panel.test.tsx` ("draws both create controls on an empty list").
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

// The client's own root, as the other source-reading checks resolve it; a scan that found nothing
// because the runner was invoked from elsewhere fails the discovery check below rather than passing.
const clientRoot = process.cwd();

interface Panel {
  path: string;
  toolbarNames: string[];
  emptyStateNames: string[];
  offersAWayOut: boolean;
  unreadableActions: string[];
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : filesUnder(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

/** The source of every `<Tag …>` element in a file, up to the `>` that closes its own opening tag. */
function elementsNamed(text: string, tag: string): string[] {
  const found: string[] = [];
  const opening = new RegExp(`<${tag}(?=[\\s/>])`, 'g');
  let match: RegExpExecArray | null;
  while ((match = opening.exec(text)) !== null) {
    let depth = 0;
    let quote: string | null = null;
    let index = match.index + match[0].length;
    for (; index < text.length; index += 1) {
      const character = text[index]!;
      if (quote !== null) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'" || character === '`') {
        quote = character;
      } else if (character === '{') {
        depth += 1;
      } else if (character === '}') {
        depth -= 1;
      } else if (character === '>' && depth === 0) {
        break;
      }
    }
    found.push(text.slice(match.index, index + 1));
  }
  return found;
}

/** The expression a braced prop is given, e.g. what `action={…}` holds. */
function bracedProp(element: string, prop: string): string | null {
  const at = element.search(new RegExp(`(?:^|\\s)${prop}=\\{`));
  if (at === -1) return null;
  const start = element.indexOf('{', at);
  let depth = 0;
  for (let index = start; index < element.length; index += 1) {
    if (element[index] === '{') depth += 1;
    else if (element[index] === '}') {
      depth -= 1;
      if (depth === 0) return element.slice(start + 1, index);
    }
  }
  return null;
}

/** What an operator would read on the controls of an expression: a control's own text, or an action object's label. */
function controlNamesIn(expression: string): string[] {
  const fromChildren = [...expression.matchAll(/>([^<>{}]+)</g)].map((match) => match[1]!.trim());
  const fromActionObjects = [...expression.matchAll(/label:\s*'([^']+)'/g)].map((match) => match[1]!);
  return [...fromChildren, ...fromActionObjects].filter((name) => name !== '');
}

function panelsOfTheSourceTree(): Panel[] {
  return filesUnder(join(clientRoot, 'src'))
    .filter((path) => !path.includes(`${join('src', 'ui')}${'/'}`))
    .map((path) => {
      const text = readFileSync(path, 'utf8');
      const unreadableActions: string[] = [];
      const toolbarNames = elementsNamed(text, 'ScreenToolbar').flatMap((element) =>
        ['primaryAction', 'secondaryActions', 'destructiveAction'].flatMap((prop) => {
          const expression = bracedProp(element, prop);
          if (expression === null) return [];
          const names = controlNamesIn(expression);
          const declared = [...expression.matchAll(/label:/g)].length;
          if (names.length < declared) unreadableActions.push(`${prop} of a ScreenToolbar`);
          return names;
        }),
      );
      let offersAWayOut = false;
      const emptyStateNames = elementsNamed(text, 'EmptyState').flatMap((element) => {
        const expression = bracedProp(element, 'action');
        if (expression === null || expression.trim() === 'null') return [];
        offersAWayOut = true;
        const names = controlNamesIn(expression);
        if (names.length === 0) unreadableActions.push('the action of an EmptyState');
        return names;
      });
      return { path: relative(clientRoot, path), toolbarNames, emptyStateNames, offersAWayOut, unreadableActions };
    })
    .filter((panel) => panel.toolbarNames.length > 0 && panel.offersAWayOut);
}

const panels = panelsOfTheSourceTree();

function shadowedPairs(panel: Panel): string[] {
  return panel.emptyStateNames.flatMap((emptyStateName) =>
    panel.toolbarNames
      .filter((toolbarName) => toolbarName.includes(emptyStateName) || emptyStateName.includes(toolbarName))
      .map((toolbarName) => `${panel.path}: the toolbar's "${toolbarName}" and the empty state's "${emptyStateName}"`),
  );
}

describe('An empty state names its way out apart from the toolbar (empty-state.md)', () => {
  // The check is worthless if it discovers nothing: the panels are found by what they compose, and
  // the product has had eight of them since the swarm screens landed.
  it('finds the panels that compose a toolbar action and an empty state action', () => {
    expect(panels.length).toBeGreaterThanOrEqual(8);
  });

  // empty-state.md — the two controls must be tellable apart by their accessible names, with
  // neither name containing the other (plan-ui-coherence-optimisation/REQ-41,
  // plan-docker_management_app/REQ-25)
  it('gives neither control a name that contains the other', () => {
    expect(panels.flatMap(shadowedPairs)).toEqual([]);
  });

  // A name this check cannot read is a panel it cannot vouch for, and silence there is how the
  // collision survived nineteen batches.
  it('reads a name for every action it inspects', () => {
    expect(panels.flatMap((panel) => panel.unreadableActions.map((action) => `${panel.path}: ${action}`))).toEqual([]);
  });
});
