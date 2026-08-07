import type { ReactNode } from 'react';
import { IconButton } from '../controls/IconButton';
import './detail-panel.css';

export interface DetailPanelProps {
  /** Omit when the object is already labelled by the surface the panel opens from (e.g. a table row). */
  title?: string;
  subtitle?: string;
  onClose: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * Detail surface for a selected object: an optional header with title/subtitle
 * and a sticky trailing actions slot, a close control, and a content body below.
 */
export function DetailPanel({ title, subtitle, onClose, actions, children }: DetailPanelProps) {
  const hasHeading = Boolean(title || subtitle || actions);
  return (
    <div className="ui-detail-panel">
      <div className="ui-detail-panel__close">
        <IconButton label="Close detail" onClick={onClose}>
          ✕
        </IconButton>
      </div>
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
