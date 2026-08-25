// Fails the build when feature code (everything under client/src/ except
// client/src/ui/) violates the UI-library boundary from CLAUDE.md: raw DOM
// tags, CSS imports and `style`/`className` props outside the library. It also
// enforces the blur policy over every stylesheet of the client: a runtime blur
// is a violation unless the rule carrying it targets one of the allow-listed
// overlay surfaces below and is valued with the single `--blur-overlay` token.
// And it refuses the card row: an object list is one table, and neither the
// library nor a feature file may go back to drawing a surface per row — bar the
// two containers files the card-row pass admits by name below, since 2026-08-25.
// Wired into `npm run lint` and `npm run test` (client workspace).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import ts from 'typescript';

const clientRoot = new URL('..', import.meta.url).pathname;
const srcRoot = join(clientRoot, 'src');
const uiRoot = join(srcRoot, 'ui');
const blurExceptionMarker = 'ui-blur-exception:';

// The surfaces allowed to compute a runtime blur. This is the single place the
// list lives in code; CLAUDE.md states the same list in prose.
const blurAllowedOverlaySelectors = new Set([
  '.ui-overlay-glass',
  '.ui-combobox__list',
  '.ui-frame__rail',
  '.ui-nav-rail',
  '.ui-log-stream__jump',
]);
const blurTokenReference = /var\(\s*--blur-overlay\s*\)/;

/** @type {string[]} */
const violations = [];

function isInsideUiLibrary(filePath) {
  return filePath === uiRoot || filePath.startsWith(uiRoot + sep);
}

function collectSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (['.ts', '.tsx', '.css'].includes(extname(entry))) out.push(full);
  }
  return out;
}

// Reads a stylesheet as a flat list of declarations, each with the line it
// starts on and the prelude of the rule that carries it. Not a CSS parser: it
// tracks comments, strings and brace depth, which is all the blur policy needs.
function collectCssDeclarations(content) {
  const declarations = [];
  const preludes = [];
  let buffer = '';
  let bufferLine = 1;
  let line = 1;

  function flushDeclaration() {
    const text = buffer.trim();
    if (text.length > 0) {
      declarations.push({ text, line: bufferLine, prelude: preludes[preludes.length - 1] ?? '' });
    }
    buffer = '';
  }

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (char === '/' && content[index + 1] === '*') {
      const close = content.indexOf('*/', index + 2);
      const end = close === -1 ? content.length : close + 2;
      for (let scan = index; scan < end; scan += 1) if (content[scan] === '\n') line += 1;
      index = end - 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const start = index;
      index += 1;
      while (index < content.length && content[index] !== char) {
        if (content[index] === '\\') index += 1;
        else if (content[index] === '\n') line += 1;
        index += 1;
      }
      buffer += content.slice(start, Math.min(index + 1, content.length));
      continue;
    }

    if (char === '{') {
      preludes.push(buffer.trim());
      buffer = '';
      continue;
    }

    if (char === '}') {
      flushDeclaration();
      preludes.pop();
      continue;
    }

    if (char === ';') {
      flushDeclaration();
      continue;
    }

    if (char === '\n') line += 1;
    if (buffer.trim().length === 0 && char.trim().length > 0) bufferLine = line;
    buffer += char;
  }

  return declarations;
}

