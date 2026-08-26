import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs } from '../../src/ui';

afterEach(cleanup);

const tabs = [
  { id: 'config', label: 'Config' },
  { id: 'logs', label: 'Logs' },
  { id: 'exec', label: 'Exec' },
  { id: 'attach', label: 'Attach' },
];

/** What the row does with a tab, so two tabs can be compared as drawn rather than as listed. */
function treatmentOf(tab: HTMLElement) {
  return JSON.stringify({
    classes: [...tab.classList].sort(),
    style: tab.getAttribute('style'),
    disabled: (tab as HTMLButtonElement).disabled,
    attributes: tab.getAttributeNames().filter((name) => !['class', 'aria-selected'].includes(name)).sort(),
  });
}

describe('Tabs (REQ-12)', () => {
  // tabs.md — every tab given is drawn alike, with only the active one distinguished
  it('draws every tab alike and distinguishes only the active one', () => {
    render(<Tabs tabs={tabs} activeId="config" onSelect={vi.fn()} />);

    const drawn = screen.getAllByRole('tab');
    expect(drawn.map((tab) => tab.textContent)).toEqual(['Config', 'Logs', 'Exec', 'Attach']);
    const resting = drawn.filter((tab) => tab.getAttribute('aria-selected') === 'false');
    expect(new Set(resting.map(treatmentOf))).toHaveLength(1);
    expect(treatmentOf(drawn[0]!)).not.toBe(treatmentOf(resting[0]!));
  });

  // tabs.md — the component offers no disabled, muted or otherwise lesser tab
  it('offers no way to present a tab as a lesser one', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    // A caller asking for a lesser tab has nowhere to say so: the extra keys are not part of the
    // contract, and a tab carrying them is still drawn — and still answers — like every other.
    const asked = tabs.map((tab, index) => ({ ...tab, disabled: index > 1, muted: index > 1 }));
    render(<Tabs tabs={asked} activeId="config" onSelect={onSelect} />);

    const drawn = screen.getAllByRole('tab');
    expect(drawn.some((tab) => (tab as HTMLButtonElement).disabled || tab.hasAttribute('aria-disabled'))).toBe(false);
    const resting = drawn.filter((tab) => tab.getAttribute('aria-selected') === 'false');
    expect(new Set(resting.map(treatmentOf))).toHaveLength(1);

    await user.click(screen.getByRole('tab', { name: 'Attach' }));
    expect(onSelect).toHaveBeenCalledWith('attach');
  });

  // tabs.md — the active tab is the one whose id is `activeId`, and a click reports the tab's own id
  it('marks the tab named by activeId and reports the clicked tab’s id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Tabs tabs={tabs} activeId="exec" onSelect={onSelect} />);

    expect(screen.getByRole('tab', { name: 'Exec' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab').filter((tab) => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1);

    await user.click(screen.getByRole('tab', { name: 'Logs' }));
    expect(onSelect).toHaveBeenCalledWith('logs');
  });
});
