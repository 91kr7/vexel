import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { VolumesNetworksScreen } from '../../src/volumes-networks/VolumesNetworksScreen';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
import { ErrorReportingProvider } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';
import { ToastProvider } from '../../src/ui';

function baseVolumesProps() {
  return { volumes: [], loaded: true, onRefresh: () => undefined };
}

afterEach(cleanup);

// The Volumes panel it hosts calls useConfirmation()/useToast(), so the screen
// needs the same providers Shell supplies in production — layout is what this
// test is about, not those services' own behaviour.
function renderScreen(networksPanel?: ReactNode) {
  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <VolumesNetworksScreen volumes={baseVolumesProps()} networksPanel={networksPanel} />
          </ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );
}

// volumes-networks-screen.md — a single column (the Volumes panel alone, full width) while
// networksPanel is not supplied, and two equal columns once it is
describe('VolumesNetworksScreen — layout (plan-docker_management_app/REQ-70)', () => {
  it('renders a single column when no networks panel is supplied', () => {
    renderScreen();

    const grid = document.querySelector<HTMLElement>('.ui-grid');
    expect(grid).not.toBeNull();
    expect(grid!.style.gridTemplateColumns).toBe('1fr');
  });

  it('renders two equal columns once a networks panel is supplied', () => {
    renderScreen(<div>networks placeholder</div>);

    const grid = document.querySelector<HTMLElement>('.ui-grid');
    expect(grid!.style.gridTemplateColumns).toBe('1fr 1fr');
  });
});
