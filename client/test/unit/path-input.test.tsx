import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PathInput } from '../../src/ui/controls/PathInput';

afterEach(() => {
  cleanup();
});

describe('PathInput', () => {
  // ui-library/specs/path-input.md — the refusal message is shown, and the browse hint hidden, when invalid
  it('shows only the refusal message when validationState is invalid, even if a browse hint is also given', () => {
    render(
      <PathInput
        value="relative/path"
        onChange={vi.fn()}
        validationState="invalid"
        refusalMessage="The path must be an absolute path."
        browseHint="Select a build context directory."
      />,
    );

    expect(screen.getByText('The path must be an absolute path.')).toBeInTheDocument();
    expect(screen.queryByText('Select a build context directory.')).not.toBeInTheDocument();
  });

  // ui-library/specs/path-input.md — the browse hint is shown, never the refusal message, once the field is valid
  it('shows the browse hint, not any leftover refusal message, once validationState is valid', () => {
    render(
      <PathInput
        value="/absolute/path"
        onChange={vi.fn()}
        validationState="valid"
        refusalMessage="The path must be an absolute path."
        browseHint="Select a build context directory."
      />,
    );

    expect(screen.getByText('Select a build context directory.')).toBeInTheDocument();
    expect(screen.queryByText('The path must be an absolute path.')).not.toBeInTheDocument();
  });

  // ui-library/specs/path-input.md — the browse hint is shown at rest (idle), before any validation has run
  it('shows the browse hint while idle', () => {
    render(<PathInput value="" onChange={vi.fn()} validationState="idle" browseHint="Select a build context directory." />);

    expect(screen.getByText('Select a build context directory.')).toBeInTheDocument();
  });
});
