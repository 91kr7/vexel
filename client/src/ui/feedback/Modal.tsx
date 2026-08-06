import type { ReactNode } from 'react';
import { Surface } from '../glass/Surface';
import './feedback.css';

export interface ModalProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}

/** Centered glass dialog over a dimmed overlay; closes on overlay click. */
export function Modal({ open, title, children, actions, onClose }: ModalProps) {
  if (!open) return null;
  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()}>
        <Surface elevation="raised">
          <div className="ui-modal">
            <h2 className="ui-modal__title">{title}</h2>
            <div className="ui-modal__body">{children}</div>
            {actions ? <div className="ui-modal__actions">{actions}</div> : null}
          </div>
        </Surface>
      </div>
    </div>
  );
}
