import { useMemo, useState } from 'react';
import {
  ErrorBanner,
  LogStream,
  MetaCell,
  Row,
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
import type { ContainerSummary } from '../data/containers-client';

export interface ContainerLogsViewProps {
  container: ContainerSummary;
}

const STREAM_OPTIONS = [
  { id: 'stdout', label: 'stdout' },
  { id: 'stderr', label: 'stderr' },
];

/**
 * A container's logs (REQ-30, REQ-31): stream selection, timestamps, tail size
 * and since/until above a live-tailing log surface with search, highlighted
 * matches and copy/download of the buffered output.
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

  const streamLines = useMemo<LogStreamLine[]>(
    () => lines.map((line) => ({ id: String(line.seq), text: line.text, timestamp: line.timestamp, stream: line.stream })),
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
      <Row gap="var(--space-3)" wrap>
        <SegmentedControl ariaLabel="Streams" options={STREAM_OPTIONS} selectedIds={streams} onChange={setStreams} multiple />
        <Toggle label="Timestamps" checked={timestamps} onChange={setTimestamps} />
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
      </Row>
      <Row gap="var(--space-3)" wrap>
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
      </Row>
      {error ? <ErrorBanner title="Could not stream the container logs" detail={error} onRetry={restart} /> : null}
      {ended && lines.length > 0 ? <MetaCell>Stream ended.</MetaCell> : null}
      <LogStream
        lines={streamLines}
        showTimestamps={timestamps}
        follow={follow}
        onFollowChange={setFollow}
        highlight={search.trim() === '' ? undefined : search}
        activeMatchLineId={activeMatchLineId}
        downloadFileName={`${container.name}-logs.txt`}
        emptyLabel={ended ? 'The container produced no log output.' : 'Waiting for log output…'}
      />
    </Stack>
  );
}
