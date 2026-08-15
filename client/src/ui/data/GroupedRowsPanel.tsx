import type { MouseEvent, ReactNode } from 'react';
import type { StatusTone } from '../controls/StatusPill';
import { Divider } from '../glass/Divider';
import { Surface } from '../glass/Surface';
import { Row } from '../layout/Row';
import { Spacer } from '../layout/Spacer';
import { Stack } from '../layout/Stack';
import { EmptyState } from '../feedback/EmptyState';
import { StatusDotCell } from './TableCells';
import './grouped-rows-panel.css';

export interface GroupedRowsPanelRow {
  id: string;
  tone?: StatusTone;
  title: string;
  subtitle?: string;
  /** Trailing control for this row (e.g. a Stepper). */
  trailing?: ReactNode;
}

export interface GroupedRowsPanelGroup {
  id: string;
  tone?: StatusTone;
  title: string;
  subtitle?: string;
  /** Group-level actions rendered in the header, trailing the title (e.g. status pill, lifecycle buttons). */
  actions?: ReactNode;
  rows: GroupedRowsPanelRow[];
}

export interface GroupedRowsPanelProps {
  groups: GroupedRowsPanelGroup[];
  selectedGroupId?: string;
  onSelectGroup?: (group: GroupedRowsPanelGroup) => void;
  emptyState?: ReactNode;
}

function stopPropagation(event: MouseEvent) {
  event.stopPropagation();
}

/**
 * Grouped-rows panel: one card per group with a header (status, title,
 * subtitle, actions) over its indented child rows (status, title, muted
 * subtitle, trailing control) — a compose project and its services.
 */
export function GroupedRowsPanel({ groups, selectedGroupId, onSelectGroup, emptyState }: GroupedRowsPanelProps) {
  if (groups.length === 0) {
    return <div className="ui-grouped-rows-panel__empty">{emptyState ?? <EmptyState title="Nothing to show." description={null} action={null} />}</div>;
  }
  return (
    <div className="ui-grouped-rows-panel">
      {groups.map((group) => {
        const selected = group.id === selectedGroupId;
        const headerClass = [
          'ui-grouped-rows-panel__header',
          onSelectGroup ? 'ui-grouped-rows-panel__header--selectable' : '',
          selected ? 'ui-grouped-rows-panel__header--selected' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <Surface key={group.id} elevation="flat" padding="none">
            <div className={headerClass} onClick={onSelectGroup ? () => onSelectGroup(group) : undefined}>
              <Row align="center">
                <StatusDotCell tone={group.tone ?? 'neutral'} />
                <Stack gap="var(--space-1)">
                  <span className="ui-grouped-rows-panel__title">{group.title}</span>
                  {group.subtitle ? <span className="ui-grouped-rows-panel__subtitle">{group.subtitle}</span> : null}
                </Stack>
                <Spacer />
                {group.actions ? (
                  <div className="ui-grouped-rows-panel__actions" onClick={stopPropagation}>
                    {group.actions}
                  </div>
                ) : null}
              </Row>
            </div>
            {group.rows.length > 0 ? (
              <>
                <Divider />
                <div className="ui-grouped-rows-panel__rows">
                  {group.rows.map((row) => (
                    <Row key={row.id} align="center">
                      <StatusDotCell tone={row.tone ?? 'neutral'} />
                      <Stack gap="0">
                        <span className="ui-grouped-rows-panel__row-title">{row.title}</span>
                        {row.subtitle ? <span className="ui-grouped-rows-panel__row-subtitle">{row.subtitle}</span> : null}
                      </Stack>
                      <Spacer />
                      {row.trailing}
                    </Row>
                  ))}
                </div>
              </>
            ) : null}
          </Surface>
        );
      })}
    </div>
  );
}
