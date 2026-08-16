import type { ReactNode } from 'react';
import { SectionHeader } from '../glass/SectionHeader';
import './controls.css';

export interface FormSectionProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

/**
 * One titled group of fields inside a long form; several stack into one
 * sectioned form.
 *
 * A group is **not a card**: it draws no border, no background and no inset of
 * its own, because a dialog full of them reads as boxes inside a box and scrolls
 * for a screen and a half. What separates one group from the next is its
 * heading and the space above it — and the heading is the product's one section
 * header rather than a treatment this file invents.
 */
export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="ui-form-section">
      <SectionHeader variant="eyebrow" title={title} description={description} />
      <div className="ui-form-section__body">{children}</div>
    </section>
  );
}
