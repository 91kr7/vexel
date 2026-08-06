import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  ConfirmationProvider,
  useConfirmation,
  type ConfirmationRequest,
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
