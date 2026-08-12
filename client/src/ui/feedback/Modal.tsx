import type { ReactNode } from 'react';
import { useEscapeClaim } from '../controls/escape-arbitration';
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
}

/** Centered overlay-glass dialog over a dimmed overlay; closes on overlay click. */
export function Modal({ open, title, children, actions, onClose, size = 'default' }: ModalProps) {
  // An open dialog claims `Escape` and does nothing with it: the key does not
  // close the dialog — that is unchanged — and, being claimed by the innermost
  // surface, it no longer reaches a dismissible surface underneath, which would
  // otherwise be dismissed behind a dialog covering it.
  useEscapeClaim(open, () => {});

  if (!open) return null;
  const positionerClass =
    size === 'large' ? 'ui-modal__positioner ui-modal__positioner--size-large' : 'ui-modal__positioner';
  const modalClass = size === 'large' ? 'ui-modal ui-modal--size-large' : 'ui-modal';
  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className={positionerClass} onClick={(event) => event.stopPropagation()}>
        <Surface elevation="raised" material="overlay">
          <div className={modalClass}>
            <h2 className="ui-modal__title">{title}</h2>
            <div className="ui-modal__body">{children}</div>
            {actions ? <div className="ui-modal__actions">{actions}</div> : null}
          </div>
        </Surface>
      </div>
    </div>
  );
}
