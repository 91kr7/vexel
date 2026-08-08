import type { ChangeEvent, ReactNode } from 'react';
import './code-editor.css';

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Shows an "Unsaved changes" indicator above the block. */
  dirty?: boolean;
  readOnly?: boolean;
  maxHeight?: string;
  /** Rendered below the block (e.g. a valid/invalid validation summary). */
  statusLine?: ReactNode;
  ariaLabel?: string;
}

/**
 * Editable monospace code surface: a line-number gutter kept in lockstep with
 * the text by sharing its row flow (no separate scroll to synchronize), a
 * dirty indicator, and a validation status-line slot below the block.
 */
export function CodeEditor({ value, onChange, dirty = false, readOnly = false, maxHeight = '420px', statusLine, ariaLabel }: CodeEditorProps) {
  const lineCount = value.length === 0 ? 1 : value.split('\n').length;
  const lineNumbers = Array.from({ length: lineCount }, (_, index) => index + 1);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
  }

  return (
    <div className="ui-code-editor">
      {dirty ? <span className="ui-code-editor__dirty">Unsaved changes</span> : null}
      <div className="ui-code-editor__body" style={{ maxHeight }}>
        <div className="ui-code-editor__gutter" aria-hidden="true">
          {lineNumbers.map((line) => (
            <div className="ui-code-editor__gutter-line" key={line}>
              {line}
            </div>
          ))}
        </div>
        <textarea
          className="ui-code-editor__textarea"
          rows={lineCount}
          value={value}
          spellCheck={false}
          readOnly={readOnly}
          aria-label={ariaLabel}
          onChange={handleChange}
        />
      </div>
      {statusLine ? <div className="ui-code-editor__status">{statusLine}</div> : null}
    </div>
  );
}
