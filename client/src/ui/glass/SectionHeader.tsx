import type { ReactNode } from 'react';
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
}

/**
 * The one way a section is titled: a title with an optional same-baseline
 * sublabel and one-line description, and a trailing slot for actions.
 *
 * "The one way" is the point rather than a description — a card's own title is
 * this component (see `Card`), so a screen that titles a section has one
 * component to reach for and no local treatment to invent.
 */
export function SectionHeader({ title, sublabel, description, trailing, variant = 'default' }: SectionHeaderProps) {
  const className = variant === 'eyebrow' ? 'ui-section-header ui-section-header--eyebrow' : 'ui-section-header';
  return (
    <div className={className}>
      <div>
        <h2 className="ui-section-header__title">
          {title}
          {sublabel ? <span className="ui-section-header__sublabel">{sublabel}</span> : null}
        </h2>
        {description ? <p className="ui-section-header__description">{description}</p> : null}
      </div>
      {trailing ? <div>{trailing}</div> : null}
    </div>
  );
}
