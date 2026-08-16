import { useState } from 'react';
import { Button } from './Button';
import { FieldMessage } from './FieldMessage';
import './controls.css';

export interface ChipInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  addLabel?: string;
  error?: string;
}

/** Free-form list of short values: each entered value becomes a removable chip. */
export function ChipInput({ values, onChange, placeholder, ariaLabel, addLabel = 'Add', error }: ChipInputProps) {
  const [draft, setDraft] = useState('');

  function commit() {
    const entry = draft.trim();
    if (entry === '' || values.includes(entry)) {
      setDraft('');
      return;
    }
    onChange([...values, entry]);
    setDraft('');
  }

  return (
    <div className="ui-chip-input">
      {values.length > 0 ? (
        <div className="ui-chip-input__chips">
          {values.map((entry) => (
            <span key={entry} className="ui-chip-input__chip">
              {entry}
              <button type="button" className="ui-chip-input__remove" aria-label={`Remove ${entry}`} onClick={() => onChange(values.filter((value) => value !== entry))}>
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="ui-chip-input__entry">
        <input
          type="text"
          className={error ? 'ui-text-field ui-text-field--error' : 'ui-text-field'}
          value={draft}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            commit();
          }}
        />
        {/* The same rule as the other add affordances: a control that adds a value
            is drawn as a control, whatever the width of the field beside it. */}
        <Button size="sm" onClick={commit} disabled={draft.trim() === ''}>
          {addLabel}
        </Button>
      </div>
      {error ? <FieldMessage tone="danger">{error}</FieldMessage> : null}
    </div>
  );
}
