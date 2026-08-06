import { Button } from './Button';
import { Row } from '../layout/Row';
import './controls.css';

export interface FormFooterProps {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
}

/** Save/cancel footer for a form, with a dirty indicator; save is disabled when there is nothing to save. */
export function FormFooter({ dirty, saving = false, onSave, onCancel, saveLabel = 'Save' }: FormFooterProps) {
  return (
    <Row justify="between" align="center">
      <span className="ui-form-footer__status">{dirty ? 'Unsaved changes' : 'No changes'}</span>
      <Row gap="var(--space-2)">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onSave} disabled={!dirty || saving}>
          {saving ? 'Saving…' : saveLabel}
        </Button>
      </Row>
    </Row>
  );
}
