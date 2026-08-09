import { useState } from 'react';
import { Button } from './Button';
import './controls.css';

export interface CopyButtonProps {
  value: string;
  label?: string;
  /**
   * Keeps the affordance in place but inert — for a value that is not there
   * yet or is still being read, where hiding the button instead would make it
   * appear and disappear under the operator.
   */
  disabled?: boolean;
}

/** Copies `value` to the clipboard; briefly confirms with "Copied". */
export function CopyButton({ value, label = 'Copy', disabled = false }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button size="sm" variant="ghost" disabled={disabled} onClick={handleClick}>
      {copied ? 'Copied' : label}
    </Button>
  );
}
