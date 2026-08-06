import './feedback.css';

export interface ProgressBarProps {
  /** 0-100; omit for an indeterminate progress bar. */
  percent?: number;
}

/** Determinate or indeterminate progress indicator. */
export function ProgressBar({ percent }: ProgressBarProps) {
  const classes =
    typeof percent === 'number' ? 'ui-progress-bar__fill' : 'ui-progress-bar__fill ui-progress-bar__fill--indeterminate';
  return (
    <div className="ui-progress-bar">
      <div className={classes} style={typeof percent === 'number' ? { width: `${percent}%` } : undefined} />
    </div>
  );
}
