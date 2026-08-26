import type { ReactNode } from 'react';
import { Button } from './Button';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import './controls.css';

export interface FormFooterProps {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
  /** A consequence the form states for as long as it is open, beside its save and cancel; never an action. */
  note?: ReactNode;
}

/** Save/cancel footer for a form, with a dirty indicator; save is disabled when there is nothing to save. */
export function FormFooter({ dirty, saving = false, onSave, onCancel, saveLabel = 'Save', note }: FormFooterProps) {
  const status = <span className="ui-form-footer__status">{dirty ? 'Unsaved changes' : 'No changes'}</span>;
  return (
    <Row justify="between" align="center">
      {/* Without a note the leading side is what it has always been: the indicator alone, unwrapped. */}
      {note === undefined ? (
        status
      ) : (
        <Stack gap="var(--space-1)">
          <span className="ui-form-footer__note">{note}</span>
          {status}
        </Stack>
      )}
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
