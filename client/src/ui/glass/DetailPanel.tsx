import { useRef, type ReactNode } from 'react';
import { IconButton } from '../controls/IconButton';
import { focusDismissalTarget, useEscapeClaim } from '../controls/escape-arbitration';
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
  children?: ReactNode;
  /**
   * `'close-control'` (default) presents the close control, as every panel did
   * before this variant existed. `'opening-gesture'` presents none — the surface
   * that opened the panel closes it — and dismisses on `Escape` instead.
   */
  dismissal?: DetailPanelDismissal;
}

/**
 * Detail surface for a selected object: an optional header with title/subtitle
 * and a sticky trailing actions slot, a content body below, and — depending on
 * `dismissal` — a close control or `Escape`.
 */
export function DetailPanel({ title, subtitle, onClose, actions, children, dismissal = 'close-control' }: DetailPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hasHeading = Boolean(title || subtitle || actions);
  const closedByOpeningGesture = dismissal === 'opening-gesture';

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
      <div className="ui-detail-panel__body">{children}</div>
    </div>
  );
}
