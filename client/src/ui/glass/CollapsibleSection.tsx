import { useState, type ReactNode } from 'react';
import './collapsible-section.css';

export interface CollapsibleSectionProps {
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  /** Drives the open state from outside; `defaultOpen` is then ignored. */
  open?: boolean;
  /** The header was pressed, with the state it asks for. */
  onToggle?: (open: boolean) => void;
  children?: ReactNode;
}

/**
 * A titled section that expands/collapses its content; closed by default.
 *
 * Uncontrolled unless `open` is given, so a caller that has to open a section
 * itself — a find opening the sections holding its matches — states it, and
 * every other caller keeps the state the component holds for it.
 */
export function CollapsibleSection({ title, summary, defaultOpen = false, open, onToggle, children }: CollapsibleSectionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;
  function toggle() {
    if (open === undefined) setUncontrolledOpen((current) => !current);
    onToggle?.(!isOpen);
  }
  return (
    <div className="ui-collapsible-section">
      <button type="button" className="ui-collapsible-section__header" aria-expanded={isOpen} onClick={toggle}>
        <span className="ui-collapsible-section__chevron">{isOpen ? '▾' : '▸'}</span>
        <span className="ui-collapsible-section__title">{title}</span>
        {summary ? <span className="ui-collapsible-section__summary">{summary}</span> : null}
      </button>
      {isOpen ? <div className="ui-collapsible-section__body">{children}</div> : null}
    </div>
  );
}
