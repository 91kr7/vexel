import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormField, FormSheet, type FormSheetCommit } from '../../src/ui';

afterEach(cleanup);

function commits(onCreateOnly = vi.fn(), onCreateStart = vi.fn()): FormSheetCommit[] {
  return [
    { id: 'create', label: 'Create only', onClick: onCreateOnly },
    { id: 'create-start', label: 'Create and start', onClick: onCreateStart },
  ];
}

describe('FormSheet (ui-library/specs/form-sheet.md)', () => {
  // form-sheet.md — nothing at all is shown while open is false
  it('shows nothing while it is closed', () => {
    render(
      <FormSheet open={false} title="Run a container" commitActions={commits()} onCancel={vi.fn()}>
        <p>body</p>
      </FormSheet>,
    );

    expect(screen.queryByText('Run a container')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create and start' })).not.toBeInTheDocument();
  });

  // form-sheet.md — title, description, banner, body and footer are all shown once open
  it('shows the title, description, banner, body and every commit choice once open', () => {
    render(
      <FormSheet
        open
        title="Run a container"
        description="Creates a container from an image."
        banner={<p>The daemon refused the creation</p>}
        commitActions={commits()}
        onCancel={vi.fn()}
      >
        <p>body content</p>
      </FormSheet>,
    );

    expect(screen.getByText('Run a container')).toBeInTheDocument();
    expect(screen.getByText('Creates a container from an image.')).toBeInTheDocument();
    expect(screen.getByText('The daemon refused the creation')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create only' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create and start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  // form-sheet.md — a commit action calls its own onClick
  it('calls the clicked commit action', async () => {
    const user = userEvent.setup();
    const onCreateOnly = vi.fn();
    const onCreateStart = vi.fn();
    render(
      <FormSheet open title="Run a container" commitActions={commits(onCreateOnly, onCreateStart)} onCancel={vi.fn()}>
        <FormField label="Image">
          <input aria-label="Image" />
        </FormField>
      </FormSheet>,
    );

    await user.click(screen.getByRole('button', { name: 'Create and start' }));

    expect(onCreateStart).toHaveBeenCalledTimes(1);
    expect(onCreateOnly).not.toHaveBeenCalled();
  });

  // form-sheet.md — cancel calls onCancel
  it('calls onCancel from the cancel action', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <FormSheet open title="Run a container" commitActions={commits()} onCancel={onCancel}>
        <p>body</p>
      </FormSheet>,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // form-sheet.md — a click on the dimmed overlay cancels, like the cancel action
  it('cancels on a click on the dimmed overlay', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { container } = render(
      <FormSheet open title="Run a container" commitActions={commits()} onCancel={onCancel}>
        <p>body</p>
      </FormSheet>,
    );

    await user.click(container.querySelector('.ui-modal-overlay') as HTMLElement);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // form-sheet.md — while busy the overlay no longer cancels: an in-flight operation cannot be dismissed as if it never started
  it('does not cancel on an overlay click while busy', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { container } = render(
      <FormSheet open title="Run a container" commitActions={commits()} busy onCancel={onCancel}>
        <p>body</p>
      </FormSheet>,
    );

    await user.click(container.querySelector('.ui-modal-overlay') as HTMLElement);

    expect(onCancel).not.toHaveBeenCalled();
  });

  // form-sheet.md — while busy, every commit action and cancel is disabled, and the primary shows the busy label
  it('disables every commit choice and cancel while busy, showing the busy label on the primary action', () => {
    render(
      <FormSheet open title="Run a container" commitActions={commits()} busy busyLabel="Pulling…" onCancel={vi.fn()}>
        <p>body</p>
      </FormSheet>,
    );

    expect(screen.getByRole('button', { name: 'Create only' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pulling…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  // form-sheet.md — a disabled commit choice stays disabled
  it('disables a commit choice declared as disabled', () => {
    render(
      <FormSheet
        open
        title="Run a container"
        commitActions={[{ id: 'create', label: 'Create only', onClick: vi.fn(), disabled: true }, { id: 'create-start', label: 'Create and start', onClick: vi.fn() }]}
        onCancel={vi.fn()}
      >
        <p>body</p>
      </FormSheet>,
    );

    expect(screen.getByRole('button', { name: 'Create only' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create and start' })).toBeEnabled();
  });

  // form-sheet.md — the glass surface never uses backdrop-filter or filter: blur()
  it('uses neither backdrop-filter nor filter: blur() on its surfaces', () => {
    const { container } = render(
      <FormSheet open title="Run a container" commitActions={commits()} onCancel={vi.fn()}>
        <p>body</p>
      </FormSheet>,
    );

    for (const node of Array.from(container.querySelectorAll('*'))) {
      const style = getComputedStyle(node);
      expect(style.backdropFilter === '' || style.backdropFilter === 'none').toBe(true);
      expect(style.filter === '' || style.filter === 'none').toBe(true);
    }
  });
});

describe('FormField (ui-library/specs/form-field.md)', () => {
  // form-field.md — the label is always shown above the control, with the hint below it
  it('shows the label and the hint around the control', () => {
    render(
      <FormField label="Container name" hint="Left empty, the daemon picks one.">
        <input aria-label="Container name" />
      </FormField>,
    );

    expect(screen.getByText('Container name')).toBeInTheDocument();
    expect(screen.getByText('Left empty, the daemon picks one.')).toBeInTheDocument();
  });

  // form-field.md — at most one message line: the error replaces the hint whenever it is present
  it('replaces the hint with the validation message when the field is invalid', () => {
    render(
      <FormField label="Container name" hint="Left empty, the daemon picks one." error="Use letters, digits, _, . or -.">
        <input aria-label="Container name" />
      </FormField>,
    );

    expect(screen.getByText('Use letters, digits, _, . or -.')).toBeInTheDocument();
    expect(screen.queryByText('Left empty, the daemon picks one.')).not.toBeInTheDocument();
  });
});
