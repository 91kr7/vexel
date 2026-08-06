import { useState, type ReactNode } from 'react';
import './collapsible-section.css';

export interface CollapsibleSectionProps {
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children?: ReactNode;
}

/** A titled section that expands/collapses its content; closed by default. */
export function CollapsibleSection({ title, summary, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="ui-collapsible-section">
      <button type="button" className="ui-collapsible-section__header" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span className="ui-collapsible-section__chevron">{open ? '▾' : '▸'}</span>
        <span className="ui-collapsible-section__title">{title}</span>
        {summary ? <span className="ui-collapsible-section__summary">{summary}</span> : null}
      </button>
      {open ? <div className="ui-collapsible-section__body">{children}</div> : null}
    </div>
  );
}
