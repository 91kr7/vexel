import './navigation.css';

export interface FooterStatusProps {
  label: string;
  value: string;
  online?: boolean;
}

/** Footer status block, e.g. the active Docker context. */
export function FooterStatus({ label, value, online = true }: FooterStatusProps) {
  const dotClasses = online ? 'ui-footer-status__dot' : 'ui-footer-status__dot ui-footer-status__dot--offline';
  return (
    <div className="ui-footer-status">
      <p className="ui-footer-status__label">{label}</p>
      <div className="ui-footer-status__value">
        <span className={dotClasses} />
        {value}
      </div>
    </div>
  );
}
