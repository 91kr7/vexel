import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../src/ui';
import { PlaceholderScreen } from '../../src/shell/screens/PlaceholderScreen';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';

// Since batch 30 every screen of the navigation data has content of its own, so
// the Shell renders the placeholder only for an active id naming none of them
// (placeholder-screen.md) and no navigation path reaches it. Its contract — and
// the foundation batch's REQ-6 demo it carries — is therefore exercised by
// mounting the component itself. The destructive confirmation is verified
// end-to-end elsewhere, on the real destructive actions of the product.

afterEach(cleanup);

function renderPlaceholder(screenLabel = 'Some future screen') {
  render(
    <ToastProvider>
      <ConfirmationProvider>
        <PlaceholderScreen screenLabel={screenLabel} />
      </ConfirmationProvider>
    </ToastProvider>,
  );
}

describe('PlaceholderScreen (app-shell/specs/placeholder-screen.md)', () => {
  // placeholder-screen.md — "renders an EmptyState naming screenLabel as not built yet"
  it('names the screen it stands in for as not built yet', () => {
    renderPlaceholder('Some future screen');

    expect(screen.getByText(/Some future screen is not built yet/)).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-6; placeholder-screen.md — "on click: calls confirm({ targetName:
  // 'demo-container', … })"
  it('asks for confirmation naming the target before removing anything', async () => {
    const user = userEvent.setup();
    renderPlaceholder();

    await user.click(screen.getByRole('button', { name: 'Remove demo-container' }));

    expect(screen.getByRole('heading', { name: 'Confirm: demo-container' })).toBeInTheDocument();
  });

  // plan-docker_management_app/REQ-6; placeholder-screen.md — "if the human cancels: nothing else
  // happens, the button stays labeled 'Remove demo-container'"; "No visible effect occurs before the
  // confirmation resolves true"
  it('does nothing at all when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    renderPlaceholder();

    await user.click(screen.getByRole('button', { name: 'Remove demo-container' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Remove demo-container' })).toBeEnabled();
    expect(screen.queryByText('demo-container removed')).not.toBeInTheDocument();
  });

  // placeholder-screen.md — "if the human confirms: the button becomes disabled and reads
  // 'demo-container removed'; a toast is pushed announcing the removal"
  it('performs the demo removal once confirmed, and announces it', async () => {
    const user = userEvent.setup();
    renderPlaceholder();

    await user.click(screen.getByRole('button', { name: 'Remove demo-container' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByRole('button', { name: 'demo-container removed' })).toBeDisabled();
    expect(screen.getAllByText('demo-container removed').length).toBeGreaterThan(1);
  });
});
