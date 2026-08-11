// Fails the build when feature code (everything under client/src/ except
// client/src/ui/) violates the UI-library boundary from CLAUDE.md: raw DOM
// tags, CSS imports and `style`/`className` props outside the library. It also
// enforces the blur policy over every stylesheet of the client: a runtime blur
// is a violation unless the rule carrying it targets one of the allow-listed
// overlay surfaces below and is valued with the single `--blur-overlay` token.
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
  '.ui-frame__scrim',
  '.ui-session-ended-overlay',
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

for (const filePath of collectSourceFiles(srcRoot)) {
  const content = readFileSync(filePath, 'utf8');
  const inUi = isInsideUiLibrary(filePath);

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
