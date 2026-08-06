import type { ReactNode } from 'react';
import './section-header.css';

export interface SectionHeaderProps {
  title: string;
  description?: string;
  trailing?: ReactNode;
}

/** Title (with optional one-line description) and a trailing slot for actions. */
export function SectionHeader({ title, description, trailing }: SectionHeaderProps) {
  return (
    <div className="ui-section-header">
      <div>
        <h2 className="ui-section-header__title">{title}</h2>
        {description ? <p className="ui-section-header__description">{description}</p> : null}
      </div>
      {trailing ? <div>{trailing}</div> : null}
    </div>
  );
}
