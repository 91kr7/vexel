import type { ReactNode } from 'react';
import { Spinner } from '../feedback/Spinner';
import './controls.css';

export interface IconButtonProps {
  children?: ReactNode;
  label: string;
  onClick?: () => void;
  /** `sm` is a compact variant for inline use inside dense content (e.g. a table cell); default `md`. */
  size?: 'md' | 'sm';
  disabled?: boolean;
  /**
   * The control is waiting on the work it just started: it keeps its box,
   * shows the work is in flight and answers no press until it ends.
   */
  busy?: boolean;
}

/** Square icon-only button; `label` is the required accessible name. */
export function IconButton({ children, label, onClick, size = 'md', disabled = false, busy = false }: IconButtonProps) {
  const className = ['ui-icon-button', size === 'sm' ? 'ui-icon-button--sm' : '', busy ? 'ui-icon-button--busy' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-busy={busy || undefined}
      onClick={onClick}
      disabled={disabled || busy}
    >
      {busy ? <Spinner label={`${label} is working`} /> : children}
    </button>
  );
}
