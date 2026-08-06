import { CopyButton } from '../controls/CopyButton';
import { ScrollArea } from '../glass/ScrollArea';
import './data-table.css';

export interface CodeViewerProps {
  code: string;
  maxHeight?: string;
}

/** Read-only monospace code/JSON block with a copy affordance. */
export function CodeViewer({ code, maxHeight = '360px' }: CodeViewerProps) {
  return (
    <div className="ui-code-viewer">
      <div className="ui-code-viewer__actions">
        <CopyButton value={code} />
      </div>
      <ScrollArea maxHeight={maxHeight}>
        <pre className="ui-code-viewer__code">{code}</pre>
      </ScrollArea>
    </div>
  );
}
