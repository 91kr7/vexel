import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Surface } from '../glass/Surface';
import { useEscapeClaim } from './escape-arbitration';
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
 * labelled entries, portalled onto `document.body` so nothing clips it and
 * placed against the trigger's box, which it follows until the trigger goes.
 * The contract is `ui-library/specs/menu.md`.
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

  // The popup is committed laid out and visible, never hidden while measured: a
  // browser refuses focus to an invisible element, silently.
  // No `preventScroll`, here or in `focusEntry`: a menu at `--menu-max-height`
  // needs its last entry scrolled into the list's own box.
  useEffect(() => {
    if (!open) return;
    focusEntry(0);
  }, [open, focusEntry]);

  // The one placement routine, called by both the render path and the scroll
  // path. Writes only when the result differs, so calling it again is free.
  const place = useCallback(() => {
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
  }, []);

  // After every render, not only on open: the list under it keeps updating from
  // live data. The bail-out in `place` is what keeps this from looping.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!open) return;
    place();
  });

  // Registered only while open, which is why a closed menu costs nothing. A
  // scroll re-places the popup instead of closing it — in capture, so a scroll
  // container between the trigger and the window is heard too. The close is the
  // trigger leaving what its clipping ancestors leave visible, which its own
  // rectangle cannot report, or a resize; focus is not returned, that would
  // scroll the trigger back against the operator (menu.md).
  useEffect(() => {
    if (!open) return;
    const follow = () => place();
    const dismissOnResize = () => close(false);
    const watchVisibility = new IntersectionObserver((records) => {
      const latest = records[records.length - 1];
      if (latest && !latest.isIntersecting) close(false);
    });
    if (triggerRef.current) watchVisibility.observe(triggerRef.current);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', dismissOnResize);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', dismissOnResize);
      watchVisibility.disconnect();
    };
  }, [open, close, place]);

  useEffect(() => {
    if (!open) return;
    const dismissOnOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popupRef.current?.contains(target)) return;
      // The trigger's own click toggles the menu; closing here as well would
      // reopen it on the click that follows.
      if (triggerRef.current?.contains(target)) return;
      // The `mousedown`'s own default would move the focus away again; refusing
      // it is what makes the return hold. The click itself still happens.
      event.preventDefault();
      close(true);
    };
    document.addEventListener('mousedown', dismissOnOutsideClick);
    return () => document.removeEventListener('mousedown', dismissOnOutsideClick);
  }, [open, close]);

  // A claim with the library's arbitration, not a listener of this component: a
  // menu opened over a dismissible surface takes the key alone, and takes it
  // wherever the focus sits (escape-arbitration.md).
  useEscapeClaim(open, (event) => {
    event.preventDefault();
    close(true);
  });

  // On the document, not the popup: an open menu can lose the focus, and an
  // arrow key must take it back rather than need it there already.
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
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
