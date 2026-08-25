/**
 * F5 — one action cluster, and the rule is in the API
 * (`plan-ui-coherence-optimisation/REQ-27`, `REQ-28`).
 *
 * A caller declares **actions and their weight**; what each becomes — a filled
 * control, a quiet one, a red one, an entry of the trailing menu — is the
 * cluster's decision. The requirement is that a screen cannot re-answer it, so
 * what is asserted here is as much what the API refuses as what it renders:
 * there is no weight that produces unadorned text (a type-level check, caught
 * by `npm run test:typecheck -w client`), and an action too quiet for a button
 * becomes a menu entry rather than losing its affordance.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionButtonGroup, type RowAction } from '../../src/ui';

afterEach(cleanup);

const OVERFLOW_LABEL = 'More actions for web-1';

function button(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

/**
 * The labels of the cluster's buttons, the overflow trigger excluded: the
 * trigger is named rather than labelled, so it is recognised by its accessible
 * name and not by the text it draws.
 */
function buttonNames(): string[] {
  const trigger = screen.queryByRole('button', { name: OVERFLOW_LABEL });
  return screen
    .getAllByRole('button')
    .filter((control) => control !== trigger)
    .map((control) => control.textContent ?? '');
}

async function menuEntryNames(): Promise<string[]> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: OVERFLOW_LABEL }));
  return screen.getAllByRole('menuitem').map((entry) => entry.textContent ?? '');
}

describe('ActionButtonGroup — a weight, never an appearance (REQ-27)', () => {
  // action-button-group.md — `'primary'` is the filled control of the cluster
  it('renders a primary-weight action as the filled control', () => {
    render(<ActionButtonGroup actions={[{ id: 'use', label: 'use', weight: 'primary', onClick: vi.fn() }]} />);

    expect(button('use').className).toContain('ui-button--primary');
  });

  // action-button-group.md — `'secondary'` is the quiet control, and the default
  it('renders a secondary-weight action as the quiet control, which is also the default', () => {
    const { unmount } = render(
      <ActionButtonGroup actions={[{ id: 'stop', label: 'Stop', weight: 'secondary', onClick: vi.fn() }]} />,
    );
    const stated = button('Stop').className;
    unmount();

    render(<ActionButtonGroup actions={[{ id: 'stop', label: 'Stop', onClick: vi.fn() }]} />);

    expect(button('Stop').className).toBe(stated);
    expect(stated).not.toContain('ui-button--primary');
    expect(stated).not.toContain('ui-button--destructive');
  });

  // action-button-group.md — `'destructive'` is the red-tinted control
  it('renders a destructive-weight action as the red-tinted control', () => {
    render(<ActionButtonGroup actions={[{ id: 'remove', label: 'Remove', weight: 'destructive', onClick: vi.fn() }]} />);

    expect(button('Remove').className).toContain('ui-button--destructive');
  });

  // action-button-group.md — "`destructive?: boolean` — the same statement in the shape the
  // delivered call sites use; equivalent to `weight: 'destructive'`"
  it('treats the destructive flag as that same weight', () => {
    const { unmount } = render(
      <ActionButtonGroup actions={[{ id: 'remove', label: 'Remove', weight: 'destructive', onClick: vi.fn() }]} />,
    );
    const byWeight = button('Remove').className;
    unmount();

    render(<ActionButtonGroup actions={[{ id: 'remove', label: 'Remove', destructive: true, onClick: vi.fn() }]} />);

    expect(button('Remove').className).toBe(byWeight);
  });

  // action-button-group.md — "and ignored when `weight` is given"
  it('lets the stated weight win over the destructive flag', () => {
    render(
      <ActionButtonGroup
        actions={[{ id: 'use', label: 'use', weight: 'primary', destructive: true, onClick: vi.fn() }]}
      />,
    );

    expect(button('use').className).toContain('ui-button--primary');
    expect(button('use').className).not.toContain('ui-button--destructive');
  });

  // action-button-group.md — "Bare text is never a control. There is no weight that renders as
  // unadorned text": every weight above produces a Button or a Menu entry
  it('makes a control of every action it renders', async () => {
    render(
      <ActionButtonGroup
        actions={[
          { id: 'use', label: 'use', weight: 'primary', onClick: vi.fn() },
          { id: 'attach', label: '+ Attach', weight: 'secondary', onClick: vi.fn() },
          { id: 'remove', label: 'Remove', weight: 'destructive', onClick: vi.fn() },
          { id: 'rename', label: 'Rename…', weight: 'overflow', onClick: vi.fn() },
        ]}
        overflow={{ label: OVERFLOW_LABEL }}
      />,
    );

    expect(buttonNames()).toEqual(['use', '+ Attach', 'Remove']);
    expect(await menuEntryNames()).toEqual(['Rename…']);
  });

  // action-button-group.md — there is no weight that renders as unadorned text, and the type is
  // where that is stated: `'text'` is not one of the four
  it('offers no weight that renders as unadorned text', () => {
    const action: RowAction = {
      id: 'add-variable',
      label: 'Add variable',
      onClick: vi.fn(),
      // @ts-expect-error — the weights are primary, secondary, destructive and overflow: an action
      // too quiet for a button becomes an overflow entry, never bare text.
      weight: 'text',
    };

    expect(action.weight).toBe('text');
  });
});

