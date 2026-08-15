import { Fragment, useEffect, useLayoutEffect, useRef, useState, type UIEvent } from 'react';
import { Button } from '../controls/Button';
import { EmptyState } from '../feedback/EmptyState';
import { ScrollArea } from '../glass/ScrollArea';
import '../glass/overlay-glass.css';
import './log-stream.css';

export interface LogStreamLine {
  id: string;
  text: string;
  /** Display-ready timestamp (formatting is a feature-layer concern). */
  timestamp?: string;
  stream?: 'stdout' | 'stderr';
  /** Origin label (e.g. a compose service name) shown before the timestamp, for an aggregated stream. */
  source?: string;
}

export interface LogStreamProps {
  lines: LogStreamLine[];
  showTimestamps?: boolean;
  follow?: boolean;
  onFollowChange?: (follow: boolean) => void;
  /** Case-insensitive substring marked inside every line that contains it. */
  highlight?: string;
  /** Line brought into view and emphasized as the current match. */
  activeMatchLineId?: string;
  maxHeight?: string;
  lineHeight?: number;
  emptyLabel?: string;
  /** When set, a download action saving the buffer under this name is offered. */
  downloadFileName?: string;
}

const OVERSCAN_LINES = 12;
const BOTTOM_TOLERANCE_PX = 8;

/**
 * Virtualised monospace log surface (REQ-30, REQ-31): follow/auto-scroll with a
 * "jump to live" affordance, an optional timestamp column, stdout/stderr
 * tagging, match highlighting, and copy/download of the displayed buffer.
 */
export function LogStream({
  lines,
  showTimestamps = false,
  follow = true,
  onFollowChange,
  highlight,
  activeMatchLineId,
  maxHeight = '320px',
  lineHeight = 20,
  emptyLabel = 'No log output.',
  downloadFileName,
}: LogStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useLayoutEffect(() => {
    if (scrollRef.current) setViewportHeight(scrollRef.current.clientHeight);
  }, [maxHeight, lines.length]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !follow) return;
    element.scrollTop = element.scrollHeight;
    setScrollTop(element.scrollTop);
  }, [follow, lines]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || activeMatchLineId === undefined) return;
    const index = lines.findIndex((line) => line.id === activeMatchLineId);
    if (index === -1) return;
    const target = index * lineHeight;
    if (target >= element.scrollTop && target + lineHeight <= element.scrollTop + element.clientHeight) return;
    element.scrollTop = Math.max(0, target - element.clientHeight / 2);
    setScrollTop(element.scrollTop);
  }, [activeMatchLineId, lines, lineHeight]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    setScrollTop(element.scrollTop);
    if (!onFollowChange) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_TOLERANCE_PX;
    if (atBottom !== follow) onFollowChange(atBottom);
  }

  const plainText = lines
    .map((line) => {
      const prefix = [line.source, showTimestamps ? line.timestamp : undefined].filter(Boolean).join(' ');
      return prefix ? `${prefix} ${line.text}` : line.text;
    })
    .join('\n');

  function download() {
    if (!downloadFileName) return;
    const url = URL.createObjectURL(new Blob([plainText], { type: 'text/plain' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = downloadFileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const startIndex = Math.max(0, Math.floor(scrollTop / lineHeight) - OVERSCAN_LINES);
  const endIndex = Math.min(lines.length, Math.ceil((scrollTop + viewportHeight) / lineHeight) + OVERSCAN_LINES);
  const visibleLines = lines.slice(startIndex, endIndex);
  const topSpacerHeight = startIndex * lineHeight;
  const bottomSpacerHeight = (lines.length - endIndex) * lineHeight;

  return (
    <div className="ui-log-stream">
      {/* Not rendered at all when it would have no children — a stream offered
          without a download filename, which is Compose whenever no project is
          selected. An empty flex child still consumes its parent's gap. */}
      {downloadFileName ? (
        <div className="ui-log-stream__actions">
          <Button size="sm" onClick={download}>
            Download
          </Button>
        </div>
      ) : null}
      {lines.length === 0 ? (
        <EmptyState title={emptyLabel} description={null} action={null} />
      ) : (
        <div className="ui-log-stream__surface">
          <ScrollArea ref={scrollRef} maxHeight={maxHeight} onScroll={handleScroll}>
            <div className="ui-log-stream__lines">
              {topSpacerHeight > 0 ? <div style={{ height: topSpacerHeight }} /> : null}
              {visibleLines.map((line) => {
                const classes = [
                  'ui-log-stream__line',
                  line.stream === 'stderr' ? 'ui-log-stream__line--stderr' : '',
                  line.id === activeMatchLineId ? 'ui-log-stream__line--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <div key={line.id} className={classes} style={{ height: lineHeight }}>
                    {line.source ? <span className="ui-log-stream__source">{line.source}</span> : null}
                    {showTimestamps && line.timestamp ? <span className="ui-log-stream__timestamp">{line.timestamp}</span> : null}
                    <span className="ui-log-stream__text">{renderHighlighted(line.text, highlight)}</span>
                  </div>
                );
              })}
              {bottomSpacerHeight > 0 ? <div style={{ height: bottomSpacerHeight }} /> : null}
            </div>
          </ScrollArea>
          {follow ? null : (
            <div className="ui-log-stream__jump ui-overlay-glass">
              <Button size="sm" variant="primary" onClick={() => onFollowChange?.(true)}>
                Jump to live
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function renderHighlighted(text: string, highlight: string | undefined) {
  if (!highlight) return text;
  const needle = highlight.toLowerCase();
  const haystack = text.toLowerCase();
  const parts = [];
  let cursor = 0;
  let found = haystack.indexOf(needle);
  while (found !== -1) {
    if (found > cursor) parts.push(<Fragment key={cursor}>{text.slice(cursor, found)}</Fragment>);
    parts.push(
      <mark key={`m${found}`} className="ui-log-stream__match">
        {text.slice(found, found + highlight.length)}
      </mark>,
    );
    cursor = found + highlight.length;
    found = haystack.indexOf(needle, cursor);
  }
  if (cursor === 0) return text;
  if (cursor < text.length) parts.push(<Fragment key={cursor}>{text.slice(cursor)}</Fragment>);
  return parts;
}
