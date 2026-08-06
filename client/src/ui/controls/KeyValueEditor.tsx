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
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
}

/** Repeatable key/value row editor (e.g. environment variables). */
export function KeyValueEditor({ pairs, onChange, keyPlaceholder = 'KEY', valuePlaceholder = 'value', addLabel = 'Add variable' }: KeyValueEditorProps) {
  function update(index: number, patch: Partial<KeyValuePair>) {
    onChange(pairs.map((pair, current) => (current === index ? { ...pair, ...patch } : pair)));
  }
  function remove(index: number) {
    onChange(pairs.filter((_, current) => current !== index));
  }
  function add() {
    onChange([...pairs, { key: '', value: '' }]);
  }

  return (
    <div className="ui-key-value-editor">
      {pairs.map((pair, index) => (
        <Row key={index} gap="var(--space-2)" align="center">
          <TextField value={pair.key} onChange={(value) => update(index, { key: value })} placeholder={keyPlaceholder} ariaLabel={`Key ${index + 1}`} />
          <TextField value={pair.value} onChange={(value) => update(index, { value })} placeholder={valuePlaceholder} ariaLabel={`Value ${index + 1}`} />
          <IconButton label={`Remove ${pair.key || `pair ${index + 1}`}`} onClick={() => remove(index)}>
            ✕
          </IconButton>
        </Row>
      ))}
      <Button size="sm" variant="ghost" onClick={add}>
        {addLabel}
      </Button>
    </div>
  );
}
