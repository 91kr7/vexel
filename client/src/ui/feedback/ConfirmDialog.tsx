import type { ReactNode } from 'react';
import { Button } from '../controls/Button';
import { Modal } from './Modal';
import './feedback.css';

export interface ConfirmDialogProps {
  open: boolean;
  targetName: string;
  consequence: string;
  confirmLabel?: string;
  destructive?: boolean;
  /** Extra content between the consequence and the buttons, e.g. the scope the action will act on. */
  children?: ReactNode;
  /** Blocks confirming while the extra content is not in a state the action can run on. */
  confirmDisabled?: boolean;
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
  children,
  confirmDisabled = false,
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
          <Button variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>
        This will affect <span className="ui-confirm-dialog__target">{targetName}</span>. {consequence}
      </p>
      {children ? <div className="ui-confirm-dialog__extra">{children}</div> : null}
    </Modal>
  );
}
