import type { ReactNode } from 'react';
import './controls.css';

export interface IconButtonProps {
  children?: ReactNode;
  label: string;
  onClick?: () => void;
  /** `sm` is a compact variant for inline use inside dense content (e.g. a table cell); default `md`. */
  size?: 'md' | 'sm';
  disabled?: boolean;
}

/** Square icon-only button; `label` is the required accessible name. */
export function IconButton({ children, label, onClick, size = 'md', disabled = false }: IconButtonProps) {
  const className = size === 'sm' ? 'ui-icon-button ui-icon-button--sm' : 'ui-icon-button';
  return (
    <button type="button" className={className} aria-label={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
