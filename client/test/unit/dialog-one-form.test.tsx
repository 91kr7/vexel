/**
 * F19 — a dialog is one form, not boxes inside boxes
 * (`plan-ui-coherence-optimisation/REQ-78`, `REQ-79`, `REQ-80`).
 *
 * What a requirement about **vertical extent** finally comes down to is a
 * measurement in a browser, and that is `e2e/dialog-one-form.spec.ts`'s: jsdom
 * lays nothing out, so nothing here claims a height. What can be settled here is
 * the mechanism the measurement depends on — which element states the group's
 * heading, which rule states the field label's treatment, and which component
 * the add affordances are — each read from the component specs rather than from
 * the rendered result.
 *
 * The declarations are read out of the stylesheets for the same reason the
 * neighbouring unit files do it: the library is the only place a treatment may
 * be declared, so a treatment that came back would come back there.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chip, ChipGroup, ChipInput, FormField, FormSection, KeyValueEditor, RepeatableRowList } from '../../src/ui';

afterEach(cleanup);

function rules(area: string, file: string): Map<string, string> {
  const css = readFileSync(join(process.cwd(), 'src', 'ui', area, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // The prelude's own whitespace is collapsed, so a rule written over two lines is looked up the
  // way it reads rather than the way it happens to be wrapped.
  return new Map(
    [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((rule) => [rule[1].replace(/\s+/g, ' ').trim(), rule[2]] as const),
  );
}

function ruleBody(area: string, file: string, selector: string): string {
  const body = rules(area, file).get(selector);
  if (body === undefined) throw new Error(`no CSS rule for ${selector}`);
  return body;
}

function declaration(body: string, property: string): string | undefined {
  return new RegExp(`(?:^|;)\\s*${property}\\s*:([^;]*)`)
    .exec(body)?.[1]
    .trim();
}

/** Every source file of the library: the only place a class or a treatment may be declared at all. */
function libraryFiles(directory = join(process.cwd(), 'src', 'ui')): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? libraryFiles(path) : /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

function libraryFilesNaming(text: string): string[] {
  return libraryFiles()
    .filter((path) => readFileSync(path, 'utf8').includes(text))
    .map((path) => path.slice(process.cwd().length + 1).split('\\').join('/'))
    .sort();
}

