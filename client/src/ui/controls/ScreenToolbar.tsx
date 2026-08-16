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
  // A toolbar whose only screen-level control is its filter draws no action row
  // at all: an empty row still consumes the toolbar's own gap, which reads as a
  // band of nothing between the section header and the filter.
  const hasActions = Boolean(primaryAction) || secondaryActions.length > 0 || Boolean(destructiveAction);
  return (
    <div className="ui-screen-toolbar">
      {hasActions ? (
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
      ) : null}
      {filters ? <div className="ui-screen-toolbar__filters">{filters}</div> : null}
    </div>
  );
}
