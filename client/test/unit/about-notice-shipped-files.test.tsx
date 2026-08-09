import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AboutNotice } from '../../src/shell/AboutNotice';

// Two legal statements about the same product that contradict each other are
// worse than one, and the interface and the licence files are edited by
// different hands months apart. This file therefore reads the author, the year,
// the licence identifier and the source URL back out of the shipped files and
// asks the notice to agree with them
// (plan-docker_management_app-about_license_notice/REQ-18): the expected values
// are never written here, they are whatever the repository ships today.

/** The repository root, from the client workspace directory vitest runs in. */
const repositoryRoot = join(process.cwd(), '..');

function shippedFile(name: string): string {
  const path = join(repositoryRoot, name);
  if (!existsSync(path)) throw new Error(`the repository ships no ${name}`);
  return readFileSync(path, 'utf8');
}

const notice = shippedFile('NOTICE');
const additionalTerms = shippedFile('LICENSE-ADDITIONAL-TERMS.md');
const license = shippedFile('LICENSE');

/** The single capture of `pattern` in `source`, or a failure naming what is missing. */
function capture(source: string, pattern: RegExp, what: string): string {
  const match = pattern.exec(source);
  if (!match) throw new Error(`the shipped files state no ${what}`);
  return match[1].trim();
}

function renderedText(): string {
  const { container } = render(<AboutNotice />);
  return (container.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function renderedHrefs(): string[] {
  const { container } = render(<AboutNotice />);
  return Array.from(container.querySelectorAll('a')).map((link) => link.getAttribute('href') ?? '');
}

afterEach(cleanup);

describe('AboutNotice — agreement with the files the repository ships (REQ-18)', () => {
  // plan-docker_management_app-about_license_notice/REQ-18 — the author and the year
  it('names the author and the year the NOTICE file names', () => {
    const year = capture(notice, /Copyright \(C\) (\d{4})/, 'copyright year');
    const author = capture(notice, /Copyright \(C\) \d{4} ([^\n]+)/, 'copyright holder');

    const text = renderedText();
    expect(text, `the NOTICE holds the copyright for ${year}`).toContain(year);
    expect(text, `the NOTICE holds the copyright for ${author}`).toContain(author);
    // The additional terms name the same holder, so all three documents agree.
    expect(additionalTerms).toContain(`Copyright (C) ${year} ${author}`);
  });

  // plan-docker_management_app-about_license_notice/REQ-18 — the attribution term 1 specifies verbatim
  it('displays the attribution notice the additional terms specify, word for word', () => {
    // Term 1 of LICENSE-ADDITIONAL-TERMS.md fences the exact notice a conveyed
    // copy must keep reachable in the interface; its first line is the
    // attribution itself.
    const specified = capture(additionalTerms, /```\n(Vexel — Copyright[^\n]+)\n/, 'specified attribution notice');

    expect(renderedText()).toContain(specified);
  });

  // plan-docker_management_app-about_license_notice/REQ-18 — the licence identifier
  it('states the licence identifier the NOTICE declares, and the licence LICENSE actually contains', () => {
    const identifier = capture(notice, /SPDX identifier\s*\.*\s*(\S+)/, 'SPDX identifier');

    expect(renderedText()).toContain(identifier);
    // The identifier is not asserted in isolation: LICENSE is the licence it names.
    expect(license).toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
    expect(license).toMatch(/Version 3/);
    expect(identifier).toBe('AGPL-3.0-only');
  });

  // plan-docker_management_app-about_license_notice/REQ-18 — the source URL
  it('routes to the source repository the NOTICE and the additional terms declare', () => {
    const source = capture(notice, /Source\s*\.*\s*(https?:\/\/\S+)/, 'source URL');

    expect(additionalTerms, 'the two shipped files name different sources').toContain(source);
    expect(renderedText(), 'the source URL is not legible as plain text').toContain(source);
    expect(renderedHrefs(), 'no route leads to the source the shipped files declare').toContain(source);
  });

  // plan-docker_management_app-about_license_notice/REQ-11, REQ-18 — the two document routes reach
  // documents this repository really ships, under the names it ships them under
  it('routes to the two licence documents by the names the repository ships them under', () => {
    const documents = ['LICENSE', 'LICENSE-ADDITIONAL-TERMS.md'];
    const hrefs = renderedHrefs();

    for (const document of documents) {
      expect(existsSync(join(repositoryRoot, document)), `the repository ships no ${document}`).toBe(true);
      const route = hrefs.filter((href) => href.endsWith(`/${document}`));
      expect(route, `no route of the notice reaches ${document}`).toHaveLength(1);
    }
  });

  // plan-docker_management_app-about_license_notice/REQ-15, REQ-18 — the version the project declares
  it('shows the version the repository root package.json declares, and no second version string', () => {
    const rootManifest = JSON.parse(shippedFile('package.json')) as { version?: string };
    expect(rootManifest.version, 'the repository root declares no version').toBeTruthy();

    expect(renderedText()).toContain(`version ${rootManifest.version}`);
    // The client and server manifests stay unversioned on purpose, so no second
    // string in this repository can disagree about which build is running
    // (app-shell/specs/app-version-constant.md).
    for (const workspace of ['client', 'server']) {
      const manifest = JSON.parse(readFileSync(join(repositoryRoot, workspace, 'package.json'), 'utf8')) as { version?: string };
      expect(manifest.version, `${workspace}/package.json carries a version of its own`).toBe('0.0.0');
    }
  });
});
