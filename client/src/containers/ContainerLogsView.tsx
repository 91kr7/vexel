import { useMemo, useRef, useState } from 'react';
import {
  ControlGroup,
  ErrorBanner,
  LogStream,
  MetaCell,
  SegmentedControl,
  Stack,
  StreamSearchField,
  TailSizeSelector,
  TimeRangeField,
  Toggle,
  type LogStreamLine,
  type TailSize,
} from '../ui';
import { useContainerLogs } from '../data/use-container-logs';
import { readLogLevel } from './log-level';
import type { ContainerLogLine } from '../data/container-logs-client';
import type { ContainerSummary } from '../data/containers-client';

export interface ContainerLogsViewProps {
  container: ContainerSummary;
}

const STREAM_OPTIONS = [
  { id: 'stdout', label: 'stdout' },
  { id: 'stderr', label: 'stderr' },
];

/**
 * A container's logs (REQ-30, REQ-31), with the controls in two labelled groups
 * on the stream's own action row: `Fetch` — what the daemon is asked for, each
 * of which reopens the stream — and `Read` — what is done with what arrived,
 * the download among them. Each group wraps whole, so a break falls between
 * them and never inside one.
 *
 * The lines are handed the level their text states; a line stating none is left
 * neutral (`log-level.ts`).
 */
export function ContainerLogsView({ container }: ContainerLogsViewProps) {
  const [streams, setStreams] = useState<string[]>(['stdout', 'stderr']);
  const [timestamps, setTimestamps] = useState(false);
  const [tail, setTail] = useState<TailSize>(500);
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [follow, setFollow] = useState(true);
  const [search, setSearch] = useState('');
  const [matchCursor, setMatchCursor] = useState(0);

  const { lines, ended, error, restart } = useContainerLogs(container.id, {
    stdout: streams.includes('stdout'),
    stderr: streams.includes('stderr'),
    follow: true,
    timestamps,
    tail,
    since,
    until,
  });

  // One reading per line, kept against the line itself: the buffer holds up to
  // 5000 lines and is re-mapped on every flush, so re-reading the whole of it
  // ten times a second would put the level deduction on the region's repaint
  // path. A buffered line never changes, so a cached reading cannot go stale.
  const read = useRef(new WeakMap<ContainerLogLine, LogStreamLine>());
  const streamLines = useMemo<LogStreamLine[]>(
    () =>
      lines.map((line) => {
        const cached = read.current.get(line);
        if (cached) return cached;
        const mapped: LogStreamLine = {
          id: String(line.seq),
          text: line.text,
          timestamp: line.timestamp,
          stream: line.stream,
          level: readLogLevel(line.text),
        };
        read.current.set(line, mapped);
        return mapped;
      }),
    [lines],
  );

  const matches = useMemo(() => {
    if (search.trim() === '') return [];
    const needle = search.toLowerCase();
    return streamLines.filter((line) => line.text.toLowerCase().includes(needle)).map((line) => line.id);
  }, [streamLines, search]);

  const activeMatchIndex = matches.length === 0 ? 0 : ((matchCursor % matches.length) + matches.length) % matches.length;
  const activeMatchLineId = matches.length === 0 ? undefined : matches[activeMatchIndex];

  return (
    <Stack gap="var(--space-3)">
      {error ? <ErrorBanner title="Could not stream the container logs" detail={error} onRetry={restart} /> : null}
      {ended && lines.length > 0 ? <MetaCell>Stream ended.</MetaCell> : null}
      {/* The log region's bound is the region it is placed in — the dialog's stable height,
          less the bands above it — instead of a stated maximum. What is streamed, buffered,
          rendered or downloaded does not follow from it. */}
      <LogStream
        fill
        lines={streamLines}
        showTimestamps={timestamps}
        follow={follow}
        onFollowChange={setFollow}
        highlight={search.trim() === '' ? undefined : search}
        activeMatchLineId={activeMatchLineId}
        downloadFileName={`${container.name}-logs.txt`}
        emptyLabel={ended ? 'The container produced no log output.' : 'Waiting for log output…'}
        toolbar={(download) => (
          <>
            <ControlGroup label="Fetch">
              <SegmentedControl ariaLabel="Streams" options={STREAM_OPTIONS} selectedIds={streams} onChange={setStreams} multiple />
              <TailSizeSelector value={tail} onChange={setTail} />
              <TimeRangeField
                since={since}
                until={until}
                placeholder="e.g. 10m or 2026-08-06T10:00:00Z"
                onChange={(range) => {
                  setSince(range.since);
                  setUntil(range.until);
                }}
              />
            </ControlGroup>
            {/* Timestamps sits with what is read, which is what it means to the operator;
                that the daemon has to be re-asked to send them is this view's business. */}
            <ControlGroup label="Read">
              <StreamSearchField
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setMatchCursor(0);
                }}
                matchCount={matches.length}
                activeMatchIndex={activeMatchIndex}
                onNext={() => setMatchCursor((cursor) => cursor + 1)}
                onPrevious={() => setMatchCursor((cursor) => cursor - 1)}
              />
              <Toggle label="Timestamps" checked={timestamps} onChange={setTimestamps} />
              {download}
            </ControlGroup>
          </>
        )}
      />
    </Stack>
  );
}
