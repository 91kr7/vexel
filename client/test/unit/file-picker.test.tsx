import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilePicker } from '../../src/ui/controls/FilePicker';

afterEach(() => {
  cleanup();
});

function makeFile(name: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: 'application/x-tar' });
}

// ui-library/specs/file-picker.md — trigger label and summary text before/after a file is chosen
describe('FilePicker (plan-docker_management_app/REQ-42, plan-docker_management_app/REQ-43)', () => {
  it('reads "Choose file…" and "No file selected" while no file is chosen', () => {
    render(<FilePicker file={null} onChange={vi.fn()} label="Tarball" />);

    expect(screen.getByRole('button', { name: 'Choose file…' })).toBeInTheDocument();
    expect(screen.getByText('No file selected')).toBeInTheDocument();
  });

  it('reads "Change file…" and shows the chosen file\'s name and formatted size once a file is set', () => {
    render(<FilePicker file={makeFile('images.tar', 2048)} onChange={vi.fn()} label="Tarball" />);

    expect(screen.getByRole('button', { name: 'Change file…' })).toBeInTheDocument();
    expect(screen.getByText('images.tar · 2.0KB')).toBeInTheDocument();
  });

  it('reports the newly chosen file through onChange when the native input changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilePicker file={null} onChange={onChange} label="Tarball" ariaLabel="Tarball to load" />);
    const file = makeFile('images.tar', 512);

    await user.upload(screen.getByLabelText('Tarball to load'), file);

    expect(onChange).toHaveBeenCalledWith(file);
  });

  it('falls back to the label as the accessible name when no ariaLabel is given', () => {
    render(<FilePicker file={null} onChange={vi.fn()} label="Filesystem tarball" />);

    expect(screen.getByLabelText('Filesystem tarball')).toBeInTheDocument();
  });
});
