import { useId, useRef } from 'react';
import { Button } from './Button';
import './controls.css';

export interface FilePickerProps {
  file: File | null;
  onChange: (file: File | null) => void;
  label?: string;
  ariaLabel?: string;
  accept?: string;
  disabled?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)}${units[unitIndex]}`;
}

/** Picks a file from the operator's own machine to upload, showing its name and size once chosen (REQ-42, REQ-43). */
export function FilePicker({ file, onChange, label, ariaLabel, accept, disabled = false }: FilePickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(event.target.files?.[0] ?? null);
    event.target.value = '';
  }

  return (
    <div className="ui-file-picker">
      {label ? (
        <label className="ui-file-picker__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div className="ui-file-picker__row">
        <Button variant="subtle" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
          {file ? 'Change file…' : 'Choose file…'}
        </Button>
        <span className="ui-file-picker__summary">{file ? `${file.name} · ${formatBytes(file.size)}` : 'No file selected'}</span>
      </div>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        aria-label={ariaLabel ?? label}
        className="ui-file-picker__input"
        disabled={disabled}
        onChange={handleChange}
      />
    </div>
  );
}