describe('ActionButtonGroup — the overflow menu (REQ-27)', () => {
  const overflowAction: RowAction = { id: 'rename', label: 'Rename…', weight: 'overflow', onClick: vi.fn() };

  // action-button-group.md — an overflow-weight action is "not a button at all: an entry of the
  // trailing overflow menu"
  it('renders an overflow-weight action as a menu entry rather than a button', async () => {
    render(<ActionButtonGroup actions={[overflowAction]} overflow={{ label: OVERFLOW_LABEL }} />);

    expect(buttonNames()).toEqual([]);
    expect(await menuEntryNames()).toEqual(['Rename…']);
  });

  // action-button-group.md — "appended after any entries stated directly in `overflow.entries`"
  it('appends the demoted actions after the entries stated directly', async () => {
    render(
      <ActionButtonGroup
        actions={[overflowAction]}
        overflow={{
          label: OVERFLOW_LABEL,
          entries: [{ id: 'export', label: 'Export filesystem…', onSelect: vi.fn() }],
        }}
      />,
    );

    expect(await menuEntryNames()).toEqual(['Export filesystem…', 'Rename…']);
  });

  // action-button-group.md — the demoted entry carries "its own disabled state and reason"
  it('carries the demoted action’s disabled state into the menu', async () => {
    const onClick = vi.fn();
    render(
      <ActionButtonGroup
        actions={[
          { id: 'rename', label: 'Rename…', weight: 'overflow', disabled: true, disabledReason: 'not while running', onClick },
        ]}
        overflow={{ label: OVERFLOW_LABEL }}
      />,
    );
    await menuEntryNames();

    // menu.md — a disabled entry is inert and stated as disabled, its reason shown on the entry.
    const entry = screen.getByRole('menuitem');
    expect(entry.getAttribute('aria-disabled')).toBe('true');
    expect(entry.getAttribute('title')).toBe('not while running');
    await userEvent.setup().click(entry);
    expect(onClick).not.toHaveBeenCalled();
  });

  // action-button-group.md — an overflow-weight action with no menu to go to is not rendered.
  it('renders nothing at all for an overflow-weight action with no menu to go to', () => {
    render(
      <ActionButtonGroup
        actions={[{ id: 'stop', label: 'Stop', onClick: vi.fn() }, overflowAction]}
      />,
    );

    expect(buttonNames()).toEqual(['Stop']);
    expect(screen.queryByText('Rename…')).toBeNull();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  // action-button-group.md — "The overflow control, when present, is always the trailing slot: it
  // is never the control that moves as the actions before it change."
  it('keeps the overflow trigger the trailing slot whatever precedes it', () => {
    render(
      <ActionButtonGroup
        actions={[
          { id: 'start', label: 'Start', onClick: vi.fn() },
          { id: 'stop', label: 'Stop', onClick: vi.fn() },
        ]}
        overflow={{ label: OVERFLOW_LABEL }}
      />,
    );

    const group = document.querySelector('.ui-action-button-group') as HTMLElement;
    const trigger = screen.getByRole('button', { name: OVERFLOW_LABEL });
    expect(group.lastElementChild?.contains(trigger)).toBe(true);
  });

  // action-button-group.md — "omitting it leaves the group exactly as it was"
  it('renders no trigger when no overflow menu is stated', () => {
    render(<ActionButtonGroup actions={[{ id: 'stop', label: 'Stop', onClick: vi.fn() }]} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('ActionButtonGroup — the cluster’s own behaviour (REQ-27)', () => {
  // action-button-group.md — "Stops click-event propagation, so a click on any action button — or
  // on the overflow trigger — never also triggers a containing `DataTable` row's `onRowSelect`."
  it('never lets an action’s click reach the row containing it', async () => {
    const user = userEvent.setup();
    const onRowSelect = vi.fn();
    const onClick = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={onRowSelect}>
        <ActionButtonGroup actions={[{ id: 'stop', label: 'Stop', onClick }]} overflow={{ label: OVERFLOW_LABEL }} />
      </div>,
    );

    await user.click(button('Stop'));
    await user.click(screen.getByRole('button', { name: OVERFLOW_LABEL }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onRowSelect).not.toHaveBeenCalled();
  });

  // action-button-group.md — the group stays on a single row however many actions it holds.
  it('states, in its own stylesheet, that it never wraps to a second line', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'ui', 'controls', 'controls.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const body = new RegExp('(?:^|\\}|\\*/)\\s*\\.ui-action-button-group\\s*\\{([^}]*)\\}').exec(css)?.[1] ?? '';

    expect(body).toMatch(/flex-wrap:\s*nowrap/);
  });
});

// action-button-group.md — `segmented` draws the cluster as one control, appearance only
// (plan-docker_management_app-containers_card_view/REQ-4).
describe('ActionButtonGroup — the segmented variant (containers_card_view/REQ-4)', () => {
  const ACTIONS: RowAction[] = [
    { id: 'pause', label: 'Pause', onClick: vi.fn() },
    { id: 'restart', label: 'Restart', onClick: vi.fn() },
  ];

  it('renders the same controls, in the same order, whether it is segmented or not', () => {
    const { container: plain, unmount } = render(<ActionButtonGroup actions={ACTIONS} overflow={{ label: OVERFLOW_LABEL }} />);
    const plainLabels = Array.from(plain.querySelectorAll('button')).map((control) => control.textContent?.trim());
    const plainDisabled = Array.from(plain.querySelectorAll('button')).map((control) => (control as HTMLButtonElement).disabled);
    unmount();

    const { container: segmented } = render(<ActionButtonGroup segmented actions={ACTIONS} overflow={{ label: OVERFLOW_LABEL }} />);
    const segmentedControls = Array.from(segmented.querySelectorAll('button'));

    expect(segmentedControls.map((control) => control.textContent?.trim())).toEqual(plainLabels);
    expect(segmentedControls.map((control) => (control as HTMLButtonElement).disabled)).toEqual(plainDisabled);
  });

  it('marks the cluster as one segmented control, with one segment per slot', () => {
    const { container } = render(<ActionButtonGroup segmented actions={ACTIONS} overflow={{ label: OVERFLOW_LABEL }} />);

    const group = container.querySelector('.ui-action-button-group')!;
    expect(group.className).toContain('ui-action-button-group--segmented');
    expect(group.querySelectorAll('.ui-action-button-group__segment')).toHaveLength(3);
  });

  it('leaves a cluster asked for no segmentation exactly as it was', () => {
    const { container } = render(<ActionButtonGroup actions={ACTIONS} overflow={{ label: OVERFLOW_LABEL }} />);

    const group = container.querySelector('.ui-action-button-group')!;
    expect(group.className).toBe('ui-action-button-group');
    expect(group.querySelectorAll('.ui-action-button-group__segment')).toHaveLength(0);
  });

  // REQ-4 — one boundary with internal dividers: no gap, one shared hairline, the corners the cluster's.
  it('states the shared boundary and its internal dividers in the stylesheet', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'ui', 'controls', 'controls.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // The whole prelude, compared as written: a selector of this block carries `:is(a, b)`, whose
    // comma is not a selector-list separator.
    const declarationsOf = (selector: string): string =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((rule) => rule[1].trim().replace(/\s+/g, ' ') === selector)
        .map((rule) => rule[2])
        .join(' ');

    expect(declarationsOf('.ui-action-button-group--segmented'), 'the slots still stand apart').toMatch(/gap:\s*0/);
    expect(
      declarationsOf('.ui-action-button-group__segment + .ui-action-button-group__segment'),
      'two neighbouring slots draw two borders instead of sharing one',
    ).toMatch(/margin-inline-start:\s*calc\(-1 \* var\(--border-width-hairline\)\)/);
    expect(declarationsOf('.ui-action-button-group__segment :is(.ui-button, .ui-menu__trigger)')).toMatch(/border-radius:\s*0/);
    expect(declarationsOf('.ui-action-button-group__segment:first-child :is(.ui-button, .ui-menu__trigger)')).toMatch(/radius/);
    expect(declarationsOf('.ui-action-button-group__segment:last-child :is(.ui-button, .ui-menu__trigger)')).toMatch(/radius/);
  });
});

// action-button-group.md — `size` decides how large the controls are drawn and nothing else
// (plan-docker_management_app-containers_card_view/REQ-4, REQ-30).
describe('ActionButtonGroup — the control size (containers_card_view/REQ-4)', () => {
  const SIZED: RowAction[] = [
    { id: 'pause', label: 'Pause', onClick: vi.fn() },
    { id: 'restart', label: 'Restart', onClick: vi.fn(), disabled: true, disabledReason: 'not running' },
  ];

  it('draws a cluster that asks for nothing at the list-row density, as every delivered call site does', () => {
    const { container } = render(<ActionButtonGroup actions={SIZED} overflow={{ label: OVERFLOW_LABEL }} />);

    for (const button of container.querySelectorAll('.ui-button')) {
      expect(button.className, 'a delivered call site changed size when the prop arrived').toContain('ui-button--sm');
    }
  });

  it('draws the ordinary button size when it is asked for', () => {
    const { container } = render(<ActionButtonGroup size="md" actions={SIZED} overflow={{ label: OVERFLOW_LABEL }} />);

    for (const button of container.querySelectorAll('.ui-button')) {
      expect(button.className).not.toContain('ui-button--sm');
    }
  });

  // "Size only: the actions, their order, their positions, their legality and the overflow menu are
  // untouched, and it is not a way to ask for an appearance."
  it('changes nothing but the size: same controls, same order, same legality, same reasons', () => {
    const read = (element: HTMLElement) =>
      Array.from(element.querySelectorAll('button')).map((control) => ({
        label: control.textContent?.trim(),
        disabled: (control as HTMLButtonElement).disabled,
        described: control.getAttribute('aria-describedby') !== null,
        weight: /ui-button--(primary|danger|ghost|secondary)/.exec(control.className)?.[1] ?? null,
      }));

    const { container: small, unmount } = render(<ActionButtonGroup actions={SIZED} overflow={{ label: OVERFLOW_LABEL }} />);
    const asSmall = read(small);
    unmount();

    const { container: medium } = render(<ActionButtonGroup size="md" actions={SIZED} overflow={{ label: OVERFLOW_LABEL }} />);
    expect(read(medium)).toEqual(asSmall);
  });

  // action-button-group.md — the group owns the slots' height; the measured heights are in
  // `e2e/containers-card-geometry.spec.ts`.
  it('resolves every slot to the group’s own height rather than to each member’s content', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'ui', 'controls', 'controls.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const declarationsOf = (selector: string): string =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((rule) => rule[1].trim().replace(/\s+/g, ' ') === selector)
        .map((rule) => rule[2])
        .join(' ');

    expect(
      declarationsOf('.ui-action-button-group--segmented'),
      'each slot is left to derive its own height, so the cluster shares no boundary',
    ).toMatch(/align-items:\s*stretch/);
    expect(declarationsOf('.ui-action-button-group__segment'), 'a slot states a height of its own').not.toMatch(
      /(^|;|\s)(height|min-height)\s*:/,
    );
  });
});
