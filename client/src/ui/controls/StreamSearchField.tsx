import { Button } from './Button';
import { TextField } from './TextField';
import './controls.css';

export interface StreamSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  matchCount: number;
  activeMatchIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  placeholder?: string;
}

/** In-surface search box of a stream: term, match count and next/previous. */
export function StreamSearchField({
  value,
  onChange,
  matchCount,
  activeMatchIndex,
  onNext,
  onPrevious,
  placeholder = 'Filter…',
}: StreamSearchFieldProps) {
  const indicator = value === '' ? '' : matchCount === 0 ? 'No matches' : `${activeMatchIndex + 1}/${matchCount}`;
  return (
    <div className="ui-stream-search">
      <div className="ui-stream-search__input">
        <TextField value={value} onChange={onChange} placeholder={placeholder} ariaLabel="Search the stream" onSubmit={onNext} />
      </div>
      {indicator ? <span className="ui-stream-search__indicator">{indicator}</span> : null}
      <Button size="sm" disabled={matchCount === 0} onClick={onPrevious}>
        Previous
      </Button>
      <Button size="sm" disabled={matchCount === 0} onClick={onNext}>
        Next
      </Button>
    </div>
  );
}
