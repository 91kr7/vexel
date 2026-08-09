import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  ConfirmationProvider,
  useConfirmation,
  type ConfirmationRequest,
  type PrivilegeConfirmationRequest,
  type ScopeConfirmationRequest,
} from '../../src/shell/services/ConfirmationService';

afterEach(cleanup);

function DestructiveAction({ request, label }: { request: ConfirmationRequest; label: string }) {
  const { confirm } = useConfirmation();
  const [performed, setPerformed] = useState(false);

  const handleClick = async () => {
    const confirmed = await confirm(request);
    if (confirmed) setPerformed(true);
  };

  return (
    <div>
      <button onClick={handleClick}>{label}</button>
      <span>{performed ? 'performed' : 'not performed'}</span>
    </div>
  );
}

function renderDestructiveAction(request: ConfirmationRequest) {
  render(
    <ConfirmationProvider>
      <DestructiveAction request={request} label="Remove container" />
    </ConfirmationProvider>,
  );
}

describe('ConfirmationProvider / useConfirmation', () => {
  const request: ConfirmationRequest = {
    targetName: 'web-nginx',
    consequence: 'This will stop and remove the container.',
  };

  // plan-docker_management_app/REQ-6
  it('names the target and states the consequence when a destructive action is requested', async () => {
    const user = userEvent.setup();
    renderDestructiveAction(request);

    await user.click(screen.getByRole('button', { name: 'Remove container' }));

    expect(screen.getByRole('heading', { name: `Confirm: ${request.targetName}` })).toBeInTheDocument();
    expect(document.body.textContent).toContain(request.consequence);
  });

  // plan-docker_management_app/REQ-6
  it('performs the action once the human confirms', async () => {
    const user = userEvent.setup();
    renderDestructiveAction(request);

    await user.click(screen.getByRole('button', { name: 'Remove container' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('performed')).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-6
  it('performs no action and closes the dialog when the human cancels', async () => {
    const user = userEvent.setup();
    renderDestructiveAction(request);

    await user.click(screen.getByRole('button', { name: 'Remove container' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('not performed')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: `Confirm: ${request.targetName}` })).not.toBeInTheDocument();
  });

  // app-shell/specs/confirmation-service.md — usage outside a provider is a programming error
  it('throws when useConfirmation is called outside a ConfirmationProvider', () => {
    function Bare() {
      useConfirmation();
      return null;
    }

    expect(() => render(<Bare />)).toThrow('useConfirmation must be used within a ConfirmationProvider');
  });

  // app-shell/specs/confirmation-service.md — a second request replaces the pending one
  it('replaces the pending request when confirm() is called again before it resolves', async () => {
    const user = userEvent.setup();

    function TwoDestructiveActions() {
      const { confirm } = useConfirmation();
      return (
        <div>
          <button onClick={() => confirm({ targetName: 'first-target', consequence: 'Removes first.' })}>First</button>
          <button onClick={() => confirm({ targetName: 'second-target', consequence: 'Removes second.' })}>Second</button>
        </div>
      );
    }

    render(
      <ConfirmationProvider>
        <TwoDestructiveActions />
      </ConfirmationProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'First' }));
    await user.click(screen.getByRole('button', { name: 'Second' }));

    expect(screen.queryByRole('heading', { name: 'Confirm: first-target' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Confirm: second-target' })).toBeInTheDocument();
  });
});

const scopeOptions = [
  { id: 'stopped-containers', label: 'Stopped containers', description: '2 containers not running', note: '12.0MB' },
  { id: 'unused-volumes', label: 'Unused volumes', description: '3 volumes unattached', note: '1.0MB' },
  { id: 'build-cache', label: 'Build cache', description: 'buildx is not installed', note: '—', disabled: true },
];

/** Reports the answer confirmScope gave back, so the caller's side of the contract is observable. */
function ScopedAction({ request }: { request: ScopeConfirmationRequest }) {
  const { confirmScope } = useConfirmation();
  const [answer, setAnswer] = useState<string>('pending');

  const handleClick = async () => {
    const scope = await confirmScope(request);
    setAnswer(scope === undefined ? 'cancelled' : `scope: ${scope.join(',')}`);
  };

  return (
    <div>
      <button onClick={handleClick}>System prune…</button>
      <span>{answer}</span>
    </div>
  );
}

function renderScopedAction(overrides: Partial<ScopeConfirmationRequest> = {}) {
  render(
    <ConfirmationProvider>
      <ScopedAction
        request={{
          targetName: 'System prune',
          consequence: 'Every category selected below is pruned.',
          confirmLabel: 'Prune selected',
          scopeLabel: 'Prune scope',
          options: scopeOptions,
          ...overrides,
        }}
      />
    </ConfirmationProvider>,
  );
}

describe('useConfirmation().confirmScope (app-shell/specs/confirmation-service.md)', () => {
  // confirmation-service.md — "Options are selected as initialSelectedIds says, or all of them when
  // it is omitted."
  it('selects every option when no initial selection is given', async () => {
    const user = userEvent.setup();
    renderScopedAction();

    await user.click(screen.getByRole('button', { name: 'System prune…' }));

    for (const option of scopeOptions) {
      expect(screen.getByRole('checkbox', { name: option.label })).toBeChecked();
    }
  });

  // confirmation-service.md — "Options are selected as initialSelectedIds says"
  it('selects exactly the options the caller named', async () => {
    const user = userEvent.setup();
    renderScopedAction({ initialSelectedIds: ['unused-volumes'] });

    await user.click(screen.getByRole('button', { name: 'System prune…' }));

    expect(screen.getByRole('checkbox', { name: 'Unused volumes' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Stopped containers' })).not.toBeChecked();
  });

  // confirmation-service.md — "confirmScope resolves the chosen ids when the human confirms"
  it('resolves the chosen ids when the human confirms', async () => {
    const user = userEvent.setup();
    renderScopedAction({ initialSelectedIds: ['stopped-containers', 'unused-volumes'] });

    await user.click(screen.getByRole('button', { name: 'System prune…' }));
    await user.click(screen.getByRole('checkbox', { name: 'Stopped containers' }));
    await user.click(screen.getByRole('button', { name: 'Prune selected' }));

    expect(await screen.findByText('scope: unused-volumes')).toBeInTheDocument();
  });

  // confirmation-service.md — "and undefined when they cancel; undefined means the caller must
  // perform no action"
  it('resolves undefined when the human cancels', async () => {
    const user = userEvent.setup();
    renderScopedAction();

    await user.click(screen.getByRole('button', { name: 'System prune…' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Confirm: System prune' })).not.toBeInTheDocument();
  });

  // confirmation-service.md — "A scope confirmation cannot be confirmed with nothing selected"
  it('cannot be confirmed once every option has been unselected', async () => {
    const user = userEvent.setup();
    renderScopedAction({ initialSelectedIds: ['stopped-containers'] });

    await user.click(screen.getByRole('button', { name: 'System prune…' }));
    expect(screen.getByRole('button', { name: 'Prune selected' })).toBeEnabled();

    await user.click(screen.getByRole('checkbox', { name: 'Stopped containers' }));

    expect(screen.getByRole('button', { name: 'Prune selected' })).toBeDisabled();
  });

  // confirmation-service.md — the request's options carry their own `disabled`, and a disabled one
  // cannot be chosen
  it('leaves a disabled option unselectable', async () => {
    const user = userEvent.setup();
    renderScopedAction({ initialSelectedIds: [] });

    await user.click(screen.getByRole('button', { name: 'System prune…' }));

    expect(screen.getByRole('checkbox', { name: 'Build cache' })).toBeDisabled();
  });

  // confirmation-service.md — "Only one confirmation request is shown at a time, whichever of the
  // two kinds it is"
  it('replaces a pending plain confirmation with the scope one', async () => {
    const user = userEvent.setup();

    function BothKinds() {
      const { confirm, confirmScope } = useConfirmation();
      return (
        <div>
          <button onClick={() => confirm({ targetName: 'Stopped containers', consequence: 'Removes them.' })}>Row prune</button>
          <button
            onClick={() =>
              confirmScope({ targetName: 'System prune', consequence: 'Removes the selected ones.', options: scopeOptions })
            }
          >
            System prune…
          </button>
        </div>
      );
    }

    render(
      <ConfirmationProvider>
        <BothKinds />
      </ConfirmationProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Row prune' }));
    expect(screen.queryByRole('group')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'System prune…' }));

    expect(screen.queryByRole('heading', { name: 'Confirm: Stopped containers' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Confirm: System prune' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(scopeOptions.length);
  });

  // confirmation-service.md — "The selection lives in the service, not in the caller": a plain
  // confirmation that follows a scope one shows no leftover scope.
  it('shows no scope on a plain confirmation opened after a scope one', async () => {
    const user = userEvent.setup();

    function BothKinds() {
      const { confirm, confirmScope } = useConfirmation();
      return (
        <div>
          <button
            onClick={() =>
              confirmScope({ targetName: 'System prune', consequence: 'Removes the selected ones.', options: scopeOptions })
            }
          >
            System prune…
          </button>
          <button onClick={() => confirm({ targetName: 'Stopped containers', consequence: 'Removes them.' })}>Row prune</button>
        </div>
      );
    }

    render(
      <ConfirmationProvider>
        <BothKinds />
      </ConfirmationProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'System prune…' }));
    await user.click(screen.getByRole('button', { name: 'Row prune' }));

    expect(screen.getByRole('heading', { name: 'Confirm: Stopped containers' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });
});

const askedFor = [
  { name: 'network', description: 'permissions to access a network', values: ['host'] },
  { name: 'mount', description: 'host path to mount', values: ['/var/lib/docker/plugins'] },
  { name: 'capabilities', description: 'list of additional capabilities required', values: ['CAP_SYS_ADMIN'] },
];

/** Reports what confirmPrivileges answered, so the caller's side of the contract is observable. */
function GrantingAction({ request }: { request: PrivilegeConfirmationRequest }) {
  const { confirmPrivileges } = useConfirmation();
  const [answer, setAnswer] = useState<string>('pending');

  const handleClick = async () => {
    setAnswer((await confirmPrivileges(request)) ? 'granted' : 'not granted');
  };

  return (
    <div>
      <button onClick={handleClick}>Review privileges</button>
      <span>{answer}</span>
    </div>
  );
}

function renderGrantingAction(overrides: Partial<PrivilegeConfirmationRequest> = {}) {
  render(
    <ConfirmationProvider>
      <GrantingAction
        request={{
          targetName: 'vieux/sshfs:latest',
          consequence: 'Installing it lets it run on this host with everything listed below.',
          confirmLabel: 'Grant and install',
          destructive: false,
          privileges: askedFor,
          ...overrides,
        }}
      />
    </ConfirmationProvider>,
  );
}

describe('useConfirmation().confirmPrivileges (app-shell/specs/confirmation-service.md)', () => {
  // confirmation-service.md — "showing what the target asks to be allowed to do before it can be
  // granted (REQ-99)"; plan-docker_management_app/REQ-99
  it('names the target and shows every privilege it asks for, with its value', async () => {
    const user = userEvent.setup();
    renderGrantingAction();

    await user.click(screen.getByRole('button', { name: 'Review privileges' }));

    expect(screen.getByRole('heading', { name: 'Confirm: vieux/sshfs:latest' })).toBeInTheDocument();
    for (const privilege of askedFor) {
      expect(screen.getByText(privilege.name)).toBeInTheDocument();
      expect(screen.getByText(privilege.values.join(', '))).toBeInTheDocument();
    }
  });

  // confirmation-service.md — "confirmPrivileges resolves true only on an explicit confirmation"
  it('resolves true only once the human grants explicitly', async () => {
    const user = userEvent.setup();
    renderGrantingAction();

    await user.click(screen.getByRole('button', { name: 'Review privileges' }));
    expect(screen.getByText('pending')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Grant and install' }));

    expect(await screen.findByText('granted')).toBeInTheDocument();
  });

  // confirmation-service.md — "false on cancel; false means nothing is granted and the caller must
  // perform no action"
  it('resolves false when the human cancels, granting nothing', async () => {
    const user = userEvent.setup();
    renderGrantingAction();

    await user.click(screen.getByRole('button', { name: 'Review privileges' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('not granted')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Confirm: vieux/sshfs:latest' })).not.toBeInTheDocument();
  });

  // confirmation-service.md — "noPrivilegesLabel" is said in place of the list when the action asks
  // for nothing; the grant is still explicit.
  it('says the action asks for nothing when it asks for nothing, and still asks for a grant', async () => {
    const user = userEvent.setup();
    renderGrantingAction({ privileges: [], noPrivilegesLabel: 'This plugin asks for no special privileges.' });

    await user.click(screen.getByRole('button', { name: 'Review privileges' }));

    expect(screen.getByText('This plugin asks for no special privileges.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Grant and install' }));
    expect(await screen.findByText('granted')).toBeInTheDocument();
  });

  // confirmation-service.md — "A grant is not a destruction: the caller decides the button's tone
  // through destructive, as with any other request."
  it('takes the tone the caller asks for rather than assuming a destruction', async () => {
    const user = userEvent.setup();
    renderGrantingAction();

    await user.click(screen.getByRole('button', { name: 'Review privileges' }));

    const grant = screen.getByRole('button', { name: 'Grant and install' });
    expect(grant.className).not.toContain('destructive');
  });

  // confirmation-service.md — "Only one confirmation request is shown at a time, whichever of the
  // three kinds it is", and the previous kind leaves nothing behind.
  it('replaces a pending privilege request, and leaves no privilege behind on the next plain one', async () => {
    const user = userEvent.setup();

    function ThreeKinds() {
      const { confirm, confirmPrivileges } = useConfirmation();
      return (
        <div>
          <button
            onClick={() =>
              confirmPrivileges({ targetName: 'vieux/sshfs:latest', consequence: 'It runs with these.', privileges: askedFor })
            }
          >
            Grant…
          </button>
          <button onClick={() => confirm({ targetName: 'vieux/sshfs:latest', consequence: 'Removes it.' })}>Remove</button>
        </div>
      );
    }

    render(
      <ConfirmationProvider>
        <ThreeKinds />
      </ConfirmationProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Grant…' }));
    expect(screen.getByText('network')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.getByRole('heading', { name: 'Confirm: vieux/sshfs:latest' })).toBeInTheDocument();
    expect(screen.queryByText('network')).not.toBeInTheDocument();
    expect(screen.queryByText('CAP_SYS_ADMIN')).not.toBeInTheDocument();
  });
});
