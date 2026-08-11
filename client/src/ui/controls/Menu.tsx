import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Surface } from '../glass/Surface';
import './controls.css';

export interface MenuEntry {
  id: string;
  /** The entry's own words; every entry has one, none is icon-only. */
  label: string;
  /** Secondary text shown alongside the label (e.g. the technical name of the operation). */
  hint?: string;
  /** Shows the entry in the destructive tone, for an entry to be careful with. */
  destructive?: boolean;
  /** Sets the entry apart from the ones above it, starting a new group. */
  separated?: boolean;
  disabled?: boolean;
  /** Why the entry is unavailable; shown on the entry and read as its accessible description. */
  disabledReason?: string;
  onSelect: () => void;
}

export interface MenuProps {
  /** Accessible name of the trigger (e.g. "More actions for web-1"); also names the open menu. */
  label: string;
  entries: MenuEntry[];
  /** The trigger's visible glyph; its accessible name is always `label`. */
  glyph?: string;
}

/**
 * The one menu open anywhere in the interface. Opening a second one closes this
 * one without disturbing the focus the new one is about to take.
 */
let closeOpenMenu: (() => void) | null = null;

/**
 * Overflow menu: a trigger that announces it opens a menu, and a popup of
 * labelled entries — each with an optional secondary hint, destructive tone,
 * separation from the entries above it, and a disabled state carrying the
 * reason it is disabled.
 *
 * The popup is rendered on `document.body` rather than beside its trigger, so
 * no scroll or overflow ancestor between the two can clip it, and is positioned
 * against the trigger's box, flipping above it when there is no room below. A
 * scroll or a resize anywhere closes it instead of leaving it floating where the
 * trigger no longer is; so does the trigger being unmounted (a virtualised table
 * dropping its row).
 *
 * Domain-agnostic: it knows what an entry looks like, never what one does.
 */
