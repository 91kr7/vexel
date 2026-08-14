import { ScrollArea } from '../glass/ScrollArea';
import './data-table.css';

export interface CodeViewerProps {
  code: string;
  maxHeight?: string;
}

/**
 * Read-only monospace code/JSON block.
 *
 * The action row this block used to draw above its payload is **not rendered at
 * all**, rather than rendered empty: it held one child and now has none, and an
 * empty flex child still consumes its parent's gap — 35px of dead space above
 * every raw payload block, on six surfaces.
 */
export function CodeViewer({ code, maxHeight = '360px' }: CodeViewerProps) {
  return (
    <div className="ui-code-viewer">
      <ScrollArea maxHeight={maxHeight}>
        <pre className="ui-code-viewer__code">{code}</pre>
      </ScrollArea>
    </div>
  );
}
