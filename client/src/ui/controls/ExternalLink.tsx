import './controls.css';

export interface ExternalLinkProps {
  /** Absolute URL the link leads to; shown verbatim when no `label` is given. */
  href: string;
  /** Text shown in place of the URL. Omit to present the URL itself. */
  label?: string;
}

/**
 * A route to a document outside the application: followed in one step, opened
 * in its own browsing context, and — with no `label` — legible as the URL
 * itself, so it stays usable where following it is impossible (a host with no
 * outbound network, a screenshot, a printed page).
 */
export function ExternalLink({ href, label }: ExternalLinkProps) {
  return (
    <a className="ui-external-link" href={href} target="_blank" rel="noreferrer noopener">
      {label ?? href}
      <span className="ui-external-link__glyph" aria-hidden="true">
        ↗
      </span>
    </a>
  );
}
