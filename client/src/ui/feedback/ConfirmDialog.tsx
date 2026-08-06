import { Button } from '../controls/Button';
import { Modal } from './Modal';
import './feedback.css';

export interface ConfirmDialogProps {
  open: boolean;
  targetName: string;
  consequence: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation dialog that names the target and states the consequence of the
 * action. Cancelling (overlay click or the Cancel button) performs nothing.
 */
export function ConfirmDialog({
  open,
  targetName,
  consequence,
  confirmLabel = 'Confirm',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={`Confirm: ${targetName}`}
      onClose={onCancel}
      actions={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>
        This will affect <span className="ui-confirm-dialog__target">{targetName}</span>. {consequence}
      </p>
    </Modal>
  );
}
