import type { ReactNode } from 'react';
import './controls.css';

export interface IconButtonProps {
  children?: ReactNode;
  label: string;
  onClick?: () => void;
}

/** Square icon-only button; `label` is the required accessible name. */
export function IconButton({ children, label, onClick }: IconButtonProps) {
  return (
    <button type="button" className="ui-icon-button" aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}