export function Menu({ label, entries, glyph = '…' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // The focused entry, readable by the key listener without re-registering it on
  // every move.
  const activeIndexRef = useRef(0);
  const popupId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const focusEntry = useCallback((index: number) => {
    activeIndexRef.current = index;
    setActiveIndex(index);
    itemRefs.current[index]?.focus();
  }, []);

  /** Opens at the trigger's box; the layout effect below refines it before the browser paints. */
  const openMenu = useCallback(() => {
    const box = triggerRef.current?.getBoundingClientRect();
    if (box) setPosition({ top: box.bottom, left: box.left });
    setOpen(true);
  }, []);

  // At most one menu open in the whole interface (the cap that lets the popup
  // carry the overlay material: see CLAUDE.md's allow-list).
  useEffect(() => {
    if (!open) return;
    closeOpenMenu?.();
    const closeSilently = () => setOpen(false);
    closeOpenMenu = closeSilently;
    return () => {
      if (closeOpenMenu === closeSilently) closeOpenMenu = null;
    };
  }, [open]);

  // Opening moves focus into the menu, onto its first entry. The popup is
  // committed already laid out and visible, never hidden while it is measured:
  // an element a browser considers invisible cannot take focus, and a `focus()`
  // on one is a silent no-op that leaves the whole keyboard model unreachable.
  useEffect(() => {
    if (!open) return;
    focusEntry(0);
  }, [open, focusEntry]);

  // Positioned against the trigger's box after every render, not only on open:
  // the list under it keeps updating from live data while the menu is open, and
  // the popup has to stay where its trigger is. Bails out when the box has not
  // moved, so a render that changes nothing costs no second render — which is
  // what makes running on every render safe rather than a loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const popup = popupRef.current;
    if (!trigger || !popup) return;
    const triggerBox = trigger.getBoundingClientRect();
    const popupBox = popup.getBoundingClientRect();
    const spaceBelow = window.innerHeight - triggerBox.bottom;
    const flip = popupBox.height > spaceBelow && triggerBox.top > spaceBelow;
    const left = Math.max(0, Math.min(triggerBox.right - popupBox.width, window.innerWidth - popupBox.width));
    const top = flip ? Math.max(0, triggerBox.top - popupBox.height) : triggerBox.bottom;
    setPlacement(flip ? 'above' : 'below');
    setPosition((current) => (current && current.top === top && current.left === left ? current : { top, left }));
  });

  // A scroll anywhere between the trigger and the viewport (capture phase
  // catches every scroll container, not just the window) moves the trigger out
  // from under the popup, so the menu closes rather than floating free. Focus is
  // deliberately not pulled back to the trigger here: doing so would scroll it
  // back into view, fighting the scroll that caused this.
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && popupRef.current?.contains(target)) return;
      close(false);
    };
    const dismissOnResize = () => close(false);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismissOnResize);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismissOnResize);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const dismissOnOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popupRef.current?.contains(target)) return;
      // The trigger's own click toggles the menu; closing here as well would
      // reopen it on the click that follows.
      if (triggerRef.current?.contains(target)) return;
      // Focusing the trigger from inside a `mousedown` listener is undone a
      // moment later by that same `mousedown`'s own default action, which moves
      // focus to whatever was clicked (or to nothing). Refusing the default is
      // what makes the focus return hold; the click itself still happens, so
      // whatever was clicked still does what it does.
      event.preventDefault();
      close(true);
    };
    document.addEventListener('mousedown', dismissOnOutsideClick);
    return () => document.removeEventListener('mousedown', dismissOnOutsideClick);
  }, [open, close]);

  // The keyboard model is bound to the document while the menu is open, not to
  // the popup: a key never reaches a listener on an element that does not hold
  // the focus, and an open menu can lose it — to a surface re-rendering
  // underneath it, or by simply never having taken it. Bound here, `Escape`
  // closes wherever focus is, and an arrow key takes the focus back into the
  // menu rather than needing it there first.
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
        return;
      }
      if (event.key === 'Tab') {
        // Not prevented: focus is put back on the trigger, so the browser moves
        // on from there as it would have if the menu had never opened.
        close(true);
        return;
      }
      const count = entries.length;
      if (count === 0) return;
      const current = activeIndexRef.current;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusEntry((current + 1) % count);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusEntry((current - 1 + count) % count);
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusEntry(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusEntry(count - 1);
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [open, close, entries.length, focusEntry]);

  function handleTriggerKeyDown(event: React.KeyboardEvent) {
    if (open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    event.preventDefault();
    openMenu();
  }

  function activate(entry: MenuEntry) {
    if (entry.disabled) return;
    close(true);
    entry.onSelect();
  }

  const popup = (
    <div
      ref={popupRef}
      className={`ui-menu__popup ui-menu__popup--${placement}`}
      // Computed geometry, not a design value: where the trigger happens to be.
      // It is placed at the trigger from the very first commit and never hidden
      // while it is measured — the refinement below runs before the browser
      // paints, and a hidden popup could not take the focus opening it gives it.
      style={{ top: position?.top ?? 0, left: position?.left ?? 0 }}
      onClick={(event) => event.stopPropagation()}
    >
      <Surface elevation="raised" material="overlay">
        <div className="ui-menu__list" id={popupId} role="menu" aria-label={label}>
          {entries.map((entry, index) => {
            const hintId = `${popupId}-hint-${entry.id}`;
            const reasonId = `${popupId}-reason-${entry.id}`;
            const showsReason = Boolean(entry.disabled && entry.disabledReason);
            const describedBy = [entry.hint ? hintId : '', showsReason ? reasonId : ''].filter(Boolean).join(' ');
            const classes = ['ui-menu__item', entry.destructive ? 'ui-menu__item--destructive' : ''].filter(Boolean).join(' ');
            return (
              <Fragment key={entry.id}>
                {entry.separated && index > 0 ? <div className="ui-menu__separator" role="separator" /> : null}
                <button
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  type="button"
                  role="menuitem"
                  className={classes}
                  // The label alone names the entry; the hint and the reason are
                  // its description, so neither is read as part of its name.
                  aria-label={entry.label}
                  aria-describedby={describedBy || undefined}
                  aria-disabled={entry.disabled ? true : undefined}
                  title={showsReason ? entry.disabledReason : undefined}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onClick={() => activate(entry)}
                >
                  <span className="ui-menu__item-label">{entry.label}</span>
                  {entry.hint ? (
                    <span className="ui-menu__item-hint" id={hintId}>
                      {entry.hint}
                    </span>
                  ) : null}
                  {showsReason ? (
                    <span className="ui-menu__item-reason" id={reasonId}>
                      {entry.disabledReason}
                    </span>
                  ) : null}
                </button>
              </Fragment>
            );
          })}
        </div>
      </Surface>
    </div>
  );

  return (
    <div className="ui-menu">
      <button
        ref={triggerRef}
        type="button"
        className="ui-menu__trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        // A menu opened from a table row must not also select the row.
        onClick={(event) => {
          event.stopPropagation();
          if (open) close(false);
          else openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        {glyph}
      </button>
      {open ? createPortal(popup, document.body) : null}
    </div>
  );
}
