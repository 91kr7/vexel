/**
 * **A value that carries bad news** — `ui-library/specs/definition-list.md`, the
 * per-item `tone` the container detail's `Exit code` band is the first consumer
 * of (`…-tabs_composition_refactor/REQ-36`).
 *
 * The rule is narrow on purpose: *"a toned value differs by colour and by nothing
 * else"*. So the two halves are checked apart — the component marks the value the
 * caller asked for and nothing beside it, and the stylesheet's own rule declares
 * a colour and nothing beside it, taken from the product's danger role by name.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { DefinitionList } from '../../src/ui';

afterEach(cleanup);

const ITEMS = [
  { label: 'Started at', value: '2026-01-01T00:00:01Z' },
  { label: 'Exit code', value: '137', tone: 'danger' as const },
  { label: 'Finished at', value: '2026-01-02T00:00:00Z' },
];

function bands(container: HTMLElement) {
  return Array.from(container.querySelectorAll('.ui-definition-list__row')).map((row) => {
    const value = row.querySelector('.ui-definition-list__value')!;
    return {
      label: row.querySelector('.ui-definition-list__label')!.textContent,
      text: value.textContent,
      tone: value.className.split(' ').find((name) => name.startsWith('ui-definition-list__value--tone-')) ?? null,
    };
  });
}

describe('DefinitionList — the one value that carries bad news', () => {
  // definition-list.md — `tone?: 'danger'` on an item: the item asked for it is marked, and the
  // items beside it are drawn as they always were.
  it('marks the value it was asked to mark, and no other band with it', () => {
    const { container } = render(<DefinitionList items={ITEMS} />);

    expect(bands(container)).toEqual([
      { label: 'Started at', text: '2026-01-01T00:00:01Z', tone: null },
      { label: 'Exit code', text: '137', tone: 'ui-definition-list__value--tone-danger' },
      { label: 'Finished at', text: '2026-01-02T00:00:00Z', tone: null },
    ]);
  });

  // definition-list.md — "Nothing else about the band is conditional on it": the toned band is the
  // same structure as an untoned one, label and value alike.
  it('leaves the toned band structurally identical to an untoned one', () => {
    const { container } = render(<DefinitionList items={ITEMS} />);

    const rows = Array.from(container.querySelectorAll('.ui-definition-list__row'));
    const shapes = rows.map((row) => ({
      rowClasses: row.className,
      labelClasses: row.querySelector('.ui-definition-list__label')!.className,
      children: row.children.length,
    }));
    expect(new Set(shapes.map((shape) => JSON.stringify(shape))).size, 'the toned band is built differently from the bands beside it').toBe(1);
  });

  // definition-list.md — the same list drawn with the tone withheld differs only by that one class,
  // so a tone can add nothing else even by accident.
  it('draws the same markup without the tone as with it, but for the tone class itself', () => {
    const toned = render(<DefinitionList items={ITEMS} />).container.innerHTML;
    cleanup();
    const plain = render(<DefinitionList items={ITEMS.map(({ tone: _tone, ...rest }) => rest)} />).container.innerHTML;

    expect(toned.replace(' ui-definition-list__value--tone-danger', '')).toBe(plain);
  });

  // definition-list.md — "A toned value differs by colour and by nothing else… the product's own
  // danger role named from the tokens — never a colour written here."
  it('declares a colour and nothing else, taken from the danger role by name', () => {
    const stylesheet = readFileSync(join(process.cwd(), 'src', 'ui', 'data', 'data-table.css'), 'utf8');

    const rule = /\.ui-definition-list__value--tone-danger\s*\{([^}]*)\}/.exec(stylesheet);
    expect(rule, 'the stylesheet declares no rule for the toned value').not.toBeNull();
    const declarations = rule![1]!
      .split(';')
      .map((one) => one.trim())
      .filter(Boolean);
    expect(declarations, 'the toned value changes more than its colour').toEqual(['color: var(--color-danger)']);
  });
});
