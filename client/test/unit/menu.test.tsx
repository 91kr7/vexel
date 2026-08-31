import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Menu, type MenuEntry } from '../../src/ui';

afterEach(cleanup);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const LABEL = 'More actions for web-1';

/** Four entries shaped like the ones the first consumer passes: two plain, then a separated destructive pair. */
function makeEntries(overrides: Partial<Record<string, Partial<MenuEntry>>> = {}): MenuEntry[] {
  const base: MenuEntry[] = [
    { id: 'rename', label: 'Rename…', onSelect: vi.fn() },
    { id: 'export', label: 'Export filesystem…', onSelect: vi.fn() },
    { id: 'kill', label: 'Kill', hint: 'SIGKILL', destructive: true, separated: true, onSelect: vi.fn() },
    { id: 'remove', label: 'Remove', hint: 'rm', destructive: true, onSelect: vi.fn() },
  ];
  return base.map((entry) => ({ ...entry, ...(overrides[entry.id] ?? {}) }));
}

function trigger(label = LABEL) {
  return screen.getByRole('button', { name: label });
}

function items() {
  return screen.getAllByRole('menuitem');
}

/** A box for an element jsdom measures as nothing: a placement is only observable against one. */
function pinBox(element: Element, box: { top: number; left: number; width: number; height: number }): void {
  const rect = {
    x: box.left,
    y: box.top,
    top: box.top,
    left: box.left,
    right: box.left + box.width,
    bottom: box.top + box.height,
    width: box.width,
    height: box.height,
  };
  element.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect;
}

/** Where the popup has been placed, in the viewport coordinates it carries. */
function popupPosition(): { top: number; left: number } {
  const popup = screen.getByRole('menu').closest('.ui-menu__popup');
  expect(popup, 'the open menu carries no popup').not.toBeNull();
  const { top, left } = (popup as HTMLElement).style;
  return { top: Number.parseFloat(top), left: Number.parseFloat(left) };
}

/** Scroll handling registered on the window and not yet taken back. */
function watchScrollRegistrations(): { inPlace: () => number } {
  const added = vi.spyOn(window, 'addEventListener');
  const removed = vi.spyOn(window, 'removeEventListener');
  const scrolls = (spy: typeof added) => spy.mock.calls.filter(([type]) => type === 'scroll').length;
  return { inPlace: () => scrolls(added) - scrolls(removed) };
}

