import { useLayoutEffect, useRef, type ReactNode } from 'react';
import './navigation.css';

export interface NavBrandProps {
  name: string;
  tagline: string;
}

/** Application mark shown at the top of the navigation rail. */
export function NavBrand({ name, tagline }: NavBrandProps) {
  return (
    <div className="ui-nav-rail__brand">
      <div className="ui-nav-rail__brand-mark" />
      <div>
        <p className="ui-nav-rail__brand-name">{name}</p>
        <p className="ui-nav-rail__brand-tagline">{tagline}</p>
      </div>
    </div>
  );
}

export interface NavRailProps {
  brand: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

/** Persistent left navigation rail: brand, grouped entries, footer status. */
export function NavRail({ brand, footer, children }: NavRailProps) {
  const groupsRef = useRef<HTMLDivElement>(null);

  /**
   * The entry region scrolls whenever the rail is shorter than its entries,
   * which on a 1280x800 laptop is always. Scrolling alone is not enough to
   * make the entries below the fold reachable: where the platform draws
   * overlay scrollbars there is no scrollbar to see, the fold falls between
   * two entries and the list reads as complete — which is how three
   * destinations became invisible rather than merely off-screen. These
   * attributes state which edge still holds entries, and the stylesheet fades
   * the entry that meets it. Written straight to the element, as this runs on
   * every scroll frame and no rendered output depends on it.
   */
  useLayoutEffect(() => {
    const region = groupsRef.current;
    if (!region) return;
    function markFolds() {
      if (!region) return;
      const beyondEnd = region.scrollHeight - region.clientHeight - region.scrollTop;
      region.dataset.foldStart = String(region.scrollTop > 1);
      region.dataset.foldEnd = String(beyondEnd > 1);
    }
    markFolds();
    region.addEventListener('scroll', markFolds, { passive: true });
    // What the region can show changes with the height the rail hands it, so it
    // is observed rather than measured once. (jsdom provides no ResizeObserver;
    // there is no layout to observe there either.)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(markFolds);
    observer?.observe(region);
    return () => {
      region.removeEventListener('scroll', markFolds);
      observer?.disconnect();
    };
  }, []);

  return (
    <nav className="ui-nav-rail">
      {brand}
      <div className="ui-nav-rail__groups" ref={groupsRef}>
        {children}
      </div>
      {footer}
    </nav>
  );
}
