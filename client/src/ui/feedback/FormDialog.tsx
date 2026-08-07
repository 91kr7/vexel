import type { ReactNode } from 'react';
import { Button } from '../controls/Button';
import { Modal } from './Modal';
import './feedback.css';

export interface FormDialogProps {
  open: boolean;
  title: string;
  description?: string;
  submitLabel?: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

/** Dialog shell for a short create/pull/tag flow: description, form body, cancel/submit footer. */
export function FormDialog({
  open,
  title,
  description,
  submitLabel = 'Submit',
  submitting = false,
  submitDisabled = false,
  onSubmit,
  onCancel,
  children,
}: FormDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} disabled={submitting || submitDisabled}>
            {submitting ? 'Working…' : submitLabel}
          </Button>
        </>
      }
    >
      <div className="ui-form-dialog">
        {description ? <p className="ui-form-dialog__description">{description}</p> : null}
        {children}
      </div>
    </Modal>
  );
}
