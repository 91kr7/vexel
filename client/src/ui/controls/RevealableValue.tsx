import { Button } from './Button';
import { CopyButton } from './CopyButton';
import './controls.css';

const MASK = '••••••••••••••••••••';

export interface RevealableValueAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface RevealableValueProps {
  /** The value once it is known; absent while it has not been read yet. */
  value?: string;
  ariaLabel: string;
  revealed: boolean;
  onRevealedChange: (revealed: boolean) => void;
  loading?: boolean;
  /** Shown when there is no value yet. */
  placeholder?: string;
  /** One extra action after copy, e.g. rotating the value. */
  action?: RevealableValueAction;
}

/**
 * A sensitive value the application received back (a join token): masked until
 * an explicit reveal, copyable without being shown, with room for the action
 * that replaces it. While hidden the value is not rendered at all — not as
 * text, not as an attribute — so hiding is not a visual effect over readable
 * markup. The mask has a fixed length: its width says nothing about the value
 * behind it. A value the operator types in is `SecretField` instead, which has
 * no reveal control at all.
 */
export function RevealableValue({ value, ariaLabel, revealed, onRevealedChange, loading = false, placeholder = 'Not read yet', action }: RevealableValueProps) {
  const known = value !== undefined && value !== '';
  return (
    <div className="ui-revealable-value">
      <div className="ui-revealable-value__value" aria-label={ariaLabel} role="group">
        {!known ? (
          <span className="ui-revealable-value__placeholder">{loading ? 'Reading…' : placeholder}</span>
        ) : revealed ? (
          <span className="ui-revealable-value__text">{value}</span>
        ) : (
          <span className="ui-revealable-value__mask" aria-hidden="true">
            {MASK}
          </span>
        )}
      </div>
      <div className="ui-revealable-value__actions">
        <Button size="sm" variant="ghost" disabled={!known || loading} onClick={() => onRevealedChange(!revealed)}>
          {revealed ? 'Hide' : 'Show'}
        </Button>
        {/* Kept mounted whatever the state: an affordance that vanishes while
            the value is read and reappears afterwards moves under the pointer.
            Copying does not display the value, so it is available whether the
            value is revealed or hidden — but not before it is known, and not
            while a read could still replace it. */}
        <CopyButton value={value ?? ''} disabled={!known || loading} />
        {action ? (
          <Button size="sm" variant="ghost" disabled={action.disabled || loading} onClick={action.onClick}>
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
