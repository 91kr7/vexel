import { useEffect, useRef, type RefObject } from 'react';

/**
 * The one place that decides which surface an `Escape` belongs to.
 *
 * A dismissible surface registers a claim while it is open and withdraws it when
 * it closes; a single document-level listener — installed only while at least
 * one claim stands — delivers the key to the innermost claimant, i.e. the one
 * registered most recently, and to no other. One `Escape` therefore never
 * resolves two surfaces at once: an open menu over an open panel takes the key,
 * and the panel gets the next one.
 *
 * Why a registry rather than a listener per surface: two independent document
 * listeners both fire for one keystroke and the winner is whichever surface
 * happened to register first — the panel opened before the menu would close
 * before the menu ever saw the key. `event.defaultPrevented` and
 * `stopPropagation` do not repair that, they only rename it. Registration order
 * is used here for the opposite purpose, as the *definition* of "innermost":
 * the last claim in is the surface most recently opened, and it is the only one
 * the key is handed to.
 *
 * A region may also declare that the keystrokes typed inside it are its own — a
 * terminal, an emulator, any keystroke-consuming session. An `Escape` whose
 * origin lies inside such a region is delivered to no claimant at all, rather
 * than being left to the region to defend by calling `preventDefault()` itself.
 *
 * Domain-agnostic: it knows "a claimant" and "a region that owns its keys",
 * never a panel, a menu or a container.
 */

type EscapeHandler = (event: KeyboardEvent) => void;

interface EscapeClaim {
  handle: EscapeHandler;
}

const claims: EscapeClaim[] = [];
const ownedRegions = new Set<Element>();
let listening = false;

/** Where the keystroke was typed: the event's own target, or the focused element when it has none. */
function originOf(event: KeyboardEvent): Node | null {
  if (event.target instanceof Node) return event.target;
  return document.activeElement;
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  const claim = claims[claims.length - 1];
  if (!claim) return;
  const origin = originOf(event);
  if (origin) {
    for (const region of ownedRegions) {
      if (region.contains(origin)) return;
    }
  }
  claim.handle(event);
}

// Bound only while something claims the key, so with no claimant registered the
// keystroke is left entirely alone: nothing listens, nothing is prevented.
function startListening() {
  if (listening) return;
  document.addEventListener('keydown', handleKeyDown, true);
  listening = true;
}

function stopListening() {
  if (!listening) return;
  document.removeEventListener('keydown', handleKeyDown, true);
  listening = false;
}

/** Registers a claim on `Escape`; the returned function withdraws it. */
export function claimEscape(handle: EscapeHandler): () => void {
  const claim: EscapeClaim = { handle };
  claims.push(claim);
  startListening();
  return () => {
    const index = claims.indexOf(claim);
    if (index !== -1) claims.splice(index, 1);
    if (claims.length === 0) stopListening();
  };
}

/** Declares a region's keystrokes its own; the returned function withdraws the declaration. */
export function ownKeystrokes(region: Element): () => void {
  ownedRegions.add(region);
  return () => {
    ownedRegions.delete(region);
  };
}

/**
 * Claims `Escape` while `active`. The handler is read at delivery time, so a
 * re-render never re-registers the claim: the order claims stand in is the order
 * their surfaces opened in, not the order they last rendered in.
 */
export function useEscapeClaim(active: boolean, onEscape: EscapeHandler): void {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  useEffect(() => {
    if (!active) return;
    return claimEscape((event) => handler.current(event));
  }, [active]);
}

/** Declares the referenced element a region owning the keystrokes typed inside it, while it is mounted. */
export function useKeystrokeRegion<T extends Element>(region: RefObject<T | null>): void {
  useEffect(() => {
    const element = region.current;
    if (!element) return;
    return ownKeystrokes(element);
  }, [region]);
}

/**
 * Marks a region as the place the point of interaction returns to when a
 * dismissible surface inside it is dismissed by the key rather than by a control
 * of its own. The region carries it as an attribute so a surface can find the
 * nearest enclosing one without either component knowing the other.
 */
export const DISMISSAL_FOCUS_TARGET_ATTRIBUTE = 'data-ui-dismissal-focus-target';

/**
 * Hands the focus to the nearest enclosing dismissal focus target, so it is
 * never left on a subtree about to be removed nor lost to the document as a
 * whole. Answers whether one was found.
 */
export function focusDismissalTarget(from: Element | null): boolean {
  const target = from?.closest(`[${DISMISSAL_FOCUS_TARGET_ATTRIBUTE}]`);
  if (!(target instanceof HTMLElement)) return false;
  target.focus();
  return true;
}
