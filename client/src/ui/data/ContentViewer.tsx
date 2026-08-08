import type { Ref, UIEvent } from 'react';
import { ScrollArea } from '../glass/ScrollArea';
import { FieldMessage } from '../controls/FieldMessage';
import './content-viewer.css';

interface TruncationNoticeProps {
  truncated?: boolean;
  totalSizeBytes?: number;
}

function TruncationNotice({ truncated, totalSizeBytes }: TruncationNoticeProps) {
  if (!truncated) return null;
  return (
    <FieldMessage tone="muted">
      {totalSizeBytes !== undefined ? `Truncated — showing a preview of the ${totalSizeBytes.toLocaleString()}-byte file.` : 'Truncated preview.'}
    </FieldMessage>
  );
}

export interface TextViewerProps {
  content: string;
  truncated?: boolean;
  totalSizeBytes?: number;
  maxHeight?: string;
  /** Forwarded to the internal scrollable element; lets a caller (e.g. a side-by-side pairing) read/drive its scroll position. */
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
}

/** Read-only monospace text preview with a line-number gutter and a truncation notice for an oversized file (REQ-59). */
export function TextViewer({ content, truncated, totalSizeBytes, maxHeight = '360px', scrollRef, onScroll }: TextViewerProps) {
  const lines = content.length === 0 ? [] : content.split('\n');
  return (
    <div className="ui-content-viewer">
      <ScrollArea ref={scrollRef} maxHeight={maxHeight} onScroll={onScroll}>
        <div className="ui-content-viewer__text">
          {lines.map((line, index) => (
            <div className="ui-content-viewer__line" key={index}>
              <span className="ui-content-viewer__line-number">{index + 1}</span>
              <span className="ui-content-viewer__line-text">{line}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
      <TruncationNotice truncated={truncated} totalSizeBytes={totalSizeBytes} />
    </div>
  );
}

export interface HexDumpViewerProps {
  /** Preformatted hex dump text (offset, hex bytes, ASCII column per line), computed by the caller. */
  content: string;
  truncated?: boolean;
  totalSizeBytes?: number;
  maxHeight?: string;
  /** Forwarded to the internal scrollable element; lets a caller (e.g. a side-by-side pairing) read/drive its scroll position. */
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
}

/** Read-only monospace hex-dump preview of a binary file's bytes, with the same truncation notice as `TextViewer` (REQ-59). */
export function HexDumpViewer({ content, truncated, totalSizeBytes, maxHeight = '360px', scrollRef, onScroll }: HexDumpViewerProps) {
  return (
    <div className="ui-content-viewer">
      <ScrollArea ref={scrollRef} maxHeight={maxHeight} onScroll={onScroll}>
        <pre className="ui-content-viewer__hex">{content}</pre>
      </ScrollArea>
      <TruncationNotice truncated={truncated} totalSizeBytes={totalSizeBytes} />
    </div>
  );
}
