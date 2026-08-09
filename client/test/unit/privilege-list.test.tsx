import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PrivilegeList } from '../../src/ui';

// The review surface a granting decision is taken on
// (ui-library/specs/privilege-list.md, REQ-99): what is granted must be what
// was read, so nothing may be summarised, truncated or omitted.

afterEach(cleanup);

function rows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-privilege-list__row'));
}

describe('PrivilegeList (ui-library/specs/privilege-list.md)', () => {
  // privilege-list.md — "Each row shows the name, the values in monospace, and the description below
  // when there is one"; "Nothing is summarised, truncated or omitted"
  it('renders every privilege given, with its name, its values and its description', () => {
    render(
      <PrivilegeList
        items={[
          { name: 'network', description: 'permissions to access a network', values: ['host'] },
          { name: 'mount', description: 'host path to mount', values: ['/var/lib/docker/plugins'] },
          { name: 'capabilities', values: ['CAP_SYS_ADMIN'] },
        ]}
      />,
    );

    expect(rows()).toHaveLength(3);
    expect(screen.getByText('network')).toBeInTheDocument();
    expect(screen.getByText('host')).toBeInTheDocument();
    expect(screen.getByText('permissions to access a network')).toBeInTheDocument();
    expect(screen.getByText('/var/lib/docker/plugins')).toBeInTheDocument();
    expect(screen.getByText('CAP_SYS_ADMIN')).toBeInTheDocument();
  });

  // privilege-list.md — "Several values are shown together, separated by commas, in the order given."
  it('shows several values together, comma-separated, in the order given', () => {
    render(<PrivilegeList items={[{ name: 'device', values: ['/dev/fuse', '/dev/net/tun'] }]} />);

    expect(screen.getByText('/dev/fuse, /dev/net/tun')).toBeInTheDocument();
  });

  // privilege-list.md — "A row whose values are empty — or nothing but empty strings — shows `—`
  // rather than a blank: a privilege asked for with no value is still asked for."
  it('shows a dash for a privilege asked for with no value, rather than a blank row', () => {
    render(
      <PrivilegeList
        items={[
          { name: 'device', values: [] },
          { name: 'mount', values: ['', ''] },
        ]}
      />,
    );

    const shown = rows().map((row) => row.querySelector('.ui-privilege-list__value')?.textContent);
    expect(shown).toEqual(['—', '—']);
  });

  // privilege-list.md — "emptyLabel? ... defaults to 'Nothing is being asked for.'"
  it('says nothing is being asked for when there is no privilege, and takes the wording the caller gives', () => {
    const { rerender } = render(<PrivilegeList items={[]} />);
    expect(screen.getByText('Nothing is being asked for.')).toBeInTheDocument();
    expect(rows()).toHaveLength(0);

    rerender(<PrivilegeList items={[]} emptyLabel="This plugin asks for no special privileges." />);
    expect(screen.getByText('This plugin asks for no special privileges.')).toBeInTheDocument();
  });

  // privilege-list.md — "Presentation only: it neither grants nor refuses, holds no selection and
  // offers no control."
  it('offers no control of its own: the decision belongs to the surface that hosts it', () => {
    render(<PrivilegeList items={[{ name: 'network', values: ['host'] }]} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
});
