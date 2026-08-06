import { Button } from './Button';
import './controls.css';

export interface RowAction {
  id: string;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface ActionButtonGroupProps {
  actions: RowAction[];
}

/** Inline group of dense action buttons for a table row, with a destructive variant. */
export function ActionButtonGroup({ actions }: ActionButtonGroupProps) {
  return (
    <div className="ui-action-button-group">
      {actions.map((action) => (
        <Button
          key={action.id}
          size="sm"
          variant={action.destructive ? 'destructive' : 'secondary'}
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
