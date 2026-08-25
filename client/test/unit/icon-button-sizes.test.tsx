import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton } from '../../src/ui';

/**
 * `ui-library/specs/icon-button.md` — the two sizes and the rounding each of them carries.
 *
 * "**The size decides the rounding, and there is one rule per size.** The compact box takes the
 * tighter radius of the library's scale, because the ordinary one is 42% of a 24px square's own
 * side… It is declared on the **size**, not on a variant of one call site", and "neither size states
 * a radius of its own invention; both name a step of the scale"
 * (`plan-docker_management_app-containers_card_view/REQ-3`, `REQ-28`, `REQ-30`).
 *
 * jsdom applies no stylesheet, so the rounding is read where it is written; that the compact control
 * really is a 24×24 box beside a 23.2px name is measured in
 * `client/e2e/containers-card-geometry.spec.ts`.
 */

afterEach(cleanup);

const css = readFileSync(join(process.cwd(), 'src', 'ui', 'controls', 'controls.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function declarationsOf(selector: string): string {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((rule) => rule[1].split(',').some((one) => one.trim() === selector))
    .map((rule) => rule[2])
    .join(' ');
}

describe('IconButton — its two sizes (containers_card_view/REQ-30)', () => {
  it('names the compact variant on the button, and the ordinary one by asking for nothing', () => {
    const { container: compact, unmount } = render(<IconButton size="sm" label="Open details" />);
    expect(compact.querySelector('button')?.className).toBe('ui-icon-button ui-icon-button--sm');
    unmount();

    const { container: ordinary } = render(<IconButton label="Open details" />);
    expect(ordinary.querySelector('button')?.className).toBe('ui-icon-button');
  });

  it('takes the required label as its accessible name, at either size', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton size="sm" label="Open web-nginx details" onClick={onClick} />);

    const control = screen.getByRole('button', { name: 'Open web-nginx details' });
    expect(control).toBeEnabled();
    await user.click(control);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('rounds each size from a step of the library’s scale, and never from a length of its own', () => {
    const compact = declarationsOf('.ui-icon-button--sm');
    const ordinary = declarationsOf('.ui-icon-button');

    expect(compact, 'the compact size is declared nowhere').not.toBe('');
    expect(compact, 'the compact box takes the ordinary rounding').toMatch(/border-radius:\s*var\(--radius-sm\)/);
    expect(ordinary).toMatch(/border-radius:\s*var\(--radius-[a-z]+\)/);
    for (const [name, declarations] of [['the compact size', compact], ['the ordinary size', ordinary]] as const) {
      expect(declarations, `${name} writes a radius of its own invention`).not.toMatch(/border-radius:\s*[\d.]+(px|rem|em|%)/);
    }
  });

  it('makes the compact one a square, so the rounding is read against a side and not a shape', () => {
    const compact = declarationsOf('.ui-icon-button--sm');

    expect(/width:\s*([^;]+)/.exec(compact)?.[1].trim()).toBe(/height:\s*([^;]+)/.exec(compact)?.[1].trim());
  });
});
