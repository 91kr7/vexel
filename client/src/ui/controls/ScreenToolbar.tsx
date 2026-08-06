import type { ReactNode } from 'react';
import { Button } from './Button';
import './controls.css';

export interface ScreenToolbarAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface ScreenToolbarProps {
  primaryAction?: ScreenToolbarAction;
  secondaryActions?: ScreenToolbarAction[];
  destructiveAction?: ScreenToolbarAction;
  filters?: ReactNode;
}

/**
 * Screen-level action bar: a leading primary action, secondary actions, and a
 * trailing destructive action, with an optional filters row underneath (search
 * field, filter chips, …).
 */
export function ScreenToolbar({ primaryAction, secondaryActions = [], destructiveAction, filters }: ScreenToolbarProps) {
  return (
    <div className="ui-screen-toolbar">
      <div className="ui-screen-toolbar__actions">
        {primaryAction ? (
          <Button variant="primary" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
            {primaryAction.label}
          </Button>
        ) : null}
        {secondaryActions.map((action) => (
          <Button key={action.label} variant="secondary" onClick={action.onClick} disabled={action.disabled}>
            {action.label}
          </Button>
        ))}
        {destructiveAction ? (
          <Button variant="destructive" onClick={destructiveAction.onClick} disabled={destructiveAction.disabled}>
            {destructiveAction.label}
          </Button>
        ) : null}
      </div>
      {filters ? <div className="ui-screen-toolbar__filters">{filters}</div> : null}
    </div>
  );
}
