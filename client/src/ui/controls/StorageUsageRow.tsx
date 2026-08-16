import { Button } from './Button';
import '../truncation.css';
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

/**
 * One "label / description / size / clear-or-prune action" row of a
 * storage-usage listing (REQ-95, REQ-113, REQ-115).
 *
 * Honors the library's truncation contract (`truncation.css`): the description
 * — routinely a list of 64-character volume names — shrinks and ellipsises,
 * while the size and the action keep their width and stay whole.
 */
export function StorageUsageRow({ label, description, sizeLabel, action }: StorageUsageRowProps) {
  return (
    <div className="ui-storage-usage-row ui-truncating-row">
      <div className="ui-storage-usage-row__text ui-truncating-run">
        <p className="ui-storage-usage-row__label">{label}</p>
        {description ? <p className="ui-storage-usage-row__description ui-truncating-line">{description}</p> : null}
      </div>
      <span className="ui-storage-usage-row__size ui-truncating-meta">{sizeLabel}</span>
      {action ? (
        <span className="ui-truncating-meta">
          <Button variant={action.destructive ? 'destructive' : 'secondary'} onClick={action.onClick} disabled={action.disabled}>
            {action.label}
          </Button>
        </span>
      ) : null}
    </div>
  );
}
