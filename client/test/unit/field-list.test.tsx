import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Chip, FieldList } from '../../src/ui';

afterEach(cleanup);

/**
 * `FieldList` — the reading counterpart of the row editors
 * (`ui-library/specs/field-list.md`, `…-tabs_composition_refactor/REQ-54` … REQ-57).
 *
 * jsdom performs no layout, so what a share resolves to is measured in the browser
 * (`e2e/container-detail-config-reading.spec.ts`, where the environment's two fields and the
 * mounts' source/destination boundary are read off the real arrangement). What is pinned here is
 * everything that is not a number: the entry is the grid item and holds every field of it, the
 * accessible reading order is the declared one, a caption sits above its own value, the component
 * draws no control, and the half-entry cap is a **share** rather than a length.
 */

/** The style rules of the component's stylesheet, selector and declarations, comments stripped. */
function fieldListRules(): { selector: string; declarations: string }[] {
  const css = readFileSync(join(process.cwd(), 'src/ui/data/field-list.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((rule) => ({ selector: rule[1].trim(), declarations: rule[2] }));
}

describe('FieldList — the entry is the grid item and holds every field of it', () => {
  // field-list.md — "One entry per item, in the declared order […] inside an entry, one field per
  // part, side by side in the declared order." The fields are never placed in tracks of the *list*:
  // a `display: contents` or subgrid arrangement over them reads column-first to assistive
  // technology and comes apart the moment one value wraps.
  it('draws one entry per item and one field per part, in the declared order', () => {
    const { container } = render(
      <FieldList
        items={[
          { fields: [{ value: 'PATH' }, { value: '/usr/bin' }] },
          { fields: [{ value: 'NODE_ENV' }, { value: 'production' }] },
        ]}
      />,
    );

    const entries = Array.from(container.querySelectorAll('.ui-field-list__entry'));
    expect(entries, 'the list does not draw one entry per item').toHaveLength(2);
    expect(
      entries.map((entry) => Array.from(entry.querySelectorAll('.ui-field-list__field')).map((field) => field.textContent)),
      'the fields of an entry are not the parts declared for it, in that order',
    ).toEqual([
      ['PATH', '/usr/bin'],
      ['NODE_ENV', 'production'],
    ]);
  });

  // field-list.md — "The accessible reading order is the declared order — caption then its own
  // value, field after field, entry after entry."
  it('hands assistive technology the declared order: caption, its own value, field after field', () => {
    const { container } = render(
      <FieldList
        items={[
          { fields: [{ caption: 'Source', value: '/srv/config' }, { caption: 'Destination', value: '/etc/app' }] },
          { fields: [{ caption: 'Source', value: 'app-data' }, { caption: 'Destination', value: '/var/lib/app' }] },
        ]}
      />,
    );

    expect(container.textContent).toBe('Source/srv/configDestination/etc/appSourceapp-dataDestination/var/lib/app');
  });

  // field-list.md — "`caption?` names what a field holds and is drawn above its value". A field
  // without one is its value alone: "Omitted where the value names itself."
  it('draws a caption above its own value, and nothing at all where none is stated', () => {
    const { container } = render(
      <FieldList items={[{ fields: [{ caption: 'Container port', value: '5000/tcp' }, { value: 'bare' }] }]} />,
    );

    const fields = Array.from(container.querySelectorAll('.ui-field-list__field'));
    expect(fields[0].firstElementChild?.textContent, 'the caption is not the first thing in its own field').toBe('Container port');
    expect(fields[0].lastElementChild?.textContent, 'the value does not follow its caption').toBe('5000/tcp');
    expect(fields[1].querySelector('.ui-field-list__caption'), 'a field with no caption stated is given one anyway').toBeNull();
    expect(fields[1].textContent).toBe('bare');
  });

  // field-list.md — "A value lays its own children out with a `--space-1` gap: `value` is a
  // `ReactNode`, so a value composed of a text node and a `Chip` […] is a thing this component
  // contracts to lay out."
  it('lays out a value composed of a text node and a chip inside one field', () => {
    const { container } = render(
      <FieldList
        items={[
          {
            fields: [
              { caption: 'Source', value: '/srv/config' },
              {
                caption: 'Destination',
                value: (
                  <>
                    {'/etc/app'}
                    <Chip label="ro" tone="accent" />
                  </>
                ),
              },
            ],
          },
        ]}
      />,
    );

    const destination = Array.from(container.querySelectorAll('.ui-field-list__field'))[1];
    expect(destination.querySelector('.ui-chip')?.textContent, 'the chip is not drawn inside the field whose value carries it').toBe('ro');
    expect(destination.querySelector('.ui-field-list__value')?.textContent).toBe('/etc/appro');
  });

  // field-list.md — "It draws no control and takes no callback. Reading is not editing: the shape
  // is the form's, the affordances are not — no input border, no focus ring, nothing to press."
  it('draws no control of any kind', () => {
    render(<FieldList items={[{ fields: [{ caption: 'Key', value: 'PATH' }, { caption: 'Value', value: '/usr/bin' }] }]} />);

    expect(screen.queryAllByRole('button'), 'the reading list draws something to press').toHaveLength(0);
    expect(screen.queryAllByRole('textbox'), 'the reading list draws an input').toHaveLength(0);
    expect(document.querySelectorAll('input, textarea, select, button'), 'the reading list draws a control').toHaveLength(0);
  });

  // field-list.md — "A caller states what its entries hold and which named arrangement it asks for,
  // and nothing else about the layout": no count, no track template, no length, no share. The two
  // named arrangements are therefore the only thing that distinguishes one list from another.
  it('takes the even arrangement by default and the named one when it is asked for', () => {
    const { container, rerender } = render(<FieldList items={[{ fields: [{ value: 'one' }] }]} />);
    expect(container.firstElementChild?.className, 'the default arrangement is not the even one').toMatch(/ui-field-list--even/);

    rerender(<FieldList arrangement="content" items={[{ fields: [{ value: 'one' }] }]} />);
    expect(container.firstElementChild?.className, 'the content arrangement is not the one asked for').toMatch(/ui-field-list--content/);

    // No length, no count and no template reaches the element: the caller cannot know the width it
    // will be given (plan-docker_management_app-detail_property_columns/REQ-27).
    expect((container.firstElementChild as HTMLElement).getAttribute('style'), 'the list carries a style of its own').toBeNull();
  });
});

describe('FieldList — no field of an entry is wider than half of it (REQ-57)', () => {
  // field-list.md — "The cap is a share of the entry, never a length: no measurement, no pixel
  // value in the component and none at the call site." What the cap resolves to is measured in the
  // browser; that it is expressed as a share is decided here, since a length would pass the same
  // measurement at one width and fail at every other.
  it('expresses the cap as a share and never as a length', () => {
    const capped = fieldListRules().filter((rule) => /max-width/.test(rule.declarations));

    expect(capped.length, 'the stylesheet caps no field at all').toBeGreaterThan(0);
    for (const rule of capped) {
      const value = /max-width:\s*([^;]+)/.exec(rule.declarations)?.[1].trim() ?? '';
      expect(value, `"${rule.selector}" caps a field at ${value}, which is a length rather than a share of its entry`).toMatch(/^\d+(\.\d+)?%$/);
      expect(Number.parseFloat(value), `"${rule.selector}" caps a field at ${value} rather than at half its entry`).toBe(50);
    }
  });

  // field-list.md — "A field that is the only field of its entry is not capped, and takes the entry
  // whole: with no sibling there is no boundary to align, and half a row of wash beside half a row
  // of nothing is the hole a field exists to prevent."
  it('leaves a lone field uncapped', () => {
    for (const rule of fieldListRules().filter((one) => /max-width/.test(one.declarations))) {
      expect(rule.selector, `"${rule.selector}" caps every field, a lone one included`).toMatch(/:not\(:only-child\)/);
    }
  });
});
