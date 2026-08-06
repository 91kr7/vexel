import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Resolved from the client workspace root (vitest's working directory), not
// import.meta.url: the jsdom test environment rewrites module URLs and does
// not preserve a file: scheme suitable for path resolution.
const tokensPath = join(process.cwd(), 'src/ui/tokens.css');
const tokensCss = readFileSync(tokensPath, 'utf8');

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function readToken(name: string): string {
  const match = tokensCss.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Token --${name} not found in tokens.css`);
  return match[1].trim();
}

function parseColor(value: string): Rgba {
  const hexMatch = value.match(/^#([0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgbaMatch = value.match(/rgba?\(([^)]+)\)/);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((part) => part.trim());
    return { r: Number(parts[0]), g: Number(parts[1]), b: Number(parts[2]), a: parts[3] === undefined ? 1 : Number(parts[3]) };
  }
  throw new Error(`Unsupported color format: ${value}`);
}

/** Alpha-composites a translucent foreground over an opaque background (both 0-255 channels). */
function compositeOverBackground(foreground: Rgba, background: Rgba): Rgba {
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    a: 1,
  };
}

/** WCAG relative luminance. */
function relativeLuminance({ r, g, b }: Rgba): number {
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two opaque colors. */
function contrastRatio(a: Rgba, b: Rgba): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [lighter, darker] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

describe('design tokens — legibility (ui-library/specs/design-tokens.md)', () => {
  const backdrop = parseColor(readToken('color-void'));
  const textPrimary = parseColor(readToken('color-text-primary'));
  const textSecondary = parseColor(readToken('color-text-secondary'));

  for (const surfaceToken of ['color-surface-1', 'color-surface-2']) {
    const surface = compositeOverBackground(parseColor(readToken(surfaceToken)), backdrop);

    // plan-docker_management_app/REQ-4
    it(`text-primary on ${surfaceToken} clears the 4.5:1 body-text contrast ratio`, () => {
      expect(contrastRatio(textPrimary, surface)).toBeGreaterThanOrEqual(4.5);
    });

    // plan-docker_management_app/REQ-4
    it(`text-secondary on ${surfaceToken} clears the 3:1 secondary-text contrast ratio`, () => {
      expect(contrastRatio(textSecondary, surface)).toBeGreaterThanOrEqual(3);
    });
  }
});