/** A recording stand-in for the setup file's inert observer: how many triggers are being watched. */
function watchVisibilityObservers(): { watching: number } {
  const state = { watching: 0 };
  class Recording {
    observe() {
      state.watching += 1;
    }
    unobserve() {
      state.watching -= 1;
    }
    disconnect() {
      state.watching = 0;
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', Recording);
  return state;
}

/** The rules of the library's control stylesheet, keyed by selector (comments stripped). */
function controlRules(): Map<string, string> {
  const css = readFileSync(join(process.cwd(), 'src/ui/controls/controls.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return new Map([...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((rule) => [rule[1].trim(), rule[2]] as const));
}

describe('Menu — the entries it shows (ui-library/specs/menu.md)', () => {
  // menu.md — every entry carries its label, always in words, in the order given (REQ-10)
  it('lists every entry in the order given, each named by its own words', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries()} />);

    await user.click(trigger());

    const listed = items();
    expect(listed).toHaveLength(4);
    expect(listed[0]).toHaveAccessibleName('Rename…');
    expect(listed[1]).toHaveAccessibleName('Export filesystem…');
    expect(listed[2]).toHaveAccessibleName('Kill');
    expect(listed[3]).toHaveAccessibleName('Remove');
  });

  // menu.md — a hint is secondary text alongside the label and the entry's description, never part of its name (REQ-8)
  it('shows a hint alongside the label and reads it as the description, not as the name', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries()} />);

    await user.click(trigger());

    const kill = items()[2];
    expect(kill).toHaveAccessibleName('Kill');
    expect(kill).toHaveAccessibleDescription('SIGKILL');
    expect(kill).toHaveTextContent('SIGKILL');
    expect(items()[3]).toHaveAccessibleDescription('rm');
  });

  // menu.md — destructive entries are shown in the interface's destructive tone (REQ-7)
  it('marks the destructive entries and leaves the others untouched', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries()} />);

    await user.click(trigger());

    const listed = items();
    expect(listed[0].className).not.toContain('destructive');
    expect(listed[1].className).not.toContain('destructive');
    expect(listed[2].className).toContain('destructive');
    expect(listed[3].className).toContain('destructive');
  });

  // menu.md — a destructive entry keeps its tone whether or not it is disabled (REQ-7, REQ-9)
  it('keeps a destructive entry in its tone while it is disabled', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries({ kill: { disabled: true, disabledReason: 'not running' } })} />);

    await user.click(trigger());

    expect(items()[2].className).toContain('destructive');
  });

  // menu.md — a separated entry is preceded by a separator setting it and what follows apart (REQ-7)
  it('sets a separated entry apart from the entries above it', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries()} />);

    await user.click(trigger());

    const separators = screen.getAllByRole('separator');
    expect(separators).toHaveLength(1);
    expect(separators[0].nextElementSibling).toHaveAccessibleName('Kill');
  });

  // menu.md — separation is ignored on the first entry, which has nothing above it
  it('draws no separator above the first entry', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries({ rename: { separated: true }, kill: { separated: false } })} />);

    await user.click(trigger());

    expect(screen.queryAllByRole('separator')).toHaveLength(0);
  });

  // menu.md — a disabled entry stays in place and in order, inert, stating why (REQ-9, REQ-4)
  it('keeps a disabled entry in place, inert, carrying the reason as its description', async () => {
    const user = userEvent.setup();
    const entries = makeEntries({ kill: { disabled: true, disabledReason: 'This container is not running.' } });
    render(<Menu label={LABEL} entries={entries} />);

    await user.click(trigger());

    const kill = items()[2];
    expect(kill).toHaveAttribute('aria-disabled', 'true');
    expect(kill).toHaveAccessibleDescription(/This container is not running\./);
    expect(kill).toHaveTextContent('This container is not running.');

    await user.click(kill);

    expect(entries[2].onSelect).not.toHaveBeenCalled();
  });

  // menu.md — a disabled entry's onSelect is never run, by pointer or by keyboard
  it('refuses to run a disabled entry from the keyboard too', async () => {
    const user = userEvent.setup();
    const entries = makeEntries({ kill: { disabled: true, disabledReason: 'This container is not running.' } });
    render(<Menu label={LABEL} entries={entries} />);
    await user.click(trigger());

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(items()[2]).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(entries[2].onSelect).not.toHaveBeenCalled();
  });
});

