import type { ReactNode } from 'react';
import './controls.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}

/** Button with primary/secondary/ghost/destructive variants and md/sm sizes. */
export function Button({ children, variant = 'secondary', size = 'md', disabled = false, onClick, type = 'button' }: ButtonProps) {
  const classes = [
    'ui-button',
    variant !== 'secondary' ? `ui-button--${variant}` : '',
    size === 'sm' ? 'ui-button--sm' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
