import { Button } from './Button';
import { Menu, type MenuEntry } from './Menu';
import './controls.css';

export interface RowAction {
  id: string;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Why the action is unavailable, so a greyed control is legible as "not now, because…". */
  disabledReason?: string;
}

export interface ActionButtonGroupOverflow {
  /** Accessible name of the trigger, e.g. "More actions for web-1". */
  label: string;
  entries: MenuEntry[];
}

export interface ActionButtonGroupProps {
  actions: RowAction[];
  /** Menu of secondary actions, always rendered as the group's last, trailing slot. */
  overflow?: ActionButtonGroupOverflow;
}

/**
 * Inline group of dense action buttons for a table row, with a destructive
 * variant and an optional trailing overflow menu. Stops click propagation so an
 * action never also triggers the containing DataTable row's `onRowSelect`.
 */
export function ActionButtonGroup({ actions, overflow }: ActionButtonGroupProps) {
  return (
    <div className="ui-action-button-group" onClick={(event) => event.stopPropagation()}>
      {actions.map((action) => (
        <Button
          key={action.id}
          size="sm"
          variant={action.destructive ? 'destructive' : 'secondary'}
          disabled={action.disabled}
          description={action.disabled ? action.disabledReason : undefined}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
      {overflow ? <Menu label={overflow.label} entries={overflow.entries} /> : null}
    </div>
  );
}
