import { useMemo, useState, type ReactNode } from 'react';
import { SearchField } from '../controls/SearchField';
import { EmptyState } from '../feedback/EmptyState';
import { PayloadSections, PAYLOAD_SCALARS_SECTION, type PayloadReadingSource } from './PayloadSections';
import { flattenPayload, matchPayload, payloadPathKey } from './payload-shape';
import './payload-explorer.css';

export interface PayloadExplorerProps {
  payload: unknown;
  reading?: PayloadReadingSource;
  scalarsTitle?: string;
  /** The sections open when the payload is first drawn, and the state clearing the find returns to. */
  defaultOpenSections?: readonly string[];
  /** Drawn after every payload-derived section, and only while the find is empty. */
  trailing?: ReactNode;
  findPlaceholder?: string;
  findLabel?: string;
}

function toggled(keys: readonly string[], key: string, open: boolean): string[] {
  const without = keys.filter((current) => current !== key);
  return open ? [...without, key] : without;
}

/**
 * A payload's own shape with a find over the whole of it: while the control
 * holds text only the matching fields are drawn, every section holding a match
 * is open however deep the match sits, and the number of matches is stated.
 * Clearing it restores the payload and the sections the explorer opened with.
 */
export function PayloadExplorer({
  payload,
  reading,
  scalarsTitle,
  defaultOpenSections = [],
  trailing,
  findPlaceholder = 'Find a field or a value…',
  findLabel = 'Find in payload',
}: PayloadExplorerProps) {
  const [term, setTerm] = useState('');
  const [openKeys, setOpenKeys] = useState<string[] | null>(null);

  const nodes = useMemo(() => flattenPayload(payload), [payload]);
  const filtering = term.trim().length > 0;
  const match = useMemo(() => (filtering ? matchPayload(nodes, term) : null), [filtering, nodes, term]);

  // The sections a match puts on screen: a top-level composite that holds one,
  // and the gathered scalars when the match is a top-level scalar itself.
  const matchedSections = useMemo(() => {
    if (!match) return [];
    const keys: string[] = [];
    let scalarMatched = false;
    for (const node of nodes) {
      if (node.path.length !== 1 || !match.visiblePaths.has(payloadPathKey(node.path))) continue;
      if (node.kind === 'scalar') scalarMatched = true;
      else keys.push(node.key);
    }
    return scalarMatched ? [PAYLOAD_SCALARS_SECTION, ...keys] : keys;
  }, [match, nodes]);

  const effectiveOpen = openKeys ?? (match ? matchedSections : [...defaultOpenSections]);

  function changeTerm(next: string) {
    setTerm(next);
    setOpenKeys(null);
  }

  return (
    <div className="ui-payload-explorer">
      <div className="ui-payload-explorer__find">
        <SearchField value={term} onChange={changeTerm} placeholder={findPlaceholder} ariaLabel={findLabel} />
        {match ? (
          <span className="ui-payload-explorer__matches">{match.matchCount === 1 ? '1 matching field' : `${match.matchCount} matching fields`}</span>
        ) : null}
      </div>
      {match && match.matchCount === 0 ? (
        <EmptyState title="No field matches this search" description="No key name and no value in this payload contains what was typed." action={null} compact />
      ) : (
        <PayloadSections
          payload={payload}
          reading={reading}
          scalarsTitle={scalarsTitle}
          openKeys={effectiveOpen}
          onToggleSection={(key, open) => setOpenKeys(toggled(effectiveOpen, key, open))}
          visiblePaths={match?.visiblePaths}
          trailing={match ? null : trailing}
        />
      )}
    </div>
  );
}
