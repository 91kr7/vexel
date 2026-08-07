import type { ReactNode } from 'react';
import './controls.css';

export interface FormSectionProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

/** One titled group of fields inside a long form; several stack into a sectioned form body. */
export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="ui-form-section">
      <h3 className="ui-form-section__title">{title}</h3>
      {description ? <p className="ui-form-section__description">{description}</p> : null}
      <div className="ui-form-section__body">{children}</div>
    </section>
  );
}