describe('Menu — the trigger (ui-library/specs/menu.md)', () => {
  // menu.md — the trigger carries an accessible name and announces that it opens a menu, and whether it is open (REQ-11)
  it('announces its name, that it opens a menu, and whether the menu is open', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries()} />);

    const control = trigger();
    expect(control).toHaveAttribute('aria-haspopup', 'menu');
    expect(control).toHaveAttribute('aria-expanded', 'false');
    expect(control).toHaveTextContent('…');

    await user.click(control);

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });

  // menu.md — the glyph is decoration; the accessible name is always the label
  it('keeps its accessible name when another glyph is asked for', () => {
    render(<Menu label={LABEL} entries={makeEntries()} glyph="⋯" />);

    const control = trigger();
    expect(control).toHaveTextContent('⋯');
    expect(control).toHaveAccessibleName(LABEL);
  });

  // menu.md — the open menu is named by the same label, so it is unambiguously attached to its trigger (REQ-14)
  it('names the open menu with the same label as its trigger', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries()} />);

    await user.click(trigger());

    expect(screen.getByRole('menu')).toHaveAccessibleName(LABEL);
  });

  // menu.md — the trigger stops click propagation, so opening a menu inside a table row never also selects the row
  it('does not let its click reach the surface it sits on', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <Menu label={LABEL} entries={makeEntries()} />
      </div>,
    );

    await user.click(trigger());

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  // menu.md — activating the trigger's own control while the menu is open closes it
  it('closes the menu when its own control is activated again', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries()} />);
    await user.click(trigger());

    await user.click(trigger());

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Menu — keyboard operation (ui-library/specs/menu.md)', () => {
  // menu.md — the trigger is one stop in tab order and opens from the keyboard, focus landing on the first entry (REQ-12)
  it.each(['{Enter}', ' ', '{ArrowDown}', '{ArrowUp}'])('opens on %s from the keyboard and focuses the first entry', async (key) => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries()} />);

    await user.tab();
    expect(trigger()).toHaveFocus();
    await user.keyboard(key);

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(items()[0]).toHaveFocus();
  });

  // menu.md — the arrow keys move between entries and wrap around (REQ-12)
  it('moves between entries with the arrow keys and wraps around', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries()} />);
    await user.click(trigger());

    await user.keyboard('{ArrowDown}');
    expect(items()[1]).toHaveFocus();

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(items()[3]).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(items()[0]).toHaveFocus();
  });

  // menu.md — Home and End jump to the first and last entries
  it('jumps to the first and last entries with Home and End', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries()} />);
    await user.click(trigger());

    await user.keyboard('{End}');
    expect(items()[3]).toHaveFocus();

    await user.keyboard('{Home}');
    expect(items()[0]).toHaveFocus();
  });

  // menu.md — activating an entry runs its onSelect, closes the menu and returns focus to the trigger (REQ-12, REQ-13)
  it('runs the entry it activates, closes and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const entries = makeEntries();
    render(<Menu label={LABEL} entries={entries} />);
    await user.click(trigger());

    await user.keyboard('{ArrowDown}{Enter}');

    expect(entries[1].onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  // menu.md — Escape closes the menu and returns focus to the trigger (REQ-12, REQ-13)
  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries()} />);
    await user.click(trigger());

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  // menu.md — Tab closes the menu, after which focus moves on from the trigger as if the menu had never opened.
  // Only the closing half is asserted here: where focus lands next is the browser's own default action on Tab,
  // which the jsdom environment does not reproduce; the e2e spec drives that half in a real browser.
  it('closes on Tab and leaves nothing of the menu behind', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries()} />);
    await user.click(trigger());

    await user.keyboard('{Tab}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Menu — dismissal and the single open menu (ui-library/specs/menu.md)', () => {
  // menu.md — choosing an entry by pointer closes the menu and returns focus to the trigger (REQ-13)
  it('closes and returns focus to the trigger when an entry is chosen with the pointer', async () => {
    const user = userEvent.setup();
    const entries = makeEntries();
    render(<Menu label={LABEL} entries={entries} />);
    await user.click(trigger());

    await user.click(items()[0]);

    expect(entries[0].onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  // menu.md — a click outside the popup closes it and returns focus to the trigger (REQ-13)
  it('closes on a click outside and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Menu label={LABEL} entries={makeEntries()} />
        <p>Somewhere else on the screen</p>
      </>,
    );
    await user.click(trigger());

    await user.click(screen.getByText('Somewhere else on the screen'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  // menu.md — at most one menu is open in the whole interface: opening one closes any other (REQ-14)
  it('closes the menu already open when another one is opened', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Menu label="More actions for web-1" entries={makeEntries()} />
        <Menu label="More actions for web-2" entries={makeEntries()} />
      </>,
    );
    await user.click(trigger('More actions for web-1'));

    await user.click(trigger('More actions for web-2'));

    const open = screen.getAllByRole('menu');
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveAccessibleName('More actions for web-2');
    expect(trigger('More actions for web-1')).toHaveAttribute('aria-expanded', 'false');
  });

  // menu.md — the second menu takes the focus its own opening gives it, undisturbed by the first one closing (REQ-14)
  it('leaves the newly opened menu holding the focus', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Menu label="More actions for web-1" entries={makeEntries()} />
        <Menu label="More actions for web-2" entries={makeEntries()} />
      </>,
    );
    await user.click(trigger('More actions for web-1'));

    await user.click(trigger('More actions for web-2'));

    expect(items()[0]).toHaveFocus();
  });
});

describe('Menu — where the popup is drawn (ui-library/specs/menu.md)', () => {
  // menu.md — the popup is rendered outside every scroll and overflow ancestor of its trigger, so nothing between it
  // and the viewport can clip it (REQ-15)
  it('draws the popup outside the scroll container its trigger sits in', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div data-testid="scroller" style={{ overflow: 'hidden', height: 40 }}>
        <Menu label={LABEL} entries={makeEntries()} />
      </div>,
    );
    await user.click(trigger());

    const menu = screen.getByRole('menu');
    const scroller = screen.getByTestId('scroller');
    expect(scroller.contains(menu)).toBe(false);
    expect(container.contains(menu)).toBe(false);
    expect(menu.closest('.ui-menu__popup')?.parentElement).toBe(document.body);
  });

  // menu.md — the popup is positioned against the trigger's box, which is what `fixed` makes possible (REQ-15)
  it('positions the popup against the viewport rather than the flow it was written in', () => {
    expect(controlRules().get('.ui-menu__popup')).toMatch(/position\s*:\s*fixed/);
  });

  // menu.md — the entries scroll inside the surface, never the surface itself, so the material's blur layer cannot
  // scroll away from what it blurs (REQ-26)
  it('scrolls the entries in their own box, not the surface carrying the material', () => {
    const rules = controlRules();

    expect(rules.get('.ui-menu__popup')).not.toMatch(/overflow[^:]*:\s*(auto|scroll)/);
    expect(rules.get('.ui-menu__list')).toMatch(/overflow[^:]*:\s*(auto|scroll)/);
  });

  // menu.md — the popup carries the existing overlay material; the trigger carries none, since there is one per row (REQ-25)
  it('gives the popup the overlay material of the interface and the trigger none', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries()} />);

    await user.click(trigger());

    expect(screen.getByRole('menu').closest('.ui-overlay-glass')).not.toBeNull();
    expect(trigger().closest('.ui-overlay-glass')).toBeNull();
  });

  // menu.md — it declares no blur of its own and introduces no second blur value (REQ-25)
  it('declares no filter of its own anywhere in the menu rules', () => {
    for (const [selector, body] of controlRules()) {
      if (!selector.includes('.ui-menu')) continue;
      expect(body).not.toMatch(/backdrop-filter/);
      expect(body).not.toMatch(/filter\s*:\s*[^;]*blur/);
    }
  });
});

