import type { ReactNode } from 'react';
import '../truncation.css';
import './section-header.css';

export interface SectionHeaderProps {
  title: string;
  /** A qualifier on the title's own line and baseline, never a line under it: two headers stay aligned. */
  sublabel?: string;
  description?: string;
  trailing?: ReactNode;
  /** `eyebrow` renders a small uppercase label for a column/group heading instead of a full title. */
  variant?: 'default' | 'eyebrow';
  /** The title keeps one line and ellipsises at its end rather than pushing its neighbour out of place. */
  truncate?: boolean;
}

/**
 * The one way a section is titled — a card's own title included: a title with an optional
 * same-baseline sublabel and one-line description, and a trailing slot for actions.
 */
export function SectionHeader({ title, sublabel, description, trailing, variant = 'default', truncate = false }: SectionHeaderProps) {
  const className = [
    'ui-section-header',
    variant === 'eyebrow' ? 'ui-section-header--eyebrow' : '',
    truncate ? 'ui-section-header--truncate' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className}>
      <div className="ui-section-header__text">
        <h2 className={truncate ? 'ui-section-header__title ui-truncating-line' : 'ui-section-header__title'} title={truncate ? title : undefined}>
          {title}
          {sublabel ? <span className="ui-section-header__sublabel">{sublabel}</span> : null}
        </h2>
        {description ? <p className="ui-section-header__description">{description}</p> : null}
      </div>
      {trailing ? <div>{trailing}</div> : null}
    </div>
  );
}
