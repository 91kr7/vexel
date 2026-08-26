import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from '../controls/IconButton';
import { DISMISSAL_FOCUS_TARGET_ATTRIBUTE, useEscapeClaim } from '../controls/escape-arbitration';
import { Surface } from '../glass/Surface';
import './feedback.css';

export type ModalSize = 'default' | 'large';

export interface ModalProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  /** `'large'` widens the dialog and caps its height with its own scroll, for richer content (e.g. a data table); default fits a short message or form. */
  size?: ModalSize;
  /** Opt-in: a labelled close control on the dialog's chrome, for a dialog whose overlay click is its only other way out. */
  closeControl?: boolean;
  /** Opt-in: on dismissal the point of interaction returns to whatever held it when the dialog opened. */
  restoreFocus?: boolean;
}

const CLOSE_LABEL = 'Close dialog';
const CLOSE_GLYPH = '✕';

/** Centered overlay-glass dialog over a dimmed overlay; closes on overlay click. */
export function Modal({
  open,
  title,
  children,
  actions,
  onClose,
  size = 'default',
  closeControl = false,
  restoreFocus = false,
}: ModalProps) {
  // An open dialog claims `Escape` and does nothing with it: the key does not
  // close the dialog — that is unchanged — and, being claimed by the innermost
  // surface, it no longer reaches a dismissible surface underneath, which would
  // otherwise be dismissed behind a dialog covering it.
  useEscapeClaim(open, () => {});

  const openerRef = useRef<HTMLElement | null>(null);
  const fallbackRef = useRef<HTMLElement | null>(null);

  // The enclosing dismissal focus target is resolved while the opener is still
  // connected, so it is still reachable once the opener itself has gone — a
  // detached element's ancestors lead nowhere.
  useEffect(() => {
    if (!open || !restoreFocus) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const fallback = opener?.closest(`[${DISMISSAL_FOCUS_TARGET_ATTRIBUTE}]`);
    openerRef.current = opener;
    fallbackRef.current = fallback instanceof HTMLElement ? fallback : null;
    return () => {
      const target = openerRef.current?.isConnected ? openerRef.current : fallbackRef.current;
      openerRef.current = null;
      fallbackRef.current = null;
      if (target?.isConnected) target.focus();
    };
  }, [open, restoreFocus]);

  if (!open) return null;
  const positionerClass =
    size === 'large' ? 'ui-modal__positioner ui-modal__positioner--size-large' : 'ui-modal__positioner';
  const modalClass = size === 'large' ? 'ui-modal ui-modal--size-large' : 'ui-modal';
  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className={positionerClass} onClick={(event) => event.stopPropagation()}>
        <Surface elevation="raised" material="overlay">
          <div className={modalClass}>
            {closeControl ? (
              <div className="ui-modal__header">
                <h2 className="ui-modal__title">{title}</h2>
                <IconButton label={CLOSE_LABEL} onClick={onClose}>
                  {CLOSE_GLYPH}
                </IconButton>
              </div>
            ) : (
              <h2 className="ui-modal__title">{title}</h2>
            )}
            <div className="ui-modal__body">{children}</div>
            {actions ? <div className="ui-modal__actions">{actions}</div> : null}
          </div>
        </Surface>
      </div>
    </div>
  );
}
