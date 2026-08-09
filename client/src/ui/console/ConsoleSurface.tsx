import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Badge, type BadgeTone } from '../controls/Badge';
import { Button } from '../controls/Button';
import { CopyButton } from '../controls/CopyButton';
import { ScrollArea } from '../glass/ScrollArea';
import { Spinner } from '../feedback/Spinner';
import './console-surface.css';

export interface ConsoleEntryLine {
  id: string;
  text: string;
  /** `stderr` is set apart from the rest of the transcript. */
  stream?: 'stdout' | 'stderr';
}

export interface ConsoleEntry {
  id: string;
  /** The line as it was typed; shown after the prompt symbol, never rewritten. */
  command: string;
  /** Where the entry ran, stated on the entry itself (e.g. a channel name). */
  channelLabel?: string;
  lines: ConsoleEntryLine[];
  /** How it ended, in the caller's own words (e.g. "exit 0", "HTTP 404"). */
  status?: string;
  statusTone?: BadgeTone;
  /** Still producing output: the entry shows a pending indicator instead of a status. */
  running?: boolean;
  /** Muted aside next to the status (e.g. why the entry was not kept). */
  note?: string;
}

export interface ConsoleSurfaceProps {
  entries: ConsoleEntry[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  promptSymbol?: string;
  placeholder?: string;
  inputAriaLabel?: string;
  /** Earlier commands, oldest last; the up/down arrows walk them into the prompt. */
  recallable?: string[];
  /** An entry is still running: the prompt does not submit and the cancel action is offered. */
  busy?: boolean;
  onCancel?: () => void;
  /** Offered on every past entry when set; hands back the entry that must run again. */
  onRerun?: (entryId: string) => void;
  maxHeight?: string;
  emptyLabel?: string;
}

/**
 * Transcript of a command console: past entries with their output and how each
 * one ended, and the prompt that adds the next one, on the same surface.
 *
 * Not a `LogStream`: that surface is one continuous tail of a single stream,
 * where this one is a sequence of self-contained entries — each with its own
 * command, status, copy and re-run — followed by an editable prompt line.
 */
export function ConsoleSurface({
  entries,
  value,
  onChange,
  onSubmit,
  promptSymbol = '$',
  placeholder,
  inputAriaLabel = 'Console prompt',
  recallable = [],
  busy = false,
  onCancel,
  onRerun,
  maxHeight = '420px',
  emptyLabel = 'Nothing has been run yet.',
}: ConsoleSurfaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Distance from the end of `recallable`; `null` while the operator's own
  // draft is in the prompt, so walking back down restores exactly that draft.
  const [recallOffset, setRecallOffset] = useState<number | null>(null);
  const draftRef = useRef('');

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [entries]);

  function recall(direction: -1 | 1) {
    if (recallable.length === 0) return;
    const next = recallOffset === null ? (direction === -1 ? recallable.length - 1 : null) : recallOffset + direction;
    if (next === null || next >= recallable.length) {
      setRecallOffset(null);
      onChange(draftRef.current);
      return;
    }
    if (next < 0) return;
    if (recallOffset === null) draftRef.current = value;
    setRecallOffset(next);
    onChange(recallable[next]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      recall(-1);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      recall(1);
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (busy || value.trim() === '') return;
    setRecallOffset(null);
    draftRef.current = '';
    onSubmit();
  }

  return (
    <div className="ui-console-surface">
      <ScrollArea ref={scrollRef} maxHeight={maxHeight}>
        <div className="ui-console-surface__transcript">
          {entries.length === 0 ? <p className="ui-console-surface__empty">{emptyLabel}</p> : null}
          {entries.map((entry) => (
            <div key={entry.id} className="ui-console-surface__entry">
              <div className="ui-console-surface__command-row">
                <span className="ui-console-surface__symbol" aria-hidden="true">
                  {promptSymbol}
                </span>
                <span className="ui-console-surface__command">{entry.command}</span>
                <span className="ui-console-surface__entry-actions">
                  {entry.channelLabel ? (
                    <Badge tone="info" variant="quiet">
                      {entry.channelLabel}
                    </Badge>
                  ) : null}
                  {entry.running ? <Spinner /> : null}
                  {!entry.running && entry.status ? <Badge tone={entry.statusTone ?? 'neutral'}>{entry.status}</Badge> : null}
                  {entry.note ? <span className="ui-console-surface__note">{entry.note}</span> : null}
                  <CopyButton value={transcriptOf(entry, promptSymbol)} />
                  {onRerun ? (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRerun(entry.id)}>
                      Re-run
                    </Button>
                  ) : null}
                </span>
              </div>
              {entry.lines.map((line) => (
                <p
                  key={line.id}
                  className={
                    line.stream === 'stderr' ? 'ui-console-surface__line ui-console-surface__line--stderr' : 'ui-console-surface__line'
                  }
                >
                  {line.text}
                </p>
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="ui-console-surface__prompt">
        <span className="ui-console-surface__symbol" aria-hidden="true">
          {promptSymbol}
        </span>
        <input
          type="text"
          className="ui-console-surface__input"
          value={value}
          placeholder={placeholder}
          aria-label={inputAriaLabel}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setRecallOffset(null);
            draftRef.current = event.target.value;
            onChange(event.target.value);
          }}
          onKeyDown={handleKeyDown}
        />
        {busy && onCancel ? (
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** What a per-entry copy hands over: the command as typed, then its output. */
function transcriptOf(entry: ConsoleEntry, promptSymbol: string): string {
  const output = entry.lines.map((line) => line.text).join('\n');
  const head = `${promptSymbol} ${entry.command}`;
  return output ? `${head}\n${output}` : head;
}
