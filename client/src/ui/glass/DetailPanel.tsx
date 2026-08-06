import type { ReactNode } from 'react';
import { IconButton } from '../controls/IconButton';
import './detail-panel.css';

export interface DetailPanelProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * Detail surface for a selected object: header with title/subtitle and a
 * sticky trailing actions slot, a close control, and a content body below.
 */
export function DetailPanel({ title, subtitle, onClose, actions, children }: DetailPanelProps) {
  return (
    <div className="ui-detail-panel">
      <div className="ui-detail-panel__header">
        <div className="ui-detail-panel__heading">
          <p className="ui-detail-panel__title">{title}</p>
          {subtitle ? <p className="ui-detail-panel__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="ui-detail-panel__actions">{actions}</div> : null}
        <IconButton label="Close detail" onClick={onClose}>
          ✕
        </IconButton>
      </div>
      <div className="ui-detail-panel__body">{children}</div>
    </div>
  );
}
