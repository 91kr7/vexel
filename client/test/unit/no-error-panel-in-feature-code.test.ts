/**
 * The page body reports no failure any more
 * (plan-docker_management_app-inline_error_panels/REQ-1, /REQ-2).
 *
 * The requirement is about the whole application, not about the screens a
 * component check happens to render, so it is answered over the sources: the
 * failure panel is one library component, and what a screen cannot draw it
 * cannot show. One call site survives, named by the requirement itself — the
 * daemon's refusal of a creation the operator just submitted, standing beside
 * the control that submitted it.
 *
 * What this file cannot say: whether a screen replaced its panel with a message
 * of its own making. That is the screens' own checks, and the browser's
 * (`e2e/no-error-panel-in-the-page.spec.ts`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const clientRoot = process.cwd();

/** The one panel REQ-1 keeps: the refusal of a creation, in the form that sent it. */
const THE_PANEL_THAT_STAYS = join('src', 'containers', 'ContainerCreateForm.tsx');

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** The client's feature code: everything under `src` but the library that defines the panel. */
function featureFiles(): { path: string; text: string }[] {
  return filesUnder(join(clientRoot, 'src'))
    .map((path) => ({ path: relative(clientRoot, path), text: readFileSync(path, 'utf8') }))
    .filter((file) => !file.path.startsWith(`src${sep}ui${sep}`));
}

/** The lines rendering a failure panel, as `<path>:<line>`. */
function renderSites(): string[] {
  return featureFiles().flatMap((file) =>
    file.text
      .split('\n')
      .map((line, index) => (/<ErrorBanner[\s/>]/.test(line) ? `${file.path}:${index + 1}` : undefined))
      .filter((site): site is string => site !== undefined),
  );
}

describe('no error panel is drawn in a screen (…-inline_error_panels/REQ-1, /REQ-2)', () => {
  it('leaves one panel in the whole client, in the form that submitted the refused creation', () => {
    const sites = renderSites();

    expect(sites, 'a screen still draws a failure panel in its body').toHaveLength(1);
    expect(sites[0].startsWith(THE_PANEL_THAT_STAYS), `the surviving panel is not the create form's: ${sites[0]}`).toBe(true);
  });

  it('leaves the panel component imported by that form alone', () => {
    const importers = featureFiles()
      .filter((file) => /\bErrorBanner\b/.test(file.text))
      .map((file) => file.path);

    expect(importers).toEqual([THE_PANEL_THAT_STAYS]);
  });
});
