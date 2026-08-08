import { useRef, type ReactNode, type UIEvent } from 'react';
import { Divider } from '../glass/Divider';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { EmptyState } from '../feedback/EmptyState';
import { HexDumpViewer, TextViewer } from './ContentViewer';
import './side-by-side-viewer.css';

export interface SideBySideSide {
  header: ReactNode;
  /** The side's content; `undefined` renders `emptyMessage` instead of a viewer (e.g. this path does not exist on this side). */
  content?: string;
  mode?: 'text' | 'hex';
  truncated?: boolean;
  totalSizeBytes?: number;
  emptyMessage?: string;
}

export interface SideBySideViewerProps {
  left: SideBySideSide;
  right: SideBySideSide;
  maxHeight?: string;
}

/**
 * Pairs two content viewers side by side (e.g. a changed file's two
 * versions), each under its own header, sharing one scroll position so
 * scrolling either side scrolls both together (REQ-64).
 */
export function SideBySideViewer({ left, right, maxHeight = '360px' }: SideBySideViewerProps) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  function sync(source: 'left' | 'right') {
    return (event: UIEvent<HTMLDivElement>) => {
      if (syncing.current) return;
      syncing.current = true;
      const target = source === 'left' ? rightRef.current : leftRef.current;
      if (target) target.scrollTop = event.currentTarget.scrollTop;
      syncing.current = false;
    };
  }

  function renderSide(side: SideBySideSide, scrollRef: typeof leftRef, onScroll: (event: UIEvent<HTMLDivElement>) => void) {
    if (side.content === undefined) {
      return <EmptyState title={side.emptyMessage ?? 'No content on this side'} />;
    }
    return side.mode === 'hex' ? (
      <HexDumpViewer content={side.content} truncated={side.truncated} totalSizeBytes={side.totalSizeBytes} maxHeight={maxHeight} scrollRef={scrollRef} onScroll={onScroll} />
    ) : (
      <TextViewer content={side.content} truncated={side.truncated} totalSizeBytes={side.totalSizeBytes} maxHeight={maxHeight} scrollRef={scrollRef} onScroll={onScroll} />
    );
  }

  return (
    <Row gap="0" align="start" wrap={false}>
      <div className="ui-side-by-side-viewer__side">
        <Stack gap="var(--space-2)">
          <div className="ui-side-by-side-viewer__header">{left.header}</div>
          {renderSide(left, leftRef, sync('left'))}
        </Stack>
      </div>
      <Divider orientation="vertical" />
      <div className="ui-side-by-side-viewer__side">
        <Stack gap="var(--space-2)">
          <div className="ui-side-by-side-viewer__header">{right.header}</div>
          {renderSide(right, rightRef, sync('right'))}
        </Stack>
      </div>
    </Row>
  );
}