describe('FormSection — a field group is not a card (REQ-78)', () => {
  // form-section.md — "A field group is not a card. It draws no border, no background, no radius
  // and no inset of its own": the whole of the ~42px of chrome the sheet paid ten times over.
  it('draws no border, no background, no radius and no inset of its own', () => {
    const group = ruleBody('controls', 'controls.css', '.ui-form-section');

    for (const property of ['padding', 'border', 'border-radius', 'background']) {
      expect(declaration(group, property), `.ui-form-section still declares ${property}`).toBeUndefined();
    }
  });

  // form-section.md — "a group is separated from the next by its heading and by a step wider than
  // the one between two fields of the same group … That step is the group's own, not the shell's"
  it('carries the step between two groups itself, in a spacing token', () => {
    const step = declaration(ruleBody('controls', 'controls.css', '.ui-form-section + .ui-form-section'), 'margin-top');

    expect(step, 'nothing separates one group from the next once the boxes are gone').toBeDefined();
    expect(step).toMatch(/^var\(--space-\d+\)$/);
  });

  // form-section.md — "The heading is the product's one section header, not a treatment this
  // component declares", in its group (`eyebrow`) treatment
  it('states its heading through the section-header primitive, in the group treatment', () => {
    render(
      <FormSection title="Image and identity">
        <FormField label="Image">
          <input aria-label="Image reference" />
        </FormField>
      </FormSection>,
    );

    const header = document.querySelector('.ui-section-header') as HTMLElement | null;
    expect(header, 'the group states its heading itself rather than through the one primitive').not.toBeNull();
    expect(header!.className).toContain('ui-section-header--eyebrow');
    expect(document.querySelector('.ui-section-header__title')!.textContent).toBe('Image and identity');
  });

  // form-section.md — "`description?` — one line under the heading, the header's own description
  // line": the group states no second line of its own
  it('states the description as the header’s own line', () => {
    render(<FormSection title="Entrypoint and command" description="Left empty, the image's own values are kept." />);

    expect(document.querySelector('.ui-section-header__description')!.textContent).toBe(
      "Left empty, the image's own values are kept.",
    );
    expect(document.querySelector('.ui-form-section__description')).toBeNull();
  });

  // form-section.md — "there is no rule anywhere carrying a form-section title type. A form does
  // not add a fourth way of titling something."
  it('leaves no field-group title treatment declared anywhere in the library', () => {
    expect(libraryFilesNaming('ui-form-section__title'), 'a field-group title treatment survives').toEqual([]);
    expect(libraryFilesNaming('ui-form-section__description'), 'a field-group description treatment survives').toEqual(
      [],
    );
  });

  // form-section.md — "The section is always expanded: it groups, it never hides"
  it('shows the fields it groups, without an affordance that hides them', () => {
    render(
      <FormSection title="Ports">
        <FormField label="Published ports">
          <input aria-label="Container port 1" />
        </FormField>
      </FormSection>,
    );

    expect(screen.getByLabelText('Container port 1')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('FormField — the one label treatment (REQ-79)', () => {
  // form-field.md — "it declares no uppercasing and no letter-spacing, the two properties that used
  // to make `IMAGE`, `ENTRYPOINT` and `COMMAND` read as headings of sections that do not exist"
  it('declares no uppercasing, no letter-spacing and no weight of its own', () => {
    const label = ruleBody('controls', 'controls.css', '.ui-form-field__label');

    for (const property of ['text-transform', 'letter-spacing', 'font-weight']) {
      expect(declaration(label, property), `.ui-form-field__label still declares ${property}`).toBeUndefined();
    }
    // …and it stays small and quiet, which is the half of the treatment that remains.
    expect(declaration(label, 'font-size')).toBe('var(--font-size-xs)');
    expect(declaration(label, 'color')).toBe('var(--color-text-muted)');
  });

  // form-field.md — "The label carries the product's one label treatment, and it is not a section
  // header's": the group heading above it is the treatment it must not be confused with.
  it('is not the group heading’s treatment', () => {
    const label = ruleBody('controls', 'controls.css', '.ui-form-field__label');
    const eyebrow = ruleBody('glass', 'section-header.css', '.ui-section-header--eyebrow .ui-section-header__title');

    expect(declaration(eyebrow, 'text-transform'), 'the group heading no longer states a case of its own').toBe(
      'uppercase',
    );
    expect(declaration(label, 'text-transform')).toBeUndefined();
    expect(declaration(label, 'letter-spacing')).not.toBe(declaration(eyebrow, 'letter-spacing'));
  });

  // form-field.md — "every field states its label, and the control keeps its own accessible name",
  // and the label is drawn in the case it was written in
  it('states its label and leaves the control its own accessible name', () => {
    render(
      <FormField label="Image" hint="Pick a local image or type any reference.">
        <input aria-label="Image reference" />
      </FormField>,
    );

    expect(document.querySelector('.ui-form-field__label')!.textContent).toBe('Image');
    expect(screen.getByLabelText('Image reference')).toBeInTheDocument();
  });

  // form-field.md — "At most one message line is shown: `error` replaces `hint`": the validation
  // behaviour REQ-79 requires every field to keep
  it('replaces the hint with the validation message when the field is invalid', () => {
    render(
      <FormField label="Image" hint="Pick a local image or type any reference." error="An image reference is required.">
        <input aria-label="Image reference" />
      </FormField>,
    );

    expect(screen.getByText('An image reference is required.')).toBeInTheDocument();
    expect(screen.queryByText('Pick a local image or type any reference.')).not.toBeInTheDocument();
  });
});

describe('The add affordances are controls (REQ-80)', () => {
  // The evidence the computed-style claim in the e2e check rests on: the library's own button paints
  // a border and a surface, and `ghost` — what these affordances used to be — paints neither, which
  // is what left `Add variable` a word at the end of a list.
  it('the library’s button paints a border and a surface, and its ghost variant paints neither', () => {
    const button = ruleBody('controls', 'controls.css', '.ui-button');
    const ghost = ruleBody('controls', 'controls.css', '.ui-button--ghost');

    expect(declaration(button, 'border')).toMatch(/var\(--border-width-hairline\)\s+solid\s+var\(--color-[a-z0-9-]+\)/);
    expect(declaration(button, 'background')).toMatch(/^var\(--color-[a-z0-9-]+\)$/);
    expect(declaration(ghost, 'background')).toBe('transparent');
    expect(declaration(ghost, 'border-color')).toBe('transparent');
  });

  // key-value-editor.md — "The add action is a control and is drawn as one: it carries the border
  // and the surface every other button in the product carries."
  it('the key/value editor’s add action is the ordinary bordered button', () => {
    render(<KeyValueEditor pairs={[]} onChange={vi.fn()} addLabel="Add variable" />);

    const add = screen.getByRole('button', { name: 'Add variable' });
    expect(add.className).toContain('ui-button');
    expect(add.className, '`Add variable` is still drawn with neither a border nor a fill').not.toContain(
      'ui-button--ghost',
    );
  });

  // repeatable-row-list.md — the same rule, on the affordance the requirement names beside it
  it('the repeatable row list’s add action is the ordinary bordered button', () => {
    render(
      <RepeatableRowList
        items={[]}
        onChange={vi.fn()}
        createItem={() => ({ port: '' })}
        renderRow={(item) => <input aria-label="Container port 1" value={item.port} readOnly />}
        addLabel="Add port mapping"
      />,
    );

    const add = screen.getByRole('button', { name: 'Add port mapping' });
    expect(add.className).toContain('ui-button');
    expect(add.className, '`Add port mapping` is still drawn with neither a border nor a fill').not.toContain(
      'ui-button--ghost',
    );
  });

  // chip-input.md / REQ-80 — the third affordance that adds a value to a field
  it('the chip input’s add action is the ordinary bordered button', () => {
    render(<ChipInput values={[]} onChange={vi.fn()} ariaLabel="Network name" addLabel="Add" />);

    const add = screen.getByRole('button', { name: 'Add' });
    expect(add.className).toContain('ui-button');
    expect(add.className).not.toContain('ui-button--ghost');
  });

  // chip.md — "The trailing add affordance is the library's own button, not an outline of its own
  // invention", and the dashed pill it used to be is gone from the library entirely
  it('the chip group’s add affordance is the library’s button, the dashed pill being gone', () => {
    render(<ChipGroup items={[]} addLabel="Add tag" onAdd={vi.fn()} />);

    const add = screen.getByRole('button', { name: 'Add tag' });
    expect(add.className).toContain('ui-button');
    expect(add.className).not.toContain('ui-button--ghost');
    expect(libraryFilesNaming('ui-chip-group__add'), 'the bespoke dashed pill survives in the library').toEqual([]);
  });

  // key-value-editor.md — "It is sized by its own label rather than stretched across the editor",
  // and repeatable-row-list.md states the same for its own
  it('is sized by its label rather than stretched across the editor', () => {
    const alignment = declaration(
      ruleBody('controls', 'controls.css', '.ui-key-value-editor > .ui-button, .ui-repeatable-row-list > .ui-button'),
      'align-self',
    );

    expect(alignment, 'the add affordance is stretched across the editor it closes').toBe('flex-start');
  });

  // key-value-editor.md / repeatable-row-list.md — "Each still adds the row it adds": the change is
  // to how the affordance is drawn and to nothing else.
  it('still appends exactly one row, in both editors', async () => {
    const user = userEvent.setup();
    const onPairs = vi.fn();
    const { unmount } = render(<KeyValueEditor pairs={[{ key: 'A', value: '1' }]} onChange={onPairs} addLabel="Add variable" />);
    await user.click(screen.getByRole('button', { name: 'Add variable' }));
    expect(onPairs).toHaveBeenCalledWith([
      { key: 'A', value: '1' },
      { key: '', value: '' },
    ]);
    unmount();

    const onRows = vi.fn();
    render(
      <RepeatableRowList
        items={[{ port: '80' }]}
        onChange={onRows}
        createItem={() => ({ port: '' })}
        renderRow={(item, index) => <input aria-label={`Container port ${index + 1}`} value={item.port} readOnly />}
        addLabel="Add port mapping"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Add port mapping' }));
    expect(onRows).toHaveBeenCalledWith([{ port: '80' }, { port: '' }]);
  });
});

describe('Chip — the inline action is a filled control (REQ-80)', () => {
  // chip.md — "A chip's inline action is a control and is drawn as one: it carries a surface and a
  // shape of its own inside the chip", and "The action is filled rather than outlined" so that the
  // chip is exactly as tall with it as without.
  it('carries a surface and a shape, and no edge that would make it taller than its line', () => {
    const action = ruleBody('controls', 'controls.css', '.ui-chip__action');

    expect(declaration(action, 'background'), 'the inline action paints no surface at all').not.toBe('transparent');
    expect(declaration(action, 'background')).toMatch(/^var\(--color-[a-z0-9-]+\)$/);
    expect(declaration(action, 'border-radius')).toBeDefined();
    expect(declaration(action, 'border'), 'an outlined action is taller than the line it sits on').toBe('none');
    // The padding it gained is horizontal only, which is the same statement in the other axis.
    expect(declaration(action, 'padding')).toMatch(/^0\s/);
    expect(declaration(action, 'font')).toBe('inherit');
  });

  // chip.md — "a chip's inline action → calls that chip's `onAction`": what it is drawn like changed,
  // what it does did not.
  it('still calls the chip’s own action', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Chip label="web-frontend" actionLabel="detach" onAction={onAction} />);

    await user.click(screen.getByRole('button', { name: 'detach' }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
