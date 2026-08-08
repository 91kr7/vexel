import { IconButton } from './IconButton';
import './controls.css';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Decrement / value / increment control for a small bounded integer (e.g. a service's replica count). */
export function Stepper({ value, onChange, min = 0, max, step = 1, disabled = false, ariaLabel = 'value' }: StepperProps) {
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  function decrement() {
    onChange(Math.max(min, value - step));
  }

  function increment() {
    onChange(max !== undefined ? Math.min(max, value + step) : value + step);
  }

  return (
    <div className="ui-stepper">
      <IconButton label={`Decrease ${ariaLabel}`} size="sm" disabled={disabled || atMin} onClick={decrement}>
        {'−'}
      </IconButton>
      <span className="ui-stepper__value">{value}</span>
      <IconButton label={`Increase ${ariaLabel}`} size="sm" disabled={disabled || atMax} onClick={increment}>
        {'+'}
      </IconButton>
    </div>
  );
}
