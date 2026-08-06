import { FieldMessage } from './FieldMessage';
import { TextField } from './TextField';
import './controls.css';

export interface TimeRange {
  since: string;
  until: string;
}

export interface TimeRangeFieldProps {
  since: string;
  until: string;
  onChange: (range: TimeRange) => void;
  sinceLabel?: string;
  untilLabel?: string;
  placeholder?: string;
  message?: string;
}

/** Since/until pair of free-text inputs bounding a stream in time. */
export function TimeRangeField({
  since,
  until,
  onChange,
  sinceLabel = 'Since',
  untilLabel = 'Until',
  placeholder,
  message,
}: TimeRangeFieldProps) {
  return (
    <div className="ui-time-range">
      <div className="ui-time-range__inputs">
        <label className="ui-time-range__field">
          <span className="ui-time-range__label">{sinceLabel}</span>
          <TextField value={since} placeholder={placeholder} ariaLabel={sinceLabel} onChange={(value) => onChange({ since: value, until })} />
        </label>
        <label className="ui-time-range__field">
          <span className="ui-time-range__label">{untilLabel}</span>
          <TextField value={until} placeholder={placeholder} ariaLabel={untilLabel} onChange={(value) => onChange({ since, until: value })} />
        </label>
      </div>
      {message ? <FieldMessage tone="muted">{message}</FieldMessage> : null}
    </div>
  );
}
