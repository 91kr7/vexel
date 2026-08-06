import { useState } from 'react';
import { Button } from './Button';
import './controls.css';

export interface CopyButtonProps {
  value: string;
  label?: string;
}

/** Copies `value` to the clipboard; briefly confirms with "Copied". */
export function CopyButton({ value, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button size="sm" variant="ghost" onClick={handleClick}>
      {copied ? 'Copied' : label}
    </Button>
  );
}
