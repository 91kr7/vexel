import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Backdrop } from '../background/Backdrop';
import './layout.css';

export interface FrameProps {
  rail: ReactNode;
  header: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

/**
 * Application frame: a sticky navigation rail on the left and, on the right,
 * a header, a scrollable content area and an optional footer. Renders the
 * static backdrop once, behind everything.
 *
 * The main region is placed before the rail in the DOM (content-first
 * reading/tab order) while an explicit grid-column keeps the rail visually
 * on the left; visual layout does not depend on markup order.
 *
 * Below the phone breakpoint the rail becomes an off-canvas drawer: a menu
 * toggle appears in the header row, a dimmed scrim covers the content while
 * open, and it closes on a scrim tap, Escape, or activating an item inside
 * the rail (e.g. a nav entry) — all self-contained, the caller needs no
 * knowledge of the drawer state.
 */
export function Frame({ rail, header, footer, children }: FrameProps) {
  const [railOpen, setRailOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  /**
   * The content region reserves a stable scrollbar gutter, which is real
   * layout space taken out of its content area — so its cards would end up
   * narrower than the header card they align with unless the padding
   * subtracts exactly that width. The width is not knowable from CSS: it
   * varies by browser and platform, and `scrollbar-width: thin` makes the
   * engine override the `::-webkit-scrollbar` pixel width. Measure the real
   * gutter (offsetWidth - clientWidth, with no border in play) and publish it
   * as the token the stylesheet subtracts, so the alignment is exact
   * everywhere instead of correct only where a hard-coded guess happens to
   * match.
   */
  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    function measureScrollbarGutter() {
      if (!element) return;
      const gutter = element.offsetWidth - element.clientWidth;
      element.style.setProperty('--scrollbar-width', `${gutter}px`);
    }
    measureScrollbarGutter();
    window.addEventListener('resize', measureScrollbarGutter);
    return () => window.removeEventListener('resize', measureScrollbarGutter);
  }, []);

  useEffect(() => {
    if (!railOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setRailOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [railOpen]);

  function handleRailClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button, a')) setRailOpen(false);
  }

  return (
    <>
      <Backdrop />
      <div className="ui-frame">
        <div className="ui-frame__main">
          <div className="ui-frame__header">
            <button
              type="button"
              className="ui-frame__menu-toggle"
              aria-label={railOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={railOpen}
              onClick={() => setRailOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>
            {header}
          </div>
          <div className="ui-frame__content" ref={contentRef}>
            {children}
          </div>
          {footer ? <div className="ui-frame__footer">{footer}</div> : null}
        </div>
        <div
          className="ui-frame__scrim"
          data-open={railOpen}
          onClick={() => setRailOpen(false)}
          aria-hidden="true"
        />
        <div
          className={`ui-frame__rail${railOpen ? ' ui-frame__rail--open' : ''}`}
          onClick={handleRailClick}
        >
          {rail}
        </div>
      </div>
    </>
  );
}
