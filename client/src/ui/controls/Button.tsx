import { useId, type ReactNode } from 'react';
import './controls.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'subtle';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  /**
   * Why the button is in the state it is in — typically why it is disabled, so
   * a greyed control reads as "not now, because…" rather than as broken. Shown
   * on hover and read as the button's accessible description; it never becomes
   * part of its name.
   */
  description?: string;
}

/** Button with primary/secondary/ghost/destructive/subtle variants and md/sm sizes. */
export function Button({ children, variant = 'secondary', size = 'md', disabled = false, onClick, type = 'button', description }: ButtonProps) {
  const descriptionId = useId();
  const classes = [
    'ui-button',
    variant !== 'secondary' ? `ui-button--${variant}` : '',
    size === 'sm' ? 'ui-button--sm' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const button = (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      aria-describedby={description ? descriptionId : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
  if (!description) return button;
  // A disabled button dispatches no pointer event, so its own `title` would
  // never surface: the tooltip is carried by the element around it instead.
  return (
    <span className="ui-button-with-description" title={description}>
      {button}
      <span id={descriptionId} className="ui-button-with-description__text">
        {description}
      </span>
    </span>
  );
}