// The declared value when the declaration computes a runtime blur, null when it
// does not. Anything ambiguous counts as a blur, so the policy fails closed.
function blurDeclarationValue(text) {
  const separator = text.indexOf(':');
  if (separator === -1) return null;
  const property = text.slice(0, separator).trim().toLowerCase();
  const value = text.slice(separator + 1).trim();
  const isBackdropFilter = /(^|-)backdrop-filter$/.test(property);
  const isFilter = !isBackdropFilter && /(^|-)filter$/.test(property);
  if (!isBackdropFilter && !isFilter) return null;
  if (value.toLowerCase() === 'none') return null;
  if (isFilter && !/blur\(/.test(value) && !blurTokenReference.test(value)) return null;
  return value;
}

// True when every selector of the rule targets an allow-listed overlay surface,
// judged on the rightmost compound of each — the element the rule actually
// paints. A selector this heuristic cannot read reports a violation.
function ruleTargetsAllowedOverlay(prelude) {
  if (prelude.length === 0 || prelude.startsWith('@')) return false;
  const selectors = prelude.split(',').map((selector) => selector.trim()).filter(Boolean);
  if (selectors.length === 0) return false;
  return selectors.every((selector) => {
    const compounds = selector.split(/[\s>+~]+/).filter(Boolean);
    const target = compounds[compounds.length - 1] ?? '';
    // The material paints its blur on the surface's own `::before` layer, never
    // on the element (a carrier that blurs itself becomes a backdrop root and
    // kills the blur of any overlay nested inside it). A pseudo-element is that
    // surface's own layer, not a step down into its content, so it is stripped
    // before the class is read: `.ui-nav-rail::before` is the rail. What sits
    // to the left of a combinator is untouched by this, so a real descendant —
    // `.ui-nav-rail .row::before` — still reports.
    const element = target.split('::')[0];
    const classes = [...element.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => `.${match[1]}`);
    return classes.some((className) => blurAllowedOverlaySelectors.has(className));
  });
}

// The radius must come from the one bounded token, never from a length written
// on the spot: `var(--blur-overlay)`, alone or as the argument of every blur().
function blurValueIsTokenBound(value) {
  if (!blurTokenReference.test(value)) return false;
  for (const match of value.matchAll(/blur\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
    if (!/^var\(\s*--blur-overlay\s*\)$/.test(match[1].trim())) return false;
  }
  return true;
}

function checkBlurPolicy(filePath, content) {
  const lines = content.split('\n');
  for (const declaration of collectCssDeclarations(content)) {
    const value = blurDeclarationValue(declaration.text);
    if (value === null) continue;

    const ownLine = lines[declaration.line - 1] ?? '';
    const previousLine = lines[declaration.line - 2] ?? '';
    if (ownLine.includes(blurExceptionMarker) || previousLine.includes(blurExceptionMarker)) continue;

    const location = `${relative(clientRoot, filePath)}:${declaration.line}`;
    const selector = declaration.prelude.length > 0 ? declaration.prelude : '(no enclosing rule)';
    if (!ruleTargetsAllowedOverlay(declaration.prelude)) {
      violations.push(`${location} — runtime blur on "${selector}", which is not an allow-listed overlay surface`);
      continue;
    }
    if (!blurValueIsTokenBound(value)) {
      violations.push(`${location} — runtime blur on "${selector}" must be valued var(--blur-overlay), not a blur length of its own`);
    }
  }
}

function checkFeatureFile(filePath, content) {
  for (const match of content.matchAll(/import\s+['"]([^'"]*\.css)['"]/g)) {
    const specifier = match[1];
    const targetsUiLibrary = /(^|\/)ui\//.test(specifier);
    if (!targetsUiLibrary) {
      violations.push(`${relative(clientRoot, filePath)} — CSS import outside client/src/ui/: "${match[0]}"`);
    }
  }

  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      const isHostElement = /^[a-z]/.test(tagName);
      if (isHostElement) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push(`${relative(clientRoot, filePath)}:${line + 1} — raw DOM tag "<${tagName}>" outside client/src/ui/`);
      }
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || !attribute.name) continue;
        const attrName = attribute.name.getText(sourceFile);
        if (attrName === 'style' || attrName === 'className') {
          const { line } = sourceFile.getLineAndCharacterOfPosition(attribute.getStart(sourceFile));
          violations.push(`${relative(clientRoot, filePath)}:${line + 1} — "${attrName}" prop outside client/src/ui/`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

// ── The card row stays retired ───────────────────────────────────────────────
//
// A third pass, independent of the two above and sharing nothing with them but
// the collector every violation lands in. What it refuses is the card-per-row
// presentation: a list drawn as a stack of separated surfaces, one per object,
// under a floating column header. The decision is that **an object list is one
// table** — one header, ruled rows beneath it, no surface per row — taken on
// 2026-08-15, recorded, and then quietly migrated onto by the next batch of
// work, which is why it is enforced here instead of remembered.
//
// It refuses both ways back:
//
//  - **the library offering it again** — the retired names and classes, a list
//    row given a radius, an outline or a shadow of its own, or a gap opened
//    between the rows of a list body;
//  - **a feature file rebuilding it by hand** — a list composed as one surface
//    per row. (Its other form, a stylesheet or a visual prop in feature code, is
//    already the boundary pass's above; the two together leave no way to draw a
//    card row outside the library and none inside it.)
//
// **There is no exception comment for this pass**, deliberately, and that is not
// an oversight of the blur half's `ui-blur-exception:` marker: a comment written
// at the very call site that reintroduces the arrangement is how a decision
// becomes a formality. Widening it is an edit here, in the open.
const cardRowDecision =
  'The card-per-row presentation is retired: an object list is one table — one header, ruled rows beneath it, no surface per row';
const cardRowRecord = '.sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired-classic_table.md';

// **The one admission, 2026-08-25: the containers list, and nothing else.**
//
// Containers is drawn as one card per container from that date
// (`.sdd/analysis/docker_management_app-containers_card_view.md`, amended into
// the record above, which is not reversed). The reason is that record's own: what
// it condemned was a **hybrid** — a column header promising columns, standing over
// detached cards promising self-contained objects — and it said in as many words
// that a row which does legitimately become a card carries each label inside
// itself. The containers card does exactly that, and no header survives it.
//
// So the admission is **two literal paths**, listed here where widening it is an
// edit in the open. Not a directory, not a pattern, not a component name, and
// still no marker a call site may write for itself: every other feature file that
// draws a surface per row is reported, containers' own included the day it moves.
const cardRowAdmittedCardPerItemPaths = new Set([
  'client/src/containers/ContainersScreen.tsx',
  'client/src/containers/ContainerCard.tsx',
]);

/** True when this file is one of the two paths admitted above, by its whole path. */
function cardRowIsAdmittedCardPerItem(filePath) {
  return cardRowAdmittedCardPerItemPaths.has(`client/${relative(clientRoot, filePath).split(sep).join('/')}`);
}

// The retired presentation's own vocabulary. Written as the exact names it went
// by, so that a check naming them in order to refuse them is the only place in
// the product they survive; a looser pattern would fire on the prose of a plan
// reference and teach the next reader to ignore it.
const cardRowRetiredNames = [
  [/\bui-data-table--comfortable\b|\bui-data-table__row--comfortable\b/g, 'a class of the retired card row'],
  [/\bDataTableVariant\b/g, 'the type that offered the retired card row'],
  [/\bComfortableRowCarrier\b/g, 'the surface each retired row was drawn on'],
  [/(['"])comfortable\1/g, 'the retired card row asked for by name'],
];

// A row is the row itself, whatever modifier it carries, and the content wrapper
// drawn under its cells; a rounded corner on either is a card. A body is the run
// of rows, where a gap is the space that used to separate two cards.
const cardRowRowClass = /^\.ui-data-table__row(-content)?(--[\w-]+)?$/;
const cardRowBodyClass = /^\.ui-data-table__body$/;
const cardRowSurfaceProperty = /^(border(-[a-z]+)*-radius|outline|box-shadow)$/;
const cardRowGapProperty = /^(gap|row-gap)$/;
// Switching one off is not drawing one: `border-radius: 0` is the shape of a row
// that refuses to be a card, and the rules that state it must stay legal.
const cardRowInertValue = /^(none|0|0px|0rem|0%|0em|initial|unset|revert)$/i;

function lineOfIndex(content, index) {
  let line = 1;
  for (let scan = 0; scan < index; scan += 1) if (content[scan] === '\n') line += 1;
  return line;
}

/** The classes of the rule's rightmost compound — the element the rule paints — per selector. */
function cardRowRuleTargets(prelude) {
  if (prelude.length === 0 || prelude.startsWith('@')) return [];
  return prelude
    .split(',')
    .map((selector) => selector.trim())
    .filter(Boolean)
    .flatMap((selector) => {
      const compounds = selector.split(/[\s>+~]+/).filter(Boolean);
      const target = (compounds[compounds.length - 1] ?? '').split(':')[0];
      return [...target.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => `.${match[1]}`);
    });
}

/** What is wrong with this declaration, as a phrase, or null when nothing is. */
function cardRowStyleOffence(declaration) {
  const separator = declaration.text.indexOf(':');
  if (separator === -1) return null;
  const property = declaration.text.slice(0, separator).trim().toLowerCase();
  const value = declaration.text.slice(separator + 1).trim();
  if (cardRowInertValue.test(value)) return null;
  const targets = cardRowRuleTargets(declaration.prelude);
  if (cardRowSurfaceProperty.test(property) && targets.some((target) => cardRowRowClass.test(target))) {
    return `a list row given a surface of its own (${property}: ${value})`;
  }
  if (cardRowGapProperty.test(property) && targets.some((target) => cardRowBodyClass.test(target))) {
    return `a gap between the rows of a list body (${property}: ${value})`;
  }
  return null;
}

/**
 * A list built as one surface per row, in a feature file: a surface rendered
 * inside the callback a collection is mapped through. Read from the syntax tree
 * rather than from the text, so that `<Card>` standing on its own — a screen's
 * own panel, which is what a card is for — is untouched, and only a card drawn
 * once per item of a list is reported.
 *
 * The two admitted paths are exempt from this card-row form and from it alone:
 * the retired vocabulary and the stylesheet rules below still hold there.
 */
function cardRowSurfacesPerItem(filePath, content) {
  if (cardRowIsAdmittedCardPerItem(filePath)) return;
  if (!/<\s*(Surface|Card)\b/.test(content)) return;
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function insideMapper(node) {
    let callback = null;
    for (let current = node.parent; current; current = current.parent) {
      if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) callback = current;
      const isMapCall =
        ts.isCallExpression(current) &&
        ts.isPropertyAccessExpression(current.expression) &&
        current.expression.name.getText(sourceFile) === 'map';
      if (isMapCall && callback && current.arguments.includes(callback)) return true;
    }
    return false;
  }

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if ((tagName === 'Surface' || tagName === 'Card') && insideMapper(node)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push(
          `${relative(clientRoot, filePath)}:${line + 1} — a list built as one <${tagName}> per row, which is the card row rebuilt by hand. ${cardRowDecision}. See ${cardRowRecord}.`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function checkCardRowRetirement(filePath, content, inUi) {
  for (const [pattern, what] of cardRowRetiredNames) {
    for (const match of content.matchAll(pattern)) {
      violations.push(
        `${relative(clientRoot, filePath)}:${lineOfIndex(content, match.index)} — ${what} (${match[0]}). ${cardRowDecision}. See ${cardRowRecord}.`,
      );
    }
  }

  if (extname(filePath) === '.css') {
    for (const declaration of collectCssDeclarations(content)) {
      const offence = cardRowStyleOffence(declaration);
      if (offence === null) continue;
      const selector = declaration.prelude.length > 0 ? declaration.prelude : '(no enclosing rule)';
      violations.push(
        `${relative(clientRoot, filePath)}:${declaration.line} — ${offence} on "${selector}". ${cardRowDecision}. See ${cardRowRecord}.`,
      );
    }
    return;
  }

  if (!inUi) cardRowSurfacesPerItem(filePath, content);
}

for (const filePath of collectSourceFiles(srcRoot)) {
  const content = readFileSync(filePath, 'utf8');
  const inUi = isInsideUiLibrary(filePath);

  checkCardRowRetirement(filePath, content, inUi);

  if (extname(filePath) === '.css') {
    checkBlurPolicy(filePath, content);
    continue;
  }

  if (!inUi) checkFeatureFile(filePath, content);
}

if (violations.length > 0) {
  console.error('UI boundary conformance check failed:\n');
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(`\n${violations.length} violation(s). See CLAUDE.md for the UI-library boundary rules.`);
  process.exit(1);
}

console.log('UI boundary conformance check passed.');
