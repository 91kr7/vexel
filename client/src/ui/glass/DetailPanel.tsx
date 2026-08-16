import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from '../controls/IconButton';
import { focusDismissalTarget, useEscapeClaim } from '../controls/escape-arbitration';
import { DefinitionList, type DefinitionItem } from '../data/DefinitionList';
import type { ContentClass } from '../layout/content-columns';
import './detail-panel.css';

/**
 * How the panel is left, and therefore whether it presents a close control.
 *
 * The rule that decides it: the control is **absent where the panel's opening
 * gesture also closes it** (a table row that expands and collapses on the same
 * selection), and **present where the close control is the only way out**. Each
 * new use is that question answered, not a default to drift into: a panel with
 * both is a second dismissal affordance nobody asked for, and a panel with
 * neither is a surface with no way out.
 */
export type DetailPanelDismissal = 'close-control' | 'opening-gesture';

export interface DetailPanelProps {
  /** Omit when the object is already labelled by the surface the panel opens from (e.g. a table row). */
  title?: string;
  subtitle?: string;
  onClose: () => void;
  actions?: ReactNode;
  /**
   * The object's properties, laid out in the library's property grid above the
   * body. Structural rather than a convention a caller may decline: a panel
   * that states properties states them here, in that arrangement, left-aligned,
   * at the panel's own width — never as a hand-built two-column layout of its
   * own.
   */
  properties?: DefinitionItem[];
  /** What those properties hold, from which the grid derives how many columns its width carries. */
  propertiesContentClass?: ContentClass;
  children?: ReactNode;
  /**
   * `'close-control'` (default) presents the close control, as every panel did
   * before this variant existed. `'opening-gesture'` presents none — the surface
   * that opened the panel closes it — and dismisses on `Escape` instead.
   */
  dismissal?: DetailPanelDismissal;
}

/**
 * The one detail panel open anywhere in the interface. Opening a second closes
 * the first, through the first's own `onClose` — so the screen that owns it
 * learns the panel is gone and stops drawing it, rather than being left with
 * state saying it is still open.
 *
 * Held by the component and not by each screen, which is the whole point: two
 * lists on one screen (volumes beside networks) each kept their own expansion
 * and presented two parallel long scrolls, because nothing but a convention
 * said they should not. A screen cannot re-answer this, and it costs a screen
 * nothing to obey — `onClose` is already required of every caller.
 */
let closeOpenDetailPanel: (() => void) | null = null;

/**
 * Detail surface for a selected object: an optional header with title/subtitle
 * and a sticky trailing actions slot, an optional property grid, a content body
 * below, and — depending on `dismissal` — a close control or `Escape`.
 */
export function DetailPanel({
  title,
  subtitle,
  onClose,
  actions,
  properties,
  propertiesContentClass,
  children,
  dismissal = 'close-control',
}: DetailPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hasHeading = Boolean(title || subtitle || actions);
  const closedByOpeningGesture = dismissal === 'opening-gesture';

  // `onClose` is read through a ref so that a caller re-creating the callback on
  // every render does not re-run the registration — which would close this very
  // panel a moment after it opened.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    closeOpenDetailPanel?.();
    const closeThis = () => closeRef.current();
    closeOpenDetailPanel = closeThis;
    return () => {
      if (closeOpenDetailPanel === closeThis) closeOpenDetailPanel = null;
    };
  }, []);

  // Only the control-less presentation claims the key, so a panel that already
  // offers a way out gains no second one. The claim is arbitrated with every
  // other one in the interface: a menu or a dialog opened over this panel takes
  // the key first, and a region that owns its keystrokes (a live terminal in the
  // panel's own body) never loses one to it.
  useEscapeClaim(closedByOpeningGesture, () => {
    // Before the panel is unmounted, never after: the point of interaction goes
    // to the nearest enclosing dismissal focus target rather than onto a removed
    // subtree or onto the document.
    focusDismissalTarget(rootRef.current);
    onClose();
  });

  return (
    <div ref={rootRef} className={closedByOpeningGesture ? 'ui-detail-panel ui-detail-panel--no-close' : 'ui-detail-panel'}>
      {closedByOpeningGesture ? null : (
        <div className="ui-detail-panel__close">
          <IconButton label="Close detail" onClick={onClose}>
            ✕
          </IconButton>
        </div>
      )}
      {hasHeading ? (
        <div className="ui-detail-panel__header">
          <div className="ui-detail-panel__heading">
            {title ? <p className="ui-detail-panel__title">{title}</p> : null}
            {subtitle ? <p className="ui-detail-panel__subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="ui-detail-panel__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="ui-detail-panel__body">
        {properties && properties.length > 0 ? (
          <div className="ui-detail-panel__properties">
            <DefinitionList items={properties} contentClass={propertiesContentClass} />
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
