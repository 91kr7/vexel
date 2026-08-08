import './controls.css';

export interface CrossReferenceProps {
  /** Kind of the referenced object, shown ahead of its label (e.g. "cache entry"). */
  kind?: string;
  /** The referenced object's own label. Ignored when `unavailableReason` is given. */
  label?: string;
  /** Follows the reference; without it the reference is shown but is inert. */
  onNavigate?: () => void;
  /** States why the reference does not exist; rendered in place of the label, muted and inert. */
  unavailableReason?: string;
}

/**
 * A reference to another object: a compact chip that leads to it when
 * followable, and — when the reference genuinely does not exist — the stated
 * reason in its place, so a missing relation is never shown as blankness.
 */
export function CrossReference({ kind, label, onNavigate, unavailableReason }: CrossReferenceProps) {
  const kindPart = kind ? <span className="ui-cross-reference__kind">{kind}</span> : null;

  if (unavailableReason !== undefined) {
    return (
      <span className="ui-cross-reference ui-cross-reference--unavailable" title={unavailableReason}>
        {kindPart}
        <span className="ui-cross-reference__reason">{unavailableReason}</span>
      </span>
    );
  }

  const body = (
    <>
      {kindPart}
      <span className="ui-cross-reference__label">{label}</span>
      {onNavigate ? (
        <span className="ui-cross-reference__arrow" aria-hidden="true">
          →
        </span>
      ) : null}
    </>
  );

  if (!onNavigate) return <span className="ui-cross-reference">{body}</span>;
  return (
    <button type="button" className="ui-cross-reference ui-cross-reference--navigable" onClick={onNavigate}>
      {body}
    </button>
  );
}

export interface CrossReferenceItem {
  key: string;
  kind?: string;
  label: string;
  onNavigate?: () => void;
}

export interface CrossReferenceListProps {
  items: CrossReferenceItem[];
  /** States why the whole set is unavailable; rendered in place of the items. */
  unavailableReason?: string;
  /** Shown when there is nothing to reference and no reason was given. */
  emptyLabel?: string;
}

/** A wrapping row of CrossReferences, or the single reason none of them exists. */
export function CrossReferenceList({ items, unavailableReason, emptyLabel }: CrossReferenceListProps) {
  if (unavailableReason !== undefined) {
    return (
      <span className="ui-cross-reference-list">
        <CrossReference unavailableReason={unavailableReason} />
      </span>
    );
  }
  if (items.length === 0) {
    return <span className="ui-cross-reference-list">{emptyLabel ? <span className="ui-cross-reference__reason">{emptyLabel}</span> : null}</span>;
  }
  return (
    <span className="ui-cross-reference-list">
      {items.map((item) => (
        <CrossReference key={item.key} kind={item.kind} label={item.label} onNavigate={item.onNavigate} />
      ))}
    </span>
  );
}
