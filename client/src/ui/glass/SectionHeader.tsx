import type { ReactNode } from 'react';
import './section-header.css';

export interface SectionHeaderProps {
  title: string;
  description?: string;
  trailing?: ReactNode;
  /** `eyebrow` renders a small uppercase label for a column/group heading instead of a full title. */
  variant?: 'default' | 'eyebrow';
}

/** Title (with optional one-line description) and a trailing slot for actions. */
export function SectionHeader({ title, description, trailing, variant = 'default' }: SectionHeaderProps) {
  const className = variant === 'eyebrow' ? 'ui-section-header ui-section-header--eyebrow' : 'ui-section-header';
  return (
    <div className={className}>
      <div>
        <h2 className="ui-section-header__title">{title}</h2>
        {description ? <p className="ui-section-header__description">{description}</p> : null}
      </div>
      {trailing ? <div>{trailing}</div> : null}
    </div>
  );
}
