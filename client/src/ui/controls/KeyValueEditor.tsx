import { IconButton } from './IconButton';
import { TextField } from './TextField';
import { Button } from './Button';
import { Row } from '../layout/Row';
import './controls.css';

export interface KeyValuePair {
  key: string;
  value: string;
}

export interface KeyValueEditorProps {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  /** What the caller calls this editor; qualifies the rows' accessible names, never displayed. */
  name?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
}

/** Repeatable key/value row editor (e.g. environment variables). */
export function KeyValueEditor({ pairs, onChange, name, keyPlaceholder = 'KEY', valuePlaceholder = 'value', addLabel = 'Add variable' }: KeyValueEditorProps) {
  function update(index: number, patch: Partial<KeyValuePair>) {
    onChange(pairs.map((pair, current) => (current === index ? { ...pair, ...patch } : pair)));
  }
  function remove(index: number) {
    onChange(pairs.filter((_, current) => current !== index));
  }
  function add() {
    onChange([...pairs, { key: '', value: '' }]);
  }
  function qualify(label: string) {
    return name ? `${name} ${label}` : label;
  }
  function removeLabel(pair: KeyValuePair, index: number) {
    const target = pair.key || `pair ${index + 1}`;
    return name ? `Remove ${target} from ${name}` : `Remove ${target}`;
  }

  return (
    <div className="ui-key-value-editor">
      {pairs.map((pair, index) => (
        <Row key={index} gap="var(--space-2)" align="center">
          <TextField value={pair.key} onChange={(value) => update(index, { key: value })} placeholder={keyPlaceholder} ariaLabel={qualify(`Key ${index + 1}`)} />
          <TextField value={pair.value} onChange={(value) => update(index, { value })} placeholder={valuePlaceholder} ariaLabel={qualify(`Value ${index + 1}`)} />
          <IconButton label={removeLabel(pair, index)} onClick={() => remove(index)}>
            ✕
          </IconButton>
        </Row>
      ))}
      {/* A control, not bare text: the add affordance carries the border and the
          surface every other button carries. `ghost` painted neither, which is how
          "Add variable" came to be a word at the end of a list. */}
      <Button size="sm" onClick={add}>
        {addLabel}
      </Button>
    </div>
  );
}
