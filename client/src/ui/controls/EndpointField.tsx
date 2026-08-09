import { FieldMessage } from './FieldMessage';
import { FormField } from './FormField';
import { Select } from './Select';
import { TextField } from './TextField';
import { Stack } from '../layout/Stack';

export interface EndpointKindOption {
  value: string;
  label: string;
  /** Label of the host input this kind needs; omitted when the kind needs no input at all. */
  hostLabel?: string;
  hostPlaceholder?: string;
  hostHint?: string;
  /** Shown in place of the input, read-only, for a kind that needs no input. */
  fixedHost?: string;
}

export interface EndpointFieldProps {
  kinds: EndpointKindOption[];
  kind: string;
  onKindChange: (kind: string) => void;
  host: string;
  onHostChange: (host: string) => void;
  /** Validation message for the host input. */
  error?: string;
  kindLabel?: string;
}

/**
 * Endpoint form group: picks the kind of endpoint among the offered ones and
 * captures the single host value that kind needs — or states the fixed host it
 * uses, when the kind needs no input.
 */
export function EndpointField({
  kinds,
  kind,
  onKindChange,
  host,
  onHostChange,
  error,
  kindLabel = 'Endpoint kind',
}: EndpointFieldProps) {
  const selected = kinds.find((option) => option.value === kind);
  return (
    <Stack gap="var(--space-3)">
      <FormField label={kindLabel}>
        <Select ariaLabel={kindLabel} value={kind} onChange={onKindChange} options={kinds.map(({ value, label }) => ({ value, label }))} />
      </FormField>
      {selected?.hostLabel ? (
        <FormField label={selected.hostLabel} hint={selected.hostHint} error={error}>
          <TextField ariaLabel={selected.hostLabel} placeholder={selected.hostPlaceholder} value={host} onChange={onHostChange} />
        </FormField>
      ) : selected?.fixedHost ? (
        <FieldMessage tone="muted">{selected.fixedHost}</FieldMessage>
      ) : null}
    </Stack>
  );
}
