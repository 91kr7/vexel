import type { ReactNode } from 'react';
import '../truncation.css';
import './section-header.css';

export interface SectionHeaderProps {
  title: string;
  /**
   * A qualifier belonging to the title — what the section holds, a count, a
   * scope. Rendered **on the title's own line and its own baseline**, never as
   * a line under it: a header that grows a line taller than the one beside it
   * starts its card's content lower than its neighbour's, which is the
   * side-by-side misalignment this exists to prevent. Two headers in a row
   * therefore share a baseline whether one, both or neither carries a sublabel.
   */
  sublabel?: string;
  description?: string;
  trailing?: ReactNode;
  /** `eyebrow` renders a small uppercase label for a column/group heading instead of a full title. */
  variant?: 'default' | 'eyebrow';
  /**
   * The title gives way instead of pushing what sits beside it out of place: it
   * keeps one line and ellipsises at its end. For a header standing in a row
   * with something anchored to its right.
   */
  truncate?: boolean;
}

/**
 * The one way a section is titled: a title with an optional same-baseline
 * sublabel and one-line description, and a trailing slot for actions.
 *
 * "The one way" is the point rather than a description — a card's own title is
 * this component (see `Card`), so a screen that titles a section has one
 * component to reach for and no local treatment to invent.
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
