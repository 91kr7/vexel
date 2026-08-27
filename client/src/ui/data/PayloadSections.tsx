import type { ReactNode } from 'react';
import { CollapsibleSection } from '../glass/CollapsibleSection';
import { TokenWrappedText } from './token-wrap';
import {
  isEmptyPayloadValue,
  payloadCount,
  payloadFields,
  payloadKind,
  payloadLiteral,
  payloadPathKey,
  splitTopLevelKeys,
  type PayloadField,
} from './payload-shape';
import './payload-sections.css';

/**
 * The reading a caller adds beside a value — never in place of it — and the one
 * severity a value may carry. The library supplies neither: what a key means is
 * the caller's knowledge.
 */
export interface PayloadValueReading {
  node?: ReactNode;
  tone?: 'danger';
}

export type PayloadReadingSource = (path: readonly string[], value: unknown) => PayloadValueReading | undefined;

/** The key the leading section of gathered top-level scalars is opened by. */
export const PAYLOAD_SCALARS_SECTION = 'ui-payload-scalars';

export interface PayloadSectionsProps {
  payload: unknown;
  /** Consulted for every node, composite ones included. */
  reading?: PayloadReadingSource;
  /** Heading of the leading section; defaults to `Fields`. */
  scalarsTitle?: string;
  /** Controlled open sections, keyed by top-level key or by `PAYLOAD_SCALARS_SECTION`. */
  openKeys?: readonly string[];
  onToggleSection?: (key: string, open: boolean) => void;
  /** Uncontrolled fallback, read only when `openKeys` is absent. */
  defaultOpenKeys?: readonly string[];
  /** When present, only the paths it holds are drawn. */
  visiblePaths?: ReadonlySet<string>;
  /** Drawn after every payload-derived section. */
  trailing?: ReactNode;
}

function emptyMarker(value: unknown): string {
  if (value === null || value === undefined) return 'empty (null)';
  if (typeof value === 'string') return 'empty (text)';
  if (Array.isArray(value)) return 'empty (list)';
  return 'empty (object)';
}

function countLabel(value: unknown): string {
  const count = payloadCount(value);
  if (Array.isArray(value)) return count === 1 ? '1 item' : `${count} items`;
  return count === 1 ? '1 field' : `${count} fields`;
}

interface NodeProps {
  field: PayloadField;
  path: string[];
  reading?: PayloadReadingSource;
  visiblePaths?: ReadonlySet<string>;
}

function PayloadLeaf({ field, path, reading }: NodeProps) {
  const empty = isEmptyPayloadValue(field.value);
  const supplied = reading?.(path, field.value);
  const valueClasses = ['ui-payload-band__value', empty ? 'ui-payload-band__value--empty' : '', supplied?.tone ? `ui-payload-band__value--tone-${supplied.tone}` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className="ui-payload-band">
      <span className="ui-payload-band__label">{field.key}</span>
      <span className={valueClasses}>{empty ? emptyMarker(field.value) : <TokenWrappedText text={payloadLiteral(field.value)} />}</span>
      {supplied?.node ? <span className="ui-payload-band__reading">{supplied.node}</span> : null}
    </div>
  );
}

function PayloadGroup({ field, path, reading, visiblePaths }: NodeProps) {
  const supplied = reading?.(path, field.value);
  return (
    <div className="ui-payload-group">
      <div className="ui-payload-group__header">
        <span className="ui-payload-group__label">{field.key}</span>
        <span className="ui-payload-group__count">{countLabel(field.value)}</span>
        {supplied?.node ? <span className="ui-payload-band__reading">{supplied.node}</span> : null}
      </div>
      <div className="ui-payload-group__body">
        <PayloadFields fields={payloadFields(field.value)} path={path} reading={reading} visiblePaths={visiblePaths} />
      </div>
    </div>
  );
}

interface FieldsProps {
  fields: PayloadField[];
  path: string[];
  reading?: PayloadReadingSource;
  visiblePaths?: ReadonlySet<string>;
}

/** The fields of one node, to whatever depth the payload goes; nothing is ever stringified. */
function PayloadFields({ fields, path, reading, visiblePaths }: FieldsProps) {
  return (
    <div className="ui-payload-fields">
      {fields.map((field) => {
        const childPath = [...path, field.key];
        if (visiblePaths && !visiblePaths.has(payloadPathKey(childPath))) return null;
        const composite = payloadKind(field.value) !== 'scalar' && !isEmptyPayloadValue(field.value);
        return composite ? (
          <PayloadGroup key={field.key} field={field} path={childPath} reading={reading} visiblePaths={visiblePaths} />
        ) : (
          <PayloadLeaf key={field.key} field={field} path={childPath} reading={reading} />
        );
      })}
    </div>
  );
}

/**
 * A JSON payload drawn as the payload's own shape: one section per composite
 * top-level key, one leading section for the gathered scalars, nested objects as
 * labelled groups, arrays as counted positional items, and a leaf as a
 * label → value band. No copy affordance, no truncation, no stringified JSON.
 */
export function PayloadSections({
  payload,
  reading,
  scalarsTitle = 'Fields',
  openKeys,
  onToggleSection,
  defaultOpenKeys = [],
  visiblePaths,
  trailing,
}: PayloadSectionsProps) {
  const { scalars, sections } = splitTopLevelKeys(payload);

  function sectionState(key: string) {
    if (openKeys === undefined) return { defaultOpen: defaultOpenKeys.includes(key) };
    return { open: openKeys.includes(key), onToggle: (next: boolean) => onToggleSection?.(key, next) };
  }

  const visibleScalars = visiblePaths ? scalars.filter((field) => visiblePaths.has(payloadPathKey([field.key]))) : scalars;
  const visibleSections = visiblePaths ? sections.filter((field) => visiblePaths.has(payloadPathKey([field.key]))) : sections;

  return (
    <div className="ui-payload-sections">
      {visibleScalars.length > 0 ? (
        <CollapsibleSection title={scalarsTitle} summary={visibleScalars.length === 1 ? '1 field' : `${visibleScalars.length} fields`} {...sectionState(PAYLOAD_SCALARS_SECTION)}>
          <PayloadFields fields={visibleScalars} path={[]} reading={reading} visiblePaths={visiblePaths} />
        </CollapsibleSection>
      ) : null}
      {visibleSections.map((field) => (
        <CollapsibleSection key={field.key} title={field.key} summary={countLabel(field.value)} {...sectionState(field.key)}>
          {isEmptyPayloadValue(field.value) ? (
            <div className="ui-payload-fields">
              <span className="ui-payload-band__value ui-payload-band__value--empty">{emptyMarker(field.value)}</span>
            </div>
          ) : (
            <PayloadFields fields={payloadFields(field.value)} path={[field.key]} reading={reading} visiblePaths={visiblePaths} />
          )}
        </CollapsibleSection>
      ))}
      {trailing}
    </div>
  );
}
