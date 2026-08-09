import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckboxGroup } from '../../src/ui';

afterEach(cleanup);

const options = [
  { id: 'stopped-containers', label: 'Stopped containers', description: '2 containers not running', note: '12.0MB' },
  { id: 'dangling-images', label: 'Dangling images', description: '1 image untagged and unreferenced', note: '4.0MB' },
  { id: 'build-cache', label: 'Build cache', description: 'buildx is not installed', note: '—', disabled: true },
];

describe('CheckboxGroup (ui-library/specs/checkbox-group.md)', () => {
  // checkbox-group.md — "one row per option: a checkbox, the label, the description under it when
  // given, and the note right-aligned when given"
  it('shows a checkbox per option with its label, description and note', () => {
    render(<CheckboxGroup options={options} selectedIds={[]} onChange={vi.fn()} />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByText('Stopped containers')).toBeInTheDocument();
    expect(screen.getByText('2 containers not running')).toBeInTheDocument();
    expect(screen.getByText('12.0MB')).toBeInTheDocument();
  });

  // checkbox-group.md — "Each checkbox is reachable and named for assistive technology by its own
  // label."
  it('names each checkbox by its own label', () => {
    render(<CheckboxGroup options={options} selectedIds={['dangling-images']} onChange={vi.fn()} ariaLabel="Prune scope" />);

    expect(screen.getByRole('group', { name: 'Prune scope' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Stopped containers' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Dangling images' })).toBeChecked();
  });

  // checkbox-group.md — "clicking an unselected option -> onChange with its id added, in options order"
  it('adds a clicked option to the selection, in options order', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CheckboxGroup options={options} selectedIds={['dangling-images']} onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: 'Stopped containers' }));

    expect(onChange).toHaveBeenCalledWith(['stopped-containers', 'dangling-images']);
  });

  // checkbox-group.md — "clicking a selected option -> onChange with its id removed"
  it('removes a clicked option from the selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CheckboxGroup options={options} selectedIds={['stopped-containers', 'dangling-images']} onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: 'Dangling images' }));

    expect(onChange).toHaveBeenCalledWith(['stopped-containers']);
  });

  // checkbox-group.md — "the last one included": the selection may be emptied, which is what
  // separates it from SegmentedControl
  it('lets the last selected option be removed, emptying the selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CheckboxGroup options={options} selectedIds={['stopped-containers']} onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: 'Stopped containers' }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  // checkbox-group.md — "a disabled option cannot be toggled"
  it('does not toggle a disabled option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CheckboxGroup options={options} selectedIds={[]} onChange={onChange} />);

    expect(screen.getByRole('checkbox', { name: 'Build cache' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Build cache' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
