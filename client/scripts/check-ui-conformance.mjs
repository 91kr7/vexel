// Fails the build when feature code (everything under client/src/ except
// client/src/ui/) violates the UI-library boundary from CLAUDE.md: raw DOM
// tags, CSS imports, `style`/`className` props outside the library, and
// `backdrop-filter` / `filter: blur(...)` anywhere without a commented
// exception. Wired into `npm run lint` and `npm run test` (client workspace).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import ts from 'typescript';

const clientRoot = new URL('..', import.meta.url).pathname;
const srcRoot = join(clientRoot, 'src');
const uiRoot = join(srcRoot, 'ui');
const blurExceptionMarker = 'ui-blur-exception:';

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

function checkBlurUsage(filePath, content) {
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    const hasBlur = /backdrop-filter\s*:/.test(line) || /filter\s*:\s*blur\(/.test(line);
    if (!hasBlur) return;
    const previousLine = lines[index - 1] ?? '';
    const exempted = line.includes(blurExceptionMarker) || previousLine.includes(blurExceptionMarker);
    if (!exempted) {
      violations.push(`${relative(clientRoot, filePath)}:${index + 1} — backdrop-filter/blur() without a "${blurExceptionMarker}" comment`);
    }
  });
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
    checkBlurUsage(filePath, content);
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
