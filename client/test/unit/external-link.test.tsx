import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExternalLink } from '../../src/ui';

// The library's route to a document outside the application
// (ui-library/specs/external-link.md). Two of its invariants are not observable
// in jsdom — the wrapping of a long URL and the colour it is drawn in — so they
// are read off the stylesheet the component ships with, the way
// design-tokens-contrast.test.ts reads the tokens.

const HREF = 'https://github.com/91kr7/vexel/blob/HEAD/LICENSE-ADDITIONAL-TERMS.md';

// Resolved from the client workspace root (vitest's working directory), as the
// jsdom environment does not preserve a file: URL suitable for path resolution.
const controlsCss = readFileSync(join(process.cwd(), 'src/ui/controls/controls.css'), 'utf8');
const tokensCss = readFileSync(join(process.cwd(), 'src/ui/tokens.css'), 'utf8');

/** The value of a declaration inside a rule of the stylesheet. */
function declaration(selector: string, property: string): string {
  const rule = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(controlsCss);
  if (!rule) throw new Error(`no ${selector} rule in controls.css`);
  const found = new RegExp(`(?:^|;|\\n)\\s*${property}:\\s*([^;]+);`).exec(rule[1]);
  if (!found) throw new Error(`the ${selector} rule declares no ${property}`);
  return found[1].trim();
}

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokensCss);
  if (!match) throw new Error(`token --${name} not found in tokens.css`);
  return match[1].trim();
}

/** The token the link's colour is declared with, refusing a literal colour. */
function linkColourToken(): string {
  const colour = declaration('.ui-external-link', 'color');
  const referenced = /var\(--([a-z0-9-]+)\)/.exec(colour);
  if (!referenced) throw new Error(`the link colour is a literal, not a token of the library: ${colour}`);
  return referenced[1];
}

/** WCAG relative luminance of an opaque `#rrggbb` colour. */
function relativeLuminance(hex: string): number {
  const parsed = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!parsed) throw new Error(`unsupported colour format: ${hex}`);
  const channel = (offset: number) => {
    const srgb = parseInt(parsed[1].slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ExternalLink (ui-library/specs/external-link.md)', () => {
  // "Without a `label`, the shown text is `href` character for character"
  it('shows the URL itself when no label is given', () => {
    const { container } = render(<ExternalLink href={HREF} />);

    expect(container.textContent).toContain(HREF);
    // Readable and copyable by hand, so it stays usable where following it is impossible.
    expect(screen.getByRole('link')).toHaveAccessibleName(HREF);
  });

  // "the label ... in place of the URL"
  it('shows the label in place of the URL when one is given', () => {
    const { container } = render(<ExternalLink href={HREF} label="Additional terms" />);

    expect(screen.getByRole('link')).toHaveAccessibleName('Additional terms');
    expect(container.textContent, 'the URL is shown alongside the label that replaces it').not.toContain(HREF);
  });

  // Actions — "opens `href`, in one step, in a separate browsing context, leaving the application as it was"
  it('leads to the href in one step, in a browsing context of its own', () => {
    render(<ExternalLink href={HREF} />);
    const link = screen.getByRole('link');

    expect(link).toHaveAttribute('href', HREF);
    expect(link).toHaveAttribute('target', '_blank');
  });

  // "The destination cannot reach back into the opening document"
  it('opens the destination with no referrer and no handle on its opener', () => {
    render(<ExternalLink href={HREF} />);
    const rel = (screen.getByRole('link').getAttribute('rel') ?? '').split(/\s+/);

    expect(rel, 'the destination is told where it was opened from').toContain('noreferrer');
    expect(rel, 'the destination keeps a handle on the application window').toContain('noopener');
  });

  // "a 'leaves the application' glyph carrying no text of its own"
  it('adds the leaves-the-application glyph without adding it to the text', () => {
    const { container } = render(<ExternalLink href={HREF} label="Full license text" />);

    const glyph = container.querySelector('[aria-hidden="true"]');
    expect(glyph, 'the link carries no glyph').not.toBeNull();
    expect((glyph?.textContent ?? '').trim().length).toBeGreaterThan(0);
    expect(screen.getByRole('link')).toHaveAccessibleName('Full license text');
  });

  // Navigation — "leads outside the application only; it never changes the active screen"
  it('is a plain route out, carrying no control of the application', () => {
    render(<ExternalLink href={HREF} />);
    const link = screen.getByRole('link');

    expect(link.tagName).toBe('A');
    expect(screen.queryByRole('button')).toBeNull();
  });

  // plan-docker_management_app-about_license_notice/REQ-19 — "Rendering it performs no network request"
  it('renders without contacting the destination', () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('the link must not be followed on render')));
    vi.stubGlobal('fetch', fetchMock);
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => undefined);

    render(<ExternalLink href={HREF} />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    xhrOpen.mockRestore();
  });

  // "a long URL wraps inside its container instead of overflowing it"
  it('wraps a long URL rather than overflowing its container', () => {
    expect(declaration('.ui-external-link', 'overflow-wrap')).toBe('anywhere');
  });

  // "Its text colour has the same luminance as the library's secondary-text token"
  // (plan-docker_management_app/REQ-4, plan-docker_management_app-about_license_notice/REQ-20)
  it('is drawn at the luminance of the secondary-text token', () => {
    const linkLuminance = relativeLuminance(token(linkColourToken()));
    const secondaryLuminance = relativeLuminance(token('color-text-secondary'));

    expect(Math.abs(linkLuminance - secondaryLuminance)).toBeLessThan(0.01);
  });

  // The documented minimum the rest of the application is held to, stated for
  // secondary text in design-tokens-contrast.test.ts (plan-docker_management_app/REQ-4)
  it('clears the documented secondary-text contrast over the glass surfaces', () => {
    const linkColour = token(linkColourToken());
    const base = token('color-void').replace('#', '');

    for (const surfaceToken of ['color-surface-1', 'color-surface-2']) {
      const [r, g, b, a] = token(surfaceToken)
        .replace(/rgba?\(|\)/g, '')
        .split(',')
        .map((part) => Number(part.trim()));
      const composite = [r, g, b].map((channel, index) => channel * a + parseInt(base.slice(index * 2, index * 2 + 2), 16) * (1 - a));
      const surfaceHex = `#${composite.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;

      const lighter = Math.max(relativeLuminance(linkColour), relativeLuminance(surfaceHex));
      const darker = Math.min(relativeLuminance(linkColour), relativeLuminance(surfaceHex));
      expect((lighter + 0.05) / (darker + 0.05), `the link is unreadable on ${surfaceToken}`).toBeGreaterThanOrEqual(3);
    }
  });
});
