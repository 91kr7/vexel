import './controls.css';

export interface KeyHintProps {
  keys: string;
}

/** Keyboard-shortcut hint, e.g. "⌘K". */
export function KeyHint({ keys }: KeyHintProps) {
  return <kbd className="ui-key-hint">{keys}</kbd>;
}
