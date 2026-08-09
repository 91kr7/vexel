import { Button } from './Button';
import './controls.css';

export interface StorageUsageRowAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Renders the action in the destructive variant, for a row whose action removes what it counts. */
  destructive?: boolean;
}

export interface StorageUsageRowProps {
  label: string;
  description?: string;
  sizeLabel: string;
  action?: StorageUsageRowAction;
}

/** One "label / description / size / clear-or-prune action" row of a storage-usage listing (REQ-95, REQ-113, REQ-115). */
export function StorageUsageRow({ label, description, sizeLabel, action }: StorageUsageRowProps) {
  return (
    <div className="ui-storage-usage-row">
      <div className="ui-storage-usage-row__text">
        <p className="ui-storage-usage-row__label">{label}</p>
        {description ? <p className="ui-storage-usage-row__description">{description}</p> : null}
      </div>
      <span className="ui-storage-usage-row__size">{sizeLabel}</span>
      {action ? (
        <Button variant={action.destructive ? 'destructive' : 'secondary'} onClick={action.onClick} disabled={action.disabled}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
