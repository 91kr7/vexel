import { Badge } from './Badge';
import { Button } from './Button';
import './controls.css';

export interface BulkActionBarAction {
  id: string;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface BulkActionBarProps {
  count: number;
  label?: string;
  actions: BulkActionBarAction[];
  onClear: () => void;
}

/** Bar shown above a list once at least one row is multi-selected: the selection count, its bulk actions, and a clear affordance. */
export function BulkActionBar({ count, label = 'selected', actions, onClear }: BulkActionBarProps) {
  if (count === 0) return null;
  return (
    <div className="ui-bulk-action-bar">
      <Badge tone="neutral">{`${count} ${label}`}</Badge>
      <div className="ui-bulk-action-bar__actions">
        {actions.map((action) => (
          <Button key={action.id} variant={action.destructive ? 'destructive' : 'secondary'} size="sm" onClick={action.onClick} disabled={action.disabled}>
            {action.label}
          </Button>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