describe('Menu — an open menu never floats free (ui-library/specs/menu.md)', () => {
  // menu.md — an open menu follows its trigger through a scroll instead of closing: the popup holds the same
  // position against the trigger's box, and the menu is left open and usable (REQ-27, REQ-28)
  it('follows its trigger through a scroll instead of closing', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries()} />);
    const control = trigger();
    pinBox(control, { top: 300, left: 200, width: 32, height: 24 });
    await user.click(control);
    const before = popupPosition();

    // The region the trigger sits in scrolls by 60px up and 25px left, and the event reaches the
    // window from a container between the two.
    pinBox(control, { top: 240, left: 175, width: 32, height: 24 });
    fireEvent.scroll(document);

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(popupPosition()).toEqual({ top: before.top - 60, left: before.left - 25 });
    expect(items()[0]).toHaveFocus();
  });

  // menu.md — a resize closes it too (REQ-16)
  it('closes on a resize', async () => {
    const user = userEvent.setup();
    render(<Menu label={LABEL} entries={makeEntries()} />);
    await user.click(trigger());

    fireEvent(window, new Event('resize'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  // menu.md — it is gone with its trigger when the trigger is unmounted, as a virtualised table dropping its row does (REQ-16)
  it('takes the popup with it when the trigger is unmounted', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [mounted, setMounted] = useState(true);
      return (
        <>
          {mounted ? <Menu label={LABEL} entries={makeEntries()} /> : null}
          <button type="button" onClick={() => setMounted(false)}>
            Drop the row
          </button>
        </>
      );
    }
    render(<Harness />);
    await user.click(trigger());
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Drop the row' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  // menu.md — no scroll handling and no visibility watch are in place while every menu is closed (REQ-31)
  it('puts no scroll handling and no visibility watch in place while every menu is closed', async () => {
    const user = userEvent.setup();
    const scroll = watchScrollRegistrations();
    const visibility = watchVisibilityObservers();
    render(<Menu label={LABEL} entries={makeEntries()} />);

    expect(scroll.inPlace(), 'a closed menu listens for scrolls').toBe(0);
    expect(visibility.watching, 'a closed menu watches its trigger').toBe(0);

    await user.click(trigger());
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(scroll.inPlace(), 'a scroll listener outlived the menu that registered it').toBe(0);
    expect(visibility.watching, 'a visibility watch outlived the menu that started it').toBe(0);
  });

  // menu.md — re-placing an open popup writes only the menu's own state, so no part of the list underneath is
  // redrawn (REQ-31)
  it('re-places the open popup on a scroll and redraws nothing around it', async () => {
    const user = userEvent.setup();
    let drawn = 0;
    function ListUnderneath() {
      drawn += 1;
      return <p>web-1</p>;
    }
    render(
      <>
        <ListUnderneath />
        <Menu label={LABEL} entries={makeEntries()} />
      </>,
    );
    const control = trigger();
    pinBox(control, { top: 300, left: 200, width: 32, height: 24 });
    await user.click(control);
    const before = popupPosition();
    const drawnBeforeTheScroll = drawn;

    pinBox(control, { top: 260, left: 200, width: 32, height: 24 });
    fireEvent.scroll(document);

    expect(popupPosition().top, 'the scroll did not re-place the popup').toBe(before.top - 40);
    expect(drawn, 'a scroll under an open menu redrew the list underneath').toBe(drawnBeforeTheScroll);
  });
});
