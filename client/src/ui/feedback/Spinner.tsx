import './feedback.css';

export interface SpinnerProps {
  label?: string;
}

/** Small rotating indicator for a pending, non-instantaneous operation. */
export function Spinner({ label = 'Loading' }: SpinnerProps) {
  return <span className="ui-spinner" role="status" aria-label={label} />;
}
