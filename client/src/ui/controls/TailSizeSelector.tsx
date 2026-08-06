import { Select } from './Select';

export type TailSize = number | 'all';

export interface TailSizeSelectorProps {
  value: TailSize;
  onChange: (value: TailSize) => void;
  options?: number[];
  ariaLabel?: string;
}

const DEFAULT_SIZES = [100, 500, 1000, 5000];

/** Picks how many trailing lines of a stream to load, or all of them. */
export function TailSizeSelector({ value, onChange, options = DEFAULT_SIZES, ariaLabel = 'Tail size' }: TailSizeSelectorProps) {
  return (
    <Select
      ariaLabel={ariaLabel}
      value={value === 'all' ? 'all' : String(value)}
      options={[...options.map((size) => ({ value: String(size), label: `last ${size} lines` })), { value: 'all', label: 'All' }]}
      onChange={(selected) => onChange(selected === 'all' ? 'all' : Number(selected))}
    />
  );
}
