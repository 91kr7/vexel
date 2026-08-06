import type { ReactNode } from 'react';
import './controls.css';

export type FieldMessageTone = 'danger' | 'muted';

export interface FieldMessageProps {
  children?: ReactNode;
  tone?: FieldMessageTone;
}

/** Field-level helper or validation message shown under a form control. */
export function FieldMessage({ children, tone = 'danger' }: FieldMessageProps) {
  return <p className={tone === 'danger' ? 'ui-field-message ui-field-message--danger' : 'ui-field-message'}>{children}</p>;
}
