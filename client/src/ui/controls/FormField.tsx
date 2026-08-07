import type { ReactNode } from 'react';
import { FieldMessage } from './FieldMessage';
import './controls.css';

export interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  children?: ReactNode;
}

/** A labelled form control with an optional hint, replaced by the error message when the field is invalid. */
export function FormField({ label, hint, error, children }: FormFieldProps) {
  return (
    <div className="ui-form-field">
      <span className="ui-form-field__label">{label}</span>
      <div className="ui-form-field__control">{children}</div>
      {error ? <FieldMessage tone="danger">{error}</FieldMessage> : hint ? <FieldMessage tone="muted">{hint}</FieldMessage> : null}
    </div>
  );
}
