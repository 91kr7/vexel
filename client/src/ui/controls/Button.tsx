import type { ReactNode } from 'react';
import './controls.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}

/** Button with primary/secondary/ghost/destructive variants. */
export function Button({ children, variant = 'secondary', disabled = false, onClick, type = 'button' }: ButtonProps) {
  const classes = variant === 'secondary' ? 'ui-button' : `ui-button ui-button--${variant}`;
  return (
    <button type={type} className={classes} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
